import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
import { webullRequest } from './webullAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const TOKEN_FILE = path.join(__dirname, '.webull-token.json');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config();

const PORT = parseInt(process.env.WEBULL_API_PORT || '8789', 10);
const APP_KEY = process.env.WEBULL_APP_KEY || '';
const APP_SECRET = process.env.WEBULL_APP_SECRET || '';
const API_HOST = (process.env.WEBULL_API_HOST || 'api.webull.com').replace(/^https?:\/\//, '');
const BASE_URL = `https://${API_HOST}`;

const webullConfig = { appKey: APP_KEY, appSecret: APP_SECRET, host: API_HOST, baseUrl: BASE_URL };

let accessToken = process.env.WEBULL_ACCESS_TOKEN || '';
let tokenMeta = { status: null, expires: null };

function loadStoredToken() {
  if (accessToken) return;
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const stored = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      if (stored?.token) {
        accessToken = stored.token;
        tokenMeta = { status: stored.status || null, expires: stored.expires || null };
        console.log('[webull] Loaded stored access token');
      }
    }
  } catch (error) {
    console.warn('[webull] Could not load token file:', error.message);
  }
}

function saveToken(token, status, expires) {
  accessToken = token;
  tokenMeta = { status, expires };
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token, status, expires, savedAt: new Date().toISOString() }, null, 2));
  } catch (error) {
    console.warn('[webull] Could not persist token:', error.message);
  }
}

loadStoredToken();

let yahooFinance;
try {
  yahooFinance = new YahooFinance();
} catch (error) {
  console.error('[webull] Failed to initialize yahoo-finance2 for chain discovery:', error.message);
}

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://msrafi.github.io',
  /^https:\/\/.*\.railway\.app$/,
  /^https:\/\/.*\.up\.railway\.app$/,
];

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = ALLOWED_ORIGINS.some((o) => (typeof o === 'string' ? o === origin : o.test(origin)));
    callback(allowed ? null : new Error(`CORS blocked: ${origin}`), allowed);
  },
  credentials: false,
}));
app.use(express.json());

function credentialsConfigured() {
  return Boolean(APP_KEY && APP_SECRET);
}

function requireCredentials(_req, res, next) {
  if (!credentialsConfigured()) {
    res.status(503).json({
      error: 'Webull credentials missing',
      message: 'Set WEBULL_APP_KEY and WEBULL_APP_SECRET in .env.local',
    });
    return;
  }
  next();
}

function requireActiveToken(_req, res, next) {
  if (!accessToken) {
    res.status(401).json({
      error: 'No access token',
      message: 'POST /api/webull/auth/token/create, verify in Webull app, then retry',
    });
    return;
  }
  if (tokenMeta.status && tokenMeta.status !== 'NORMAL') {
    res.status(401).json({
      error: 'Token not active',
      status: tokenMeta.status,
      message: tokenMeta.status === 'PENDING'
        ? 'Verify the SMS code in the Webull mobile app'
        : 'Create a new token via POST /api/webull/auth/token/create',
    });
    return;
  }
  next();
}

async function createToken() {
  return webullRequest(webullConfig, {
    method: 'POST',
    path: '/openapi/auth/token/create',
  });
}

async function checkToken(token) {
  return webullRequest(webullConfig, {
    method: 'POST',
    path: '/openapi/auth/token/check',
    body: { token },
  });
}

async function fetchOptionSnapshots(symbols) {
  return webullRequest(webullConfig, {
    method: 'GET',
    path: '/openapi/market-data/option/snapshot',
    queryParams: {
      symbols: symbols.join(','),
      category: 'US_OPTION',
    },
    accessToken,
  });
}

async function fetchStockSnapshot(symbol) {
  return webullRequest(webullConfig, {
    method: 'GET',
    path: '/openapi/market-data/stock/snapshot',
    queryParams: {
      symbols: symbol,
      category: 'US_STOCK',
    },
    accessToken,
  });
}

function parseNum(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchYahooChain(symbol, date) {
  const fetchWithTimeout = async (promise, timeoutMs = 15000) => {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Yahoo request timeout')), timeoutMs));
    return Promise.race([promise, timeout]);
  };

  const initial = await fetchWithTimeout(yahooFinance.options(symbol, date ? { date } : undefined));
  const expirationDates = (initial.expirationDates || [])
    .map((expiry) => {
      const ms = new Date(expiry).getTime();
      return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
    })
    .filter((expiry) => expiry !== null);

  let result = initial;
  const initialBucket = initial.options?.[0] || {};
  const hasContracts = (initialBucket.calls?.length || 0) + (initialBucket.puts?.length || 0) > 0;

  if (!hasContracts && expirationDates.length > 0) {
    const fallbackDate = date
      ? expirationDates.reduce((closest, current) =>
          Math.abs(current - date) < Math.abs(closest - date) ? current : closest, expirationDates[0])
      : expirationDates[0];
    result = await fetchWithTimeout(yahooFinance.options(symbol, { date: fallbackDate }));
  }

  return { result, expirationDates };
}

function mergeSnapshot(contract, snapshotBySymbol) {
  const snap = snapshotBySymbol.get(contract.contractSymbol);
  if (!snap) return contract;

  const changeRatio = parseNum(snap.change_ratio);
  return {
    ...contract,
    lastPrice: parseNum(snap.price, contract.lastPrice),
    bid: parseNum(snap.bid, contract.bid),
    ask: parseNum(snap.ask, contract.ask),
    volume: parseNum(snap.volume, contract.volume),
    openInterest: parseNum(snap.open_interest, contract.openInterest),
    impliedVolatility: parseNum(snap.imp_vol, contract.impliedVolatility),
    change: parseNum(snap.change, contract.change),
    percentChange: changeRatio !== 0 ? changeRatio * 100 : contract.percentChange,
  };
}

async function enrichChainWithWebull(bucket, underlyingPrice) {
  const contracts = [...(bucket.calls || []), ...(bucket.puts || [])];
  const symbols = contracts.map((c) => c.contractSymbol).filter(Boolean);
  const snapshotBySymbol = new Map();

  const BATCH = 20;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const { ok, status, json } = await fetchOptionSnapshots(batch);
    if (!ok) {
      throw new Error(`Webull option snapshot failed (${status}): ${JSON.stringify(json).slice(0, 240)}`);
    }
    const rows = Array.isArray(json) ? json : [];
    for (const row of rows) {
      if (row?.symbol) snapshotBySymbol.set(row.symbol, row);
    }
    if (i + BATCH < symbols.length) {
      await sleep(1100);
    }
  }

  return {
    calls: (bucket.calls || []).map((c) => mergeSnapshot(c, snapshotBySymbol)),
    puts: (bucket.puts || []).map((c) => mergeSnapshot(c, snapshotBySymbol)),
    webullQuotes: snapshotBySymbol.size,
    totalContracts: symbols.length,
  };
}

app.get('/', (_req, res) => {
  res.json({
    service: 'webull-options-api',
    version: '1.0.0',
    status: 'running',
    credentials: credentialsConfigured(),
    tokenStatus: tokenMeta.status,
    endpoints: {
      health: '/health',
      status: '/api/webull/status',
      tokenCreate: 'POST /api/webull/auth/token/create',
      tokenCheck: 'POST /api/webull/auth/token/check',
      options: '/api/webull/options/:symbol',
    },
  });
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'webull-options-api',
    credentials: credentialsConfigured(),
    tokenStatus: tokenMeta.status,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/webull/status', requireCredentials, async (_req, res) => {
  let token = { configured: Boolean(accessToken), status: tokenMeta.status, expires: tokenMeta.expires };

  if (accessToken) {
    try {
      const { ok, json } = await checkToken(accessToken);
      if (ok && json?.status) {
        token = { configured: true, status: json.status, expires: json.expires, token: `${accessToken.slice(0, 6)}…` };
        saveToken(json.token || accessToken, json.status, json.expires);
      }
    } catch (error) {
      token.checkError = error.message;
    }
  }

  res.json({
    ok: true,
    host: API_HOST,
    credentials: credentialsConfigured(),
    token,
    chainDiscovery: 'yahoo',
    quotes: 'webull',
  });
});

app.post('/api/webull/auth/token/create', requireCredentials, async (_req, res) => {
  try {
    const { ok, status, json } = await createToken();
    if (!ok) {
      res.status(status).json({ error: 'Token create failed', details: json });
      return;
    }
    saveToken(json.token, json.status, json.expires);
    res.json({
      ok: true,
      status: json.status,
      expires: json.expires,
      message: json.status === 'PENDING'
        ? 'Check your phone — enter the SMS code in the Webull app to activate this token'
        : 'Token ready',
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post('/api/webull/auth/token/check', requireCredentials, async (req, res) => {
  const token = String(req.body?.token || accessToken || '').trim();
  if (!token) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  try {
    const { ok, status, json } = await checkToken(token);
    if (!ok) {
      res.status(status).json({ error: 'Token check failed', details: json });
      return;
    }
    saveToken(json.token || token, json.status, json.expires);
    res.json({ ok: true, status: json.status, expires: json.expires });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get('/api/webull/options/:symbol', requireCredentials, requireActiveToken, async (req, res) => {
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  const rawDate = req.query.date;
  const date = rawDate ? Number(rawDate) : undefined;

  if (!symbol) {
    res.status(400).json({ error: 'Missing symbol' });
    return;
  }
  if (!yahooFinance) {
    res.status(503).json({ error: 'Chain discovery unavailable (yahoo-finance2 not initialized)' });
    return;
  }

  try {
    console.log(`[webull] Chain for ${symbol}${date ? ` expiry=${date}` : ''}`);
    const { result, expirationDates } = await fetchYahooChain(symbol, date);
    const bucket = result.options?.[0] || {};
    const enriched = await enrichChainWithWebull(bucket, result.quote?.regularMarketPrice ?? null);

    let underlyingPrice = result.quote?.regularMarketPrice ?? null;
    try {
      const stockSnap = await fetchStockSnapshot(symbol);
      if (stockSnap.ok && Array.isArray(stockSnap.json) && stockSnap.json[0]?.price) {
        underlyingPrice = parseNum(stockSnap.json[0].price, underlyingPrice);
      }
    } catch {
      // keep Yahoo underlying price
    }

    const normalized = {
      optionChain: {
        result: [
          {
            quote: {
              symbol: result.quote?.symbol || symbol,
              regularMarketPrice: underlyingPrice,
            },
            expirationDates,
            options: [{ calls: enriched.calls, puts: enriched.puts }],
          },
        ],
      },
      meta: {
        provider: 'webull+yahoo',
        webullQuotes: enriched.webullQuotes,
        totalContracts: enriched.totalContracts,
      },
    };

    console.log(`[webull] ${symbol}: ${enriched.webullQuotes}/${enriched.totalContracts} contracts quoted`);
    res.json(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Webull fetch error';
    console.error(`[webull] ERROR ${symbol}:`, message);
    res.status(502).json({ error: 'fetch failed', message, symbol });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[webull] Webull options API on http://0.0.0.0:${PORT}`);
  console.log(`[webull] Host: ${API_HOST}, credentials: ${credentialsConfigured() ? 'yes' : 'NO'}`);
  if (!credentialsConfigured()) {
    console.warn('[webull] Add WEBULL_APP_KEY and WEBULL_APP_SECRET to .env.local');
  } else if (!accessToken) {
    console.warn('[webull] No token yet — POST /api/webull/auth/token/create then verify in Webull app');
  } else {
    console.log(`[webull] Token loaded (status: ${tokenMeta.status || 'unknown'})`);
  }
});
