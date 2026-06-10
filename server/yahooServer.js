import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config();

// Railway sets PORT; fall back to YAHOO_API_PORT for local dev
const PORT = parseInt(process.env.PORT || process.env.YAHOO_API_PORT || '8788', 10);
console.log(`[startup] PORT=${PORT}, NODE_ENV=${process.env.NODE_ENV}, node=${process.version}`);

// Initialize yahoo-finance2
const yahooFinance = new YahooFinance();
console.log('[startup] yahoo-finance2 initialized OK');

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
}));

function unwrapNumeric(field, fallback = 0) {
  if (field && typeof field === 'object' && typeof field.raw === 'number') {
    return field.raw;
  }
  if (typeof field === 'number') return field;
  return fallback;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'yahoo-options-api' });
});

app.get('/api/yahoo/options/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  const rawDate = req.query.date;
  const date = rawDate ? Number(rawDate) : undefined;

  if (!symbol) {
    res.status(400).json({ error: 'Missing symbol' });
    return;
  }

  try {
    console.log(`[options] Fetching options for ${symbol}${date ? ` (date: ${date})` : ''}`);
    const initial = await yahooFinance.options(symbol, date ? { date } : undefined);

    const expirationDates = (initial.expirationDates || [])
      .map((expiry) => {
        const ms = new Date(expiry).getTime();
        return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
      })
      .filter((expiry) => expiry !== null);

    let result = initial;
    const initialOptionBucket = initial.options?.[0] || {};
    const hasContracts = (initialOptionBucket.calls?.length || 0) + (initialOptionBucket.puts?.length || 0) > 0;

    // Yahoo often returns expiration dates first and requires a second call with date.
    if (!hasContracts && expirationDates.length > 0) {
      const fallbackDate = date
        ? expirationDates.reduce((closest, current) => {
            return Math.abs(current - date) < Math.abs(closest - date) ? current : closest;
          }, expirationDates[0])
        : expirationDates[0];
      result = await yahooFinance.options(symbol, { date: fallbackDate });
    }

    const bucket = result.options?.[0] || {};
    const normalized = {
      optionChain: {
        result: [
          {
            quote: {
              symbol: result.quote?.symbol || symbol,
              regularMarketPrice: result.quote?.regularMarketPrice ?? null
            },
            expirationDates,
            options: [
              {
                calls: bucket.calls || [],
                puts: bucket.puts || []
              }
            ]
          }
        ]
      }
    };

    console.log(`[options] Successfully fetched options for ${symbol}`);
    res.json(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Yahoo options fetch error';
    console.error(`[options] ERROR fetching ${symbol}:`, error);
    console.error(`[options] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    res.status(502).json({ 
      error: message,
      symbol,
      timestamp: new Date().toISOString()
    });
  }
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`📈 Yahoo options API listening on http://0.0.0.0:${PORT}`);
}).on('error', (err) => {
  console.error('[startup] Failed to bind port:', err);
  process.exit(1);
});
