export interface YahooOptionContract {
  symbol: string;
  contractSymbol: string;
  optionType: 'Call' | 'Put';
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  change: number;
  percentChange: number;
  expiration: number;
  expirationLabel: string;
  underlyingPrice: number | null;
  currency: string;
}

export interface YahooOptionChainResult {
  symbol: string;
  expirations: number[];
  underlyingPrice: number | null;
  contracts: YahooOptionContract[];
}

export interface YahooMostActiveOptionRow {
  contractSymbol: string;
  underlyingSymbol: string;
  optionType: 'CALL' | 'PUT' | string;
  strike: number;
  expiration: number;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  percentChange: number;
  change: number;
  currency: string;
}

interface YahooApiOptionContract {
  contractSymbol: string;
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  change: number;
  percentChange: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  expiration: number | string;
  currency: string;
}

interface YahooApiResponse {
  optionChain?: {
    result?: Array<{
      quote?: {
        symbol?: string;
        regularMarketPrice?: number;
      };
      expirationDates?: number[];
      options?: Array<{
        calls?: YahooApiOptionContract[];
        puts?: YahooApiOptionContract[];
      }>;
    }>;
  };
}

function normalizeExpirationToSeconds(expiration: number | string | undefined): number {
  if (typeof expiration === 'number') {
    if (!Number.isFinite(expiration)) return 0;
    return expiration > 1_000_000_000_000 ? Math.floor(expiration / 1000) : Math.floor(expiration);
  }

  if (typeof expiration === 'string') {
    const numeric = Number(expiration);
    if (Number.isFinite(numeric)) {
      return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }
    const parsed = Date.parse(expiration);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }

  return 0;
}

function toExpiryLabel(expiration: number): string {
  if (!expiration) return 'N/A';
  return new Date(expiration * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC'
  });
}

function normalizeContract(
  symbol: string,
  optionType: 'Call' | 'Put',
  contract: YahooApiOptionContract,
  underlyingPrice: number | null
): YahooOptionContract {
  const expiration = normalizeExpirationToSeconds(contract.expiration);
  return {
    symbol,
    contractSymbol: contract.contractSymbol,
    optionType,
    strike: contract.strike || 0,
    lastPrice: contract.lastPrice || 0,
    bid: contract.bid || 0,
    ask: contract.ask || 0,
    volume: contract.volume || 0,
    openInterest: contract.openInterest || 0,
    impliedVolatility: contract.impliedVolatility || 0,
    inTheMoney: Boolean(contract.inTheMoney),
    change: contract.change || 0,
    percentChange: contract.percentChange || 0,
    expiration,
    expirationLabel: toExpiryLabel(expiration),
    underlyingPrice,
    currency: contract.currency || 'USD'
  };
}

export function parseSymbolsInput(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,\n]+/)
        .map((raw) => raw.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

// In local dev (Vite proxy), base is '' so requests go to /api/yahoo/...
// In production (GitHub Pages), VITE_YAHOO_API_BASE is set to the Railway URL.
const API_BASE: string = import.meta.env.VITE_YAHOO_API_BASE ?? '';

// Log the API base URL for debugging
console.log('[YahooOptions] Using API_BASE:', API_BASE || '(empty - using local proxy)');

export async function fetchYahooOptionChain(symbol: string, expiry?: number): Promise<YahooOptionChainResult> {
  const query = expiry ? `?date=${expiry}` : '';
  const url = `${API_BASE}/api/yahoo/options/${encodeURIComponent(symbol)}${query}`;
  
  console.log('[YahooOptions] Fetching options from:', url);
  
  const response = await fetch(url, {
    cache: 'no-store'
  });

  if (!response.ok) {
    let errorBody: { error?: string; message?: string } = {};
    try {
      errorBody = await response.json();
    } catch {
      // ignore parse errors
    }

    const backendMessage = errorBody.message || response.statusText;
    const baseUrl = API_BASE || 'local server';

    if (errorBody.error === 'yahoo_rate_limited' || /429|rate.?limit|too many requests/i.test(backendMessage)) {
      throw new Error(
        `Yahoo is rate-limiting the data server (${response.status}). Wait 1–2 minutes and retry. For reliable access, run locally: npm start`
      );
    }

    if (response.status === 404 || response.status === 502 || response.status === 503 || response.status === 504) {
      throw new Error(
        `Failed to reach Yahoo API backend (${response.status}). Backend URL: ${baseUrl}. ${backendMessage}`
      );
    }
    throw new Error(`Yahoo request failed for ${symbol}: ${response.status} ${backendMessage}`);
  }

  const json = (await response.json()) as YahooApiResponse;
  const result = json.optionChain?.result?.[0];

  if (!result) {
    throw new Error(`No options payload returned for ${symbol}`);
  }

  const expirations = (result.expirationDates || [])
    .map((expiry) => normalizeExpirationToSeconds(expiry))
    .filter((expiry) => expiry > 0)
    .sort((a, b) => a - b);
  const quoteSymbol = result.quote?.symbol || symbol;
  const underlyingPrice = result.quote?.regularMarketPrice ?? null;
  const options = result.options?.[0];
  const calls = (options?.calls || []).map((contract) =>
    normalizeContract(quoteSymbol, 'Call', contract, underlyingPrice)
  );
  const puts = (options?.puts || []).map((contract) =>
    normalizeContract(quoteSymbol, 'Put', contract, underlyingPrice)
  );

  return {
    symbol: quoteSymbol,
    expirations,
    underlyingPrice,
    contracts: [...calls, ...puts]
  };
}

export async function fetchYahooMostActiveOptions(symbol?: string): Promise<YahooMostActiveOptionRow[]> {
  const params = new URLSearchParams();
  params.set('count', '200');
  if (symbol) {
    params.set('symbol', symbol.toUpperCase());
  }

  const response = await fetch(`${API_BASE}/api/yahoo/most-active?${params.toString()}`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    if (response.status === 404 || response.status === 502 || response.status === 503 || response.status === 504) {
      const baseUrl = API_BASE || 'local server';
      throw new Error(
        `Failed to connect to Yahoo API backend (${response.status}). Backend URL: ${baseUrl}. Check if the server is running and accessible.`
      );
    }
    throw new Error(`Failed to fetch Yahoo most active options: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  return Array.isArray(json.rows) ? json.rows : [];
}
