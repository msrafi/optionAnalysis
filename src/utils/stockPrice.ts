
/**
 * Fetch current stock price from Yahoo Finance API (free, no API key required)
 */
export async function fetchStockPrice(ticker: string): Promise<number | null> {
  try {
    // Using Yahoo Finance query API (free, no auth required)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Extract current price from the response
    const currentPrice = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    
    if (currentPrice && typeof currentPrice === 'number') {
      return currentPrice;
    }
    
    return null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`Failed to fetch stock price for ${ticker}:`, error);
    }
    return null;
  }
}

/**
 * Cache for stock prices to avoid excessive API calls
 */
const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_DURATION = 900000; // 15 minutes cache (15 * 60 * 1000)

/**
 * Get real-time stock price with intelligent caching
 * Only fetches from API if price wasn't checked in the last 15 minutes
 */
export async function getCurrentPrice(
  ticker: string
): Promise<{
  price: number | null;
  source: 'api' | 'none';
  cached: boolean;
}> {
  const cached = priceCache.get(ticker);
  const now = Date.now();
  
  // Return cached price if it's less than 15 minutes old
  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    if (import.meta.env.DEV) {
      const minutesAgo = Math.floor((now - cached.timestamp) / 60000);
      console.log(`Using cached price for ${ticker} (${minutesAgo} min old): $${cached.price}`);
    }
    return { price: cached.price, source: 'api', cached: true };
  }
  
  // Fetch new price from API
  const apiPrice = await fetchStockPrice(ticker);
  
  if (apiPrice !== null) {
    priceCache.set(ticker, { price: apiPrice, timestamp: now });
    if (import.meta.env.DEV) {
      console.log(`Fetched fresh price for ${ticker}: $${apiPrice}`);
    }
    return { price: apiPrice, source: 'api', cached: false };
  }

  return { price: null, source: 'none', cached: false };
}

export async function getCachedStockPrice(ticker: string): Promise<number | null> {
  const result = await getCurrentPrice(ticker);
  return result.price;
}

/**
 * Clear the price cache
 */
export function clearPriceCache(): void {
  priceCache.clear();
}

