
/**
 * Fetch current stock price using multiple data sources
 * Priority: Finnhub (real-time NASDAQ) → Yahoo Finance (fallback)
 * 
 * To use Finnhub API (optional, for better NASDAQ data):
 * 1. Get free API key from https://finnhub.io/
 * 2. Create .env file: VITE_FINNHUB_API_KEY=your_key_here
 */
export async function fetchStockPrice(ticker: string): Promise<number | null> {
  // Try Finnhub API first if API key is available (best for NASDAQ real-time data)
  const finnhubApiKey = import.meta.env.VITE_FINNHUB_API_KEY;
  
  if (finnhubApiKey) {
    try {
      const finnhubUrl = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${finnhubApiKey}`;
      
      const response = await fetch(finnhubUrl);
      
      if (response.ok) {
        const data = await response.json();
        const currentPrice = data?.c; // 'c' is current price in Finnhub API
        
        if (currentPrice && typeof currentPrice === 'number' && currentPrice > 0) {
          if (import.meta.env.DEV) {
            console.log(`✓ Fetched price from Finnhub (NASDAQ) for ${ticker}: $${currentPrice}`);
          }
          return currentPrice;
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn(`Finnhub API failed for ${ticker}, trying fallback:`, error);
      }
    }
  }

  // Fallback to Yahoo Finance API with CORS proxy
  try {
    // Try direct Yahoo Finance API first
    let yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    let response = await fetch(yahooUrl, { 
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
      }
    });
    
    // If CORS fails, try with CORS proxy
    if (!response.ok || response.status === 0) {
      if (import.meta.env.DEV) {
        console.log(`Yahoo Finance direct access failed, trying CORS proxy...`);
      }
      
      // Use allorigins.win as CORS proxy (free, no auth)
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`;
      response = await fetch(proxyUrl);
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Extract current price from the response
    const currentPrice = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    
    if (currentPrice && typeof currentPrice === 'number') {
      if (import.meta.env.DEV) {
        console.log(`✓ Fetched price from Yahoo Finance for ${ticker}: $${currentPrice}`);
      }
      return currentPrice;
    }
    
    return null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error(`❌ All APIs failed to fetch stock price for ${ticker}:`, error);
      console.log(`💡 Solution: Add Finnhub API key to .env file (see README.md)`);
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

