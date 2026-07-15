import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
import {
  fetchRobinhoodOptions,
  hasOptionContracts,
  isRobinhoodConfigured,
} from './robinhoodClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config();

// Railway sets PORT; fall back to YAHOO_API_PORT for local dev
const PORT = parseInt(process.env.PORT || process.env.YAHOO_API_PORT || '8788', 10);
console.log(`[startup] PORT=${PORT}, NODE_ENV=${process.env.NODE_ENV}, node=${process.version}`);

// Initialize yahoo-finance2
let yahooFinance;
try {
  yahooFinance = new YahooFinance();
  console.log('[startup] yahoo-finance2 initialized OK');
} catch (error) {
  console.error('[startup] FATAL: Failed to initialize yahoo-finance2:', error);
  console.error('[startup] Stack:', error.stack);
  process.exit(1);
}

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://msrafi.github.io',
  // Also allow any Railway preview URLs during testing
  /^https:\/\/.*\.railway\.app$/,
  /^https:\/\/.*\.up\.railway\.app$/,
];

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server)
    if (!origin) return callback(null, true);
    const allowed = ALLOWED_ORIGINS.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    callback(allowed ? null : new Error(`CORS blocked: ${origin}`), allowed);
  },
  credentials: false,
  exposedHeaders: ['X-Cache', 'X-Data-Source'],
}));

function unwrapNumeric(field, fallback = 0) {
  if (field && typeof field === 'object' && typeof field.raw === 'number') {
    return field.raw;
  }
  if (typeof field === 'number') return field;
  return fallback;
}

const CACHE_TTL_MS = parseInt(process.env.YAHOO_CACHE_TTL_MS || '120000', 10);
const STALE_MAX_MS = parseInt(process.env.YAHOO_STALE_MAX_MS || '900000', 10);
const YAHOO_MIN_GAP_MS = parseInt(process.env.YAHOO_MIN_GAP_MS || '1500', 10);

/** @type {Map<string, { data: object, fetchedAt: number, source: string }>} */
const optionsCache = new Map();
/** @type {Map<string, Promise<object>>} */
const inFlightOptions = new Map();
let lastYahooRequestAt = 0;

function cacheKey(symbol, date) {
  return `${symbol}:${date ?? 'nearest'}`;
}

function getCachedOptions(key, allowStale = false) {
  const entry = optionsCache.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.fetchedAt;
  if (age <= CACHE_TTL_MS) {
    return { data: entry.data, stale: false, ageMs: age, source: entry.source };
  }
  if (allowStale && age <= STALE_MAX_MS) {
    return { data: entry.data, stale: true, ageMs: age, source: entry.source };
  }
  return null;
}

function setCachedOptions(key, data, source = 'yahoo') {
  optionsCache.set(key, { data, fetchedAt: Date.now(), source });
  if (optionsCache.size > 200) {
    const oldestKey = optionsCache.keys().next().value;
    if (oldestKey) optionsCache.delete(oldestKey);
  }
}

function isRateLimitError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|too many requests|rate.?limit|crumb/i.test(message);
}

async function waitForYahooSlot() {
  const waitMs = Math.max(0, YAHOO_MIN_GAP_MS - (Date.now() - lastYahooRequestAt));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastYahooRequestAt = Date.now();
}

async function fetchWithTimeout(promise, timeoutMs = 15000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
  );
  return Promise.race([promise, timeout]);
}

async function fetchYahooOptions(symbol, date, attempt = 1) {
  const maxAttempts = 4;
  try {
    await waitForYahooSlot();
    const initial = await fetchWithTimeout(
      yahooFinance.options(symbol, date ? { date } : undefined)
    );

    const expirationDates = (initial.expirationDates || [])
      .map((expiry) => {
        const ms = new Date(expiry).getTime();
        return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
      })
      .filter((expiry) => expiry !== null);

    let result = initial;
    const initialOptionBucket = initial.options?.[0] || {};
    const hasContracts = (initialOptionBucket.calls?.length || 0) + (initialOptionBucket.puts?.length || 0) > 0;

    if (!hasContracts && expirationDates.length > 0) {
      const fallbackDate = date
        ? expirationDates.reduce((closest, current) =>
            Math.abs(current - date) < Math.abs(closest - date) ? current : closest, expirationDates[0])
        : expirationDates[0];
      await waitForYahooSlot();
      result = await fetchWithTimeout(yahooFinance.options(symbol, { date: fallbackDate }));
    }

    const bucket = result.options?.[0] || {};
    return {
      optionChain: {
        result: [
          {
            quote: {
              symbol: result.quote?.symbol || symbol,
              regularMarketPrice: result.quote?.regularMarketPrice ?? null,
            },
            expirationDates,
            options: [{ calls: bucket.calls || [], puts: bucket.puts || [] }],
          },
        ],
      },
    };
  } catch (error) {
    if (attempt < maxAttempts && isRateLimitError(error)) {
      const backoffMs = attempt * attempt * 2000;
      console.warn(`[options] Rate limited for ${symbol}, retry ${attempt}/${maxAttempts - 1} in ${backoffMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return fetchYahooOptions(symbol, date, attempt + 1);
    }
    throw error;
  }
}

async function getYahooOptionsPayload(symbol, date) {
  const key = cacheKey(symbol, date);
  const fresh = getCachedOptions(key, false);
  if (fresh) {
    return { payload: fresh.data, cache: 'HIT', source: fresh.source || 'cache' };
  }

  let pending = inFlightOptions.get(key);
  if (!pending) {
    pending = fetchYahooOptions(symbol, date)
      .then((payload) => {
        setCachedOptions(key, payload, 'yahoo');
        return payload;
      })
      .finally(() => {
        inFlightOptions.delete(key);
      });
    inFlightOptions.set(key, pending);
  }

  const payload = await pending;
  return { payload, cache: 'MISS', source: 'yahoo' };
}

async function getRobinhoodOptionsPayload(symbol, date) {
  const key = cacheKey(symbol, date);
  const payload = await fetchRobinhoodOptions(symbol, date);
  setCachedOptions(key, payload, 'robinhood');
  return { payload, cache: 'MISS', source: 'robinhood' };
}

function isRobinhoodPrimary() {
  const value = (process.env.ROBINHOOD_PRIMARY || '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

function getOptionsSourceLabel() {
  if (isRobinhoodPrimary() && isRobinhoodConfigured()) {
    return 'robinhood-primary+yahoo-fallback';
  }
  if (isRobinhoodConfigured()) {
    return 'yahoo-primary+robinhood-fallback';
  }
  return 'yahoo-only';
}

async function getOptionsPayloadWithFallback(symbol, date) {
  const key = cacheKey(symbol, date);
  const fresh = getCachedOptions(key, false);
  if (fresh) {
    return { payload: fresh.data, cache: 'HIT', source: fresh.source || 'cache' };
  }

  const robinhoodFirst = isRobinhoodPrimary() && isRobinhoodConfigured();
  let primaryError = null;

  if (robinhoodFirst) {
    try {
      const robinhoodResult = await getRobinhoodOptionsPayload(symbol, date);
      if (hasOptionContracts(robinhoodResult.payload)) {
        return robinhoodResult;
      }
      primaryError = new Error('Robinhood returned an empty options chain');
      console.warn(`[options] Robinhood empty chain for ${symbol}, trying Yahoo fallback`);
    } catch (error) {
      primaryError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[options] Robinhood failed for ${symbol}: ${message}`);
    }
  } else {
    try {
      const yahooResult = await getYahooOptionsPayload(symbol, date);
      if (hasOptionContracts(yahooResult.payload)) {
        return yahooResult;
      }
      primaryError = new Error('Yahoo returned an empty options chain');
      console.warn(`[options] Yahoo empty chain for ${symbol}, trying Robinhood fallback`);
    } catch (error) {
      primaryError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[options] Yahoo failed for ${symbol}: ${message}`);
    }
  }

  if (robinhoodFirst) {
    try {
      console.log(`[options] Fetching ${symbol} from Yahoo (fallback)`);
      const yahooResult = await getYahooOptionsPayload(symbol, date);
      if (hasOptionContracts(yahooResult.payload)) {
        return yahooResult;
      }
      primaryError = new Error('Yahoo fallback returned an empty options chain');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[options] Yahoo fallback failed for ${symbol}: ${message}`);
      primaryError = error;
    }
  } else if (isRobinhoodConfigured()) {
    try {
      console.log(`[options] Fetching ${symbol} from Robinhood (fallback)`);
      return await getRobinhoodOptionsPayload(symbol, date);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[options] Robinhood fallback failed for ${symbol}: ${message}`);
      primaryError = error;
    }
  }

  const stale = getCachedOptions(key, true);
  if (stale) {
    return { payload: stale.data, cache: 'STALE', source: stale.source || 'cache' };
  }

  throw primaryError || new Error(`Failed to fetch options for ${symbol}`);
}

// Root endpoint
app.get('/', (_req, res) => {
  res.json({ 
    service: 'options-data-api',
    version: '1.1.0',
    status: 'running',
    robinhoodConfigured: isRobinhoodConfigured(),
    robinhoodPrimary: isRobinhoodPrimary(),
    optionsSource: getOptionsSourceLabel(),
    endpoints: {
      health: '/health',
      options: '/api/yahoo/options/:symbol',
      robinhoodOptions: '/api/robinhood/options/:symbol',
      mostActive: '/api/yahoo/most-active'
    }
  });
});

// Health check endpoint (used by Railway)
app.get('/health', (_req, res) => {
  try {
    res.status(200).json({ 
      ok: true, 
      service: 'options-data-api',
      robinhoodConfigured: isRobinhoodConfigured(),
    robinhoodPrimary: isRobinhoodPrimary(),
    optionsSource: getOptionsSourceLabel(),
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    console.error('[health] Health check error:', error);
    res.status(500).json({ ok: false, error: 'Health check failed' });
  }
});

async function handleOptionsRequest(req, res, { forceRobinhood = false } = {}) {
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  const rawDate = req.query.date;
  const date = rawDate ? Number(rawDate) : undefined;

  if (!symbol) {
    res.status(400).json({ error: 'Missing symbol' });
    return;
  }

  if (forceRobinhood && !isRobinhoodConfigured()) {
    res.status(503).json({
      error: 'robinhood_not_configured',
      message:
        'Set ROBINHOOD_BROKERAGE_TOKEN in .env.local. Run: npm run robinhood-token-help',
      symbol,
    });
    return;
  }

  try {
    console.log(
      `[options] Fetching options for ${symbol}${date ? ` (date: ${date})` : ''} via ${forceRobinhood ? 'robinhood' : getOptionsSourceLabel()}`
    );

    const { payload, cache, source } = forceRobinhood
      ? await getRobinhoodOptionsPayload(symbol, date)
      : await getOptionsPayloadWithFallback(symbol, date);

    res.setHeader('X-Cache', cache);
    res.setHeader('X-Data-Source', source);
    console.log(`[options] Successfully fetched options for ${symbol} (${cache}, ${source})`);
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown options fetch error';
    const rateLimited = isRateLimitError(error);

    console.error(`[options] ❌ ERROR fetching ${symbol}:`, message);
    res.status(rateLimited ? 503 : 502).json({
      error: rateLimited ? 'yahoo_rate_limited' : 'fetch failed',
      message: rateLimited
        ? 'Yahoo Finance is rate-limiting this server. Configure ROBINHOOD_BROKERAGE_TOKEN for automatic live fallback.'
        : message,
      symbol,
      robinhoodConfigured: isRobinhoodConfigured(),
    robinhoodPrimary: isRobinhoodPrimary(),
    optionsSource: getOptionsSourceLabel(),
      timestamp: new Date().toISOString(),
      details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
    });
  }
}

app.get('/api/yahoo/options/:symbol', (req, res) => {
  handleOptionsRequest(req, res);
});

app.get('/api/robinhood/options/:symbol', (req, res) => {
  handleOptionsRequest(req, res, { forceRobinhood: true });
});

app.get('/api/yahoo/most-active', async (req, res) => {
  const count = Math.min(Math.max(parseInt(String(req.query.count || '100'), 10), 1), 250);
  const symbolFilter = String(req.query.symbol || '').trim().toUpperCase();

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=most_actives_options&count=${count}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!response.ok) {
      const body = await response.text();
      res.status(response.status).json({ error: body.slice(0, 240) });
      return;
    }

    const payload = await response.json();
    const quotes = payload?.finance?.result?.[0]?.quotes || [];

    const normalized = quotes.map((quote) => ({
      contractSymbol: quote.symbol || '',
      underlyingSymbol: quote.underlyingSymbol || '',
      optionType: quote.optionType || '',
      strike: unwrapNumeric(quote.strike),
      expiration: unwrapNumeric(quote.expireDate),
      price: unwrapNumeric(quote.regularMarketPrice),
      bid: unwrapNumeric(quote.bid),
      ask: unwrapNumeric(quote.ask),
      volume: unwrapNumeric(quote.regularMarketVolume),
      openInterest: unwrapNumeric(quote.openInterest),
      impliedVolatility: unwrapNumeric(quote.impliedVolatility),
      percentChange: unwrapNumeric(quote.regularMarketChangePercent),
      change: unwrapNumeric(quote.regularMarketChange),
      currency: quote.currency || 'USD'
    }));

    const filtered = symbolFilter
      ? normalized.filter((row) => row.underlyingSymbol === symbolFilter)
      : normalized;

    res.json({
      count: filtered.length,
      rows: filtered
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Yahoo most-active fetch error';
    res.status(502).json({ error: message });
  }
});

// Error handling middleware (must be after all routes)
app.use((err, req, res, next) => {
  console.error('[express] Unhandled error:', err);
  console.error('[express] Stack:', err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// Global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise Rejection:', reason);
  console.error('[FATAL] Promise:', promise);
});

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
  console.error('[FATAL] Stack:', error.stack);
  process.exit(1);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[startup] ✅ Server successfully started`);
  console.log(`[startup] 📈 Options API listening on http://0.0.0.0:${PORT}`);
  console.log(`[startup] Options source mode: ${getOptionsSourceLabel()}`);
  console.log(`[startup] Health check available at: http://0.0.0.0:${PORT}/health`);
  
  // More aggressive keep-alive strategy for Railway free tier
  const keepAliveEnabled = process.env.RAILWAY_ENVIRONMENT || process.env.RENDER;
  if (keepAliveEnabled) {
    const KEEP_ALIVE_INTERVAL = 2 * 60 * 1000; // 2 minutes (more aggressive)
    
    // Function to ping self
    const keepAlive = () => {
      fetch(`http://localhost:${PORT}/health`)
        .then(res => res.json())
        .then(data => console.log('[keep-alive] ✓ Self-ping successful, uptime:', data.uptime))
        .catch(err => console.error('[keep-alive] ✗ Self-ping failed:', err.message));
    };
    
    // Start pinging immediately after 30 seconds, then every 2 minutes
    setTimeout(() => {
      console.log('[keep-alive] 🚀 Starting first ping...');
      keepAlive();
      setInterval(keepAlive, KEEP_ALIVE_INTERVAL);
    }, 30000);
    
    console.log('[startup] 💚 Keep-alive enabled (ping every 2min)');
  }
}).on('error', (err) => {
  console.error('[startup] ❌ Failed to bind port:', err);
  process.exit(1);
});
