const RH_BASE = 'https://api.robinhood.com';
const RH_MIN_GAP_MS = parseInt(process.env.ROBINHOOD_MIN_GAP_MS || '200', 10);
const RH_MARKETDATA_BATCH_SIZE = parseInt(process.env.ROBINHOOD_MARKETDATA_BATCH_SIZE || '40', 10);

let lastRobinhoodRequestAt = 0;

function getRobinhoodToken() {
  return process.env.ROBINHOOD_BROKERAGE_TOKEN || '';
}

const RH_HEADERS_BASE = {
  Accept: 'application/json',
  'X-Robinhood-API-Version': '1.431.4',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

export function isRobinhoodConfigured() {
  return Boolean(getRobinhoodToken().trim());
}

async function waitForRobinhoodSlot() {
  const waitMs = Math.max(0, RH_MIN_GAP_MS - (Date.now() - lastRobinhoodRequestAt));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRobinhoodRequestAt = Date.now();
}

async function rhFetch(url, { retryOnUnauthorized = true } = {}) {
  if (!isRobinhoodConfigured()) {
    throw new Error('ROBINHOOD_BROKERAGE_TOKEN is not configured');
  }

  await waitForRobinhoodSlot();

  const response = await fetch(url, {
    headers: {
      ...RH_HEADERS_BASE,
      Authorization: `Bearer ${getRobinhoodToken()}`,
    },
  });

  const bodyText = await response.text();
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    throw new Error(`Robinhood returned non-JSON (${response.status}): ${bodyText.slice(0, 200)}`);
  }

  if (response.status === 401) {
    throw new Error(
      'Robinhood token expired or invalid. Log into robinhood.com in Chrome, copy a fresh Bearer token, and update ROBINHOOD_BROKERAGE_TOKEN in .env.local.'
    );
  }

  if (!response.ok) {
    const detail = body?.detail || body?.error || bodyText.slice(0, 200);
    throw new Error(`Robinhood ${response.status}: ${detail}`);
  }

  return body;
}

async function rhGet(path, params = {}) {
  const url = new URL(`${RH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return rhFetch(url.toString());
}

async function rhGetPaginated(path, params = {}) {
  const url = new URL(`${RH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const results = [];
  let nextUrl = url.toString();

  while (nextUrl) {
    const page = await rhFetch(nextUrl);
    if (Array.isArray(page.results)) {
      results.push(...page.results);
    }
    nextUrl = page.next || null;
  }

  return results;
}

function expirationStringToUnix(dateString) {
  const parsed = Date.parse(`${dateString}T17:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function unixToExpirationString(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function normalizeExpirationList(rawDates) {
  const dates = Array.isArray(rawDates) ? rawDates : rawDates ? [rawDates] : [];
  return dates
    .map((date) => expirationStringToUnix(date))
    .filter((expiry) => expiry > 0)
    .sort((a, b) => a - b);
}

function pickExpiration(expirationDates, dateUnix, expirationStrings) {
  if (!expirationDates.length) return null;

  let bestIndex = 0;
  if (!dateUnix) {
    return { unix: expirationDates[0], iso: expirationStrings[0] };
  }

  let bestDistance = Math.abs(expirationDates[0] - dateUnix);
  for (let i = 1; i < expirationDates.length; i += 1) {
    const distance = Math.abs(expirationDates[i] - dateUnix);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return {
    unix: expirationDates[bestIndex],
    iso: expirationStrings[bestIndex],
  };
}

function toOccSymbol(symbol, expirationDate, optionType, strike) {
  const yymmdd = expirationDate.replace(/-/g, '').slice(2);
  const side = String(optionType).toLowerCase() === 'call' ? 'C' : 'P';
  const strikeInt = Math.round(Number(strike) * 1000);
  return `${symbol}${yymmdd}${side}${String(strikeInt).padStart(8, '0')}`;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchMarketDataForInstruments(instruments) {
  const marketByUrl = new Map();
  const marketById = new Map();
  const instrumentUrls = instruments.map((instrument) => instrument.url).filter(Boolean);

  for (const chunk of chunkArray(instrumentUrls, RH_MARKETDATA_BATCH_SIZE)) {
    const url = new URL(`${RH_BASE}/marketdata/options/`);
    // Robinhood expects comma-separated instrument URLs, not repeated query params.
    url.searchParams.set('instruments', chunk.join(','));

    const payload = await rhFetch(url.toString());
    for (const quote of payload.results || []) {
      if (quote?.instrument) {
        marketByUrl.set(quote.instrument, quote);
      }
      if (quote?.instrument_id) {
        marketById.set(quote.instrument_id, quote);
      }
    }
  }

  return { marketByUrl, marketById };
}

function toYahooContract(instrument, market, symbol, expirationUnix, underlyingPrice) {
  const optionType = String(instrument.type || '').toLowerCase() === 'call' ? 'Call' : 'Put';
  const strike = Number(instrument.strike_price) || 0;
  const lastPrice = Number(market?.last_trade_price ?? market?.mark_price ?? 0) || 0;
  const previousClose = Number(market?.previous_close_price ?? 0) || 0;
  const change = previousClose > 0 ? lastPrice - previousClose : 0;
  const percentChange = previousClose > 0 ? (change / previousClose) * 100 : 0;
  const expirationDate = instrument.expiration_date || unixToExpirationString(expirationUnix);

  return {
    contractSymbol: toOccSymbol(symbol, expirationDate, instrument.type, strike),
    strike,
    lastPrice,
    bid: Number(market?.bid_price ?? 0) || 0,
    ask: Number(market?.ask_price ?? 0) || 0,
    change,
    percentChange,
    volume: Number(market?.volume ?? 0) || 0,
    openInterest: Number(market?.open_interest ?? 0) || 0,
    impliedVolatility: Number(market?.implied_volatility ?? 0) || 0,
    inTheMoney:
      optionType === 'Call'
        ? underlyingPrice != null && strike < underlyingPrice
        : underlyingPrice != null && strike > underlyingPrice,
    expiration: expirationUnix,
    currency: 'USD',
  };
}

export function hasOptionContracts(payload) {
  const bucket = payload?.optionChain?.result?.[0]?.options?.[0];
  if (!bucket) return false;
  return (bucket.calls?.length || 0) + (bucket.puts?.length || 0) > 0;
}

export async function fetchRobinhoodOptions(symbol, dateUnix) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!normalizedSymbol) {
    throw new Error('Missing symbol');
  }

  const instrument = (await rhGet('/instruments/', { symbol: normalizedSymbol })).results?.[0];
  const chainId = instrument?.tradable_chain_id;
  if (!chainId) {
    throw new Error(`No options chain found for ${normalizedSymbol}`);
  }

  const chain = await rhGet(`/options/chains/${chainId}/`);
  const expirationStrings = (chain.expiration_dates || []).slice().sort();
  const expirationDates = normalizeExpirationList(expirationStrings);
  if (!expirationDates.length) {
    throw new Error(`No option expirations returned for ${normalizedSymbol}`);
  }

  const selected = pickExpiration(expirationDates, dateUnix, expirationStrings);
  const selectedExpiry = selected.unix;
  const selectedExpiration = selected.iso;

  const [quotePayload, optionInstruments] = await Promise.all([
    rhGet('/quotes/', { symbols: normalizedSymbol }),
    rhGetPaginated('/options/instruments/', {
      chain_id: chainId,
      chain_symbol: normalizedSymbol,
      expiration_dates: selectedExpiration,
      state: 'active',
    }),
  ]);

  const underlyingQuote = quotePayload.results?.[0];
  const underlyingPrice =
    underlyingQuote?.last_trade_price != null
      ? Number(underlyingQuote.last_trade_price)
      : underlyingQuote?.previous_close != null
        ? Number(underlyingQuote.previous_close)
        : null;

  const { marketByUrl, marketById } = await fetchMarketDataForInstruments(optionInstruments);

  const calls = [];
  const puts = [];

  for (const optionInstrument of optionInstruments) {
    const market =
      marketByUrl.get(optionInstrument.url) || marketById.get(optionInstrument.id) || null;
    const contract = toYahooContract(
      optionInstrument,
      market,
      normalizedSymbol,
      selectedExpiry,
      underlyingPrice
    );
    if (String(optionInstrument.type).toLowerCase() === 'call') {
      calls.push(contract);
    } else if (String(optionInstrument.type).toLowerCase() === 'put') {
      puts.push(contract);
    }
  }

  calls.sort((a, b) => a.strike - b.strike);
  puts.sort((a, b) => a.strike - b.strike);

  return {
    optionChain: {
      result: [
        {
          quote: {
            symbol: normalizedSymbol,
            regularMarketPrice: underlyingPrice,
          },
          expirationDates,
          options: [{ calls, puts }],
        },
      ],
    },
  };
}
