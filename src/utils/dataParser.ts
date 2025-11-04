export interface OptionData {
  ticker: string;
  strike: number;
  expiry: string;
  optionType: 'Call' | 'Put';
  volume: number;
  premium: string;
  openInterest: number;
  bidAskSpread: number;
  timestamp: string;
  sweepType: string;
  sourceFile?: string; // Track which file this data came from
}

export interface DarkPoolData {
  ticker: string;
  quantity: number;
  price: number;
  totalValue: string;
  timestamp: string;
  sourceFile?: string; // Track which file this data came from
}

export interface MergedDataInfo {
  totalFiles: number;
  totalRecords: number;
  dateRange: {
    earliest: Date | null;
    latest: Date | null;
  };
  files: {
    filename: string;
    recordCount: number;
    timestamp: Date;
  }[];
}

export interface TickerSummary {
  ticker: string;
  totalVolume: number;
  callVolume: number;
  putVolume: number;
  totalPremium: number;
  uniqueExpiries: string[];
  lastActivity: string;
  lastActivityDate: Date | null;
  lastTrade: {
    strike: number;
    optionType: 'Call' | 'Put';
    volume: number;
    premium: string;
    sweepType: string;
    timestamp: string;
  } | null;
}

export interface VolumeProfileData {
  strike: number;
  callVolume: number;
  putVolume: number;
  openInterest: number;
  totalVolume: number;
}

export interface HighestVolumeData {
  strike: number;
  totalVolume: number;
  callVolume: number;
  putVolume: number;
  openInterest: number;
}

// Session storage keys for caching
const PARSE_CACHE_KEY = 'optionAnalysis_parseCache';
const DARKPOOL_PARSE_CACHE_KEY = 'optionAnalysis_darkPoolParseCache';
const TICKER_SUMMARY_CACHE_KEY = 'optionAnalysis_tickerSummaryCache';
const DARKPOOL_TICKER_SUMMARY_CACHE_KEY = 'optionAnalysis_darkPoolTickerSummaryCache';

// Helper functions for session storage
function getSessionParseCache(key: string): Map<string, OptionData[]> {
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      const map = new Map<string, OptionData[]>();
      for (const [k, v] of Object.entries(parsed)) {
        map.set(k, v as OptionData[]);
      }
      return map;
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to load parse cache from session storage:', error);
    }
  }
  return new Map<string, OptionData[]>();
}

function setSessionParseCache(key: string, cache: Map<string, OptionData[]>): void {
  try {
    const obj = Object.fromEntries(cache);
    sessionStorage.setItem(key, JSON.stringify(obj));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to save parse cache to session storage:', error);
    }
  }
}

function getSessionDarkPoolParseCache(key: string): Map<string, DarkPoolData[]> {
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      const map = new Map<string, DarkPoolData[]>();
      for (const [k, v] of Object.entries(parsed)) {
        map.set(k, v as DarkPoolData[]);
      }
      return map;
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to load dark pool parse cache from session storage:', error);
    }
  }
  return new Map<string, DarkPoolData[]>();
}

function setSessionDarkPoolParseCache(key: string, cache: Map<string, DarkPoolData[]>): void {
  try {
    const obj = Object.fromEntries(cache);
    sessionStorage.setItem(key, JSON.stringify(obj));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to save dark pool parse cache to session storage:', error);
    }
  }
}

function getSessionTickerSummaryCache(key: string): Map<string, TickerSummary[]> {
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      const map = new Map<string, TickerSummary[]>();
      for (const [k, v] of Object.entries(parsed)) {
        map.set(k, v as TickerSummary[]);
      }
      return map;
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to load ticker summary cache from session storage:', error);
    }
  }
  return new Map<string, TickerSummary[]>();
}

function setSessionTickerSummaryCache(key: string, cache: Map<string, TickerSummary[]>): void {
  try {
    const obj = Object.fromEntries(cache);
    sessionStorage.setItem(key, JSON.stringify(obj));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to save ticker summary cache to session storage:', error);
    }
  }
}

function getSessionDarkPoolTickerSummaryCache(key: string): Map<string, any[]> {
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      const map = new Map<string, any[]>();
      for (const [k, v] of Object.entries(parsed)) {
        map.set(k, v as any[]);
      }
      return map;
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to load dark pool ticker summary cache from session storage:', error);
    }
  }
  return new Map<string, any[]>();
}

function setSessionDarkPoolTickerSummaryCache(key: string, cache: Map<string, any[]>): void {
  try {
    const obj = Object.fromEntries(cache);
    sessionStorage.setItem(key, JSON.stringify(obj));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to save dark pool ticker summary cache to session storage:', error);
    }
  }
}

function clearSessionCache(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to clear session storage:', error);
    }
  }
}

// Clear cache function for development
export function clearDataCache() {
  clearSessionCache(PARSE_CACHE_KEY);
  clearSessionCache(TICKER_SUMMARY_CACHE_KEY);
  if (import.meta.env.DEV) {
    console.log('Options data cache cleared - all caches reset');
  }
}

// Clear dark pool cache function
export function clearDarkPoolDataCache() {
  clearSessionCache(DARKPOOL_PARSE_CACHE_KEY);
  clearSessionCache(DARKPOOL_TICKER_SUMMARY_CACHE_KEY);
  if (import.meta.env.DEV) {
    console.log('Dark pool data cache cleared');
  }
}

/**
 * Clear all data parser session storage caches
 */
export function clearAllDataParserCaches(): void {
  clearSessionCache(PARSE_CACHE_KEY);
  clearSessionCache(DARKPOOL_PARSE_CACHE_KEY);
  clearSessionCache(TICKER_SUMMARY_CACHE_KEY);
  clearSessionCache(DARKPOOL_TICKER_SUMMARY_CACHE_KEY);
  if (import.meta.env.DEV) {
    console.log('🧹 All data parser session storage caches cleared');
  }
}

/**
 * Parse timestamp from CSV data
 * Expected format: "Wednesday, October 8, 2025 at 3:02 PM"
 */
export function parseTimestampFromData(timestampStr: string): Date | null {
  try {
    if (!timestampStr) return null;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Convert month name to number
    const monthMap: { [key: string]: number } = {
      'january': 0, 'february': 1, 'march': 2, 'april': 3,
      'may': 4, 'june': 5, 'july': 6, 'august': 7,
      'september': 8, 'october': 9, 'november': 10, 'december': 11
    };
    
    // Helper function to convert 12-hour to 24-hour format
    const convertTo24Hour = (hour: string, ampm: string): number => {
      let hour24 = parseInt(hour);
      if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
        hour24 += 12;
      } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
        hour24 = 0;
      }
      return hour24;
    };
    
    // Handle format: "Wednesday, October 8, 2025 at 3:02 PM"
    let match = timestampStr.match(/(\w+),\s+(\w+)\s+(\d+),\s+(\d+)\s+at\s+(\d+):(\d+)\s+(AM|PM)/i);
    if (match) {
      const [, , monthName, day, year, hour, minute, ampm] = match;
      const month = monthMap[monthName.toLowerCase()];
      if (month === undefined) {
        if (import.meta.env.DEV) {
          console.warn(`Unknown month: ${monthName}`);
        }
        return null;
      }
      const hour24 = convertTo24Hour(hour, ampm);
      return new Date(parseInt(year), month, parseInt(day), hour24, parseInt(minute));
    }
    
    // Handle format: "Yesterday at 3:55 PM"
    match = timestampStr.match(/Yesterday at (\d+):(\d+)\s+(AM|PM)/i);
    if (match) {
      const [, hour, minute, ampm] = match;
      const hour24 = convertTo24Hour(hour, ampm);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), hour24, parseInt(minute));
    }
    
    // Handle format: "9:45 AM" (today's time)
    match = timestampStr.match(/(\d+):(\d+)\s+(AM|PM)/i);
    if (match) {
      const [, hour, minute, ampm] = match;
      const hour24 = convertTo24Hour(hour, ampm);
      return new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour24, parseInt(minute));
    }
    
    if (import.meta.env.DEV) {
      console.warn(`Timestamp format not recognized: ${timestampStr}`);
    }
    return null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`Failed to parse timestamp: ${timestampStr}`, error);
    }
    return null;
  }
}

/**
 * Check if an option has expired based on its expiry date
 * Expected format: "MM/DD/YYYY" (e.g., "10/10/2025")
 */
function isOptionExpired(expiryStr: string): boolean {
  try {
    if (!expiryStr) return false;
    
    // Parse expiry date from MM/DD/YYYY format
    const parts = expiryStr.split('/');
    if (parts.length !== 3) return false;
    
    const month = parseInt(parts[0]) - 1; // JavaScript months are 0-indexed
    const day = parseInt(parts[1]);
    const year = parseInt(parts[2]);
    
    // Create expiry date at end of day (23:59:59) to ensure options expire after market close
    const expiryDate = new Date(year, month, day, 23, 59, 59);
    const today = new Date();
    
    // Option is expired if expiry date is before today
    return expiryDate < today;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`Failed to parse expiry date: ${expiryStr}`, error);
    }
    return false; // If we can't parse it, don't filter it out
  }
}

export function parseCSVData(csvText: string, sourceFile?: string): OptionData[] {
  // Check cache first
  const cacheKey = `${sourceFile || 'unknown'}_${csvText.length}_${csvText.slice(0, 100)}`;
  const parseCache = getSessionParseCache(PARSE_CACHE_KEY);
  const cached = parseCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const lines = csvText.split('\n');
  const data: OptionData[] = [];
  
  // Pre-allocate array with estimated size for better performance
  // Cap at 10 million to avoid "Invalid array length" errors with very large files
  const maxArraySize = 10_000_000;
  const estimatedSize = Math.min(maxArraySize, Math.max(1000, Math.floor(lines.length * 0.8)));
  
  // Only pre-allocate if the size is valid and reasonable
  if (estimatedSize > 0 && estimatedSize < maxArraySize && isFinite(estimatedSize)) {
    try {
      data.length = estimatedSize;
    } catch (error) {
      // If pre-allocation fails, let array grow naturally
      if (import.meta.env.DEV) {
        console.warn('Failed to pre-allocate array, using dynamic growth:', error);
      }
    }
  }
  let dataIndex = 0;
  
  // Check if this is the clean format (check header)
  const header = lines[0] || '';
  const isCleanFormat = header.includes('ticker,strike,expiry') && header.split(',').length <= 15;
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV line (handle quoted fields)
    const fields = parseCSVLine(line);
    
    try {
      let timestamp, sweepType, ticker, strike, expiry, optionType, volume, premium, openInterest, bidAskSpread;
      
      if (isCleanFormat) {
        // Clean format: ticker,strike,expiry,optionType,volume,premium,openInterest,bidAskSpread,timestamp,sweepType,sourceFile
        if (fields.length < 10) continue;
        ticker = fields[0] || '';
        strike = parseFloat(fields[1]) || 0;
        expiry = fields[2] || '';
        optionType = fields[3] as 'Call' | 'Put';
        volume = parseInt(fields[4]?.replace(/,/g, '') || '0');
        premium = fields[5] || '$0';
        openInterest = parseInt(fields[6]?.replace(/,/g, '') || '0');
        bidAskSpread = parseFloat(fields[7]) || 0;
        timestamp = fields[8] || '';
        sweepType = fields[9] || '';
        // sourceFile is fields[10] but we use the parameter
      } else {
        // Legacy format: original CSV with 16+ columns
        if (fields.length < 16) continue;
        
        // Check if this is a line with alternative format (empty first fields, "[" in field 4)
        const isAlternativeFormat = fields[4] === '[' || (fields[0] === '' && fields[1] === '' && fields[2] === '' && fields[3] === '');
        
        if (isAlternativeFormat) {
          // Alternative format when first fields are empty and field[4] is "["
          // Fields: [4]="[", [5]=timestamp, [6]=sweepType, [7]=ticker, [8]=strike, [9]=expiry, [10]=optionType, [11]=bidAskType, [12]=volume, [13]=premium, [14]=openInterest
          timestamp = fields[5] || '';
          sweepType = fields[6] || '';
          ticker = fields[7] || '';
          strike = parseFloat(fields[8]) || 0;
          expiry = fields[9] || '';
          optionType = fields[10] as 'Call' | 'Put';
          volume = parseInt(fields[12]?.replace(/,/g, '') || '0');
          premium = fields[13] || '$0';
          openInterest = parseInt(fields[14]?.replace(/,/g, '') || '0');
        } else {
          // Standard format: [0]=avatar, [1]=username, [2]=botText, [3]=timestamp, [4]=separator, [5]=fullTimestamp, [6]=sweepType, [7]=ticker, [8]=strike, [9]=expiry, [10]=optionType, [11]=bidAskType, [12]=volume, [13]=premium, [14]=openInterest
          timestamp = fields[5] || fields[3] || '';
          sweepType = fields[6] || '';
          ticker = fields[7] || '';
          strike = parseFloat(fields[8]) || 0;
          expiry = fields[9] || '';
          optionType = fields[10] as 'Call' | 'Put';
          volume = parseInt(fields[12]?.replace(/,/g, '') || '0');
          premium = fields[13] || '$0';
          openInterest = parseInt(fields[14]?.replace(/,/g, '') || '0');
        }
        bidAskSpread = 0; // Not available in legacy format
      }
      
      // Filter out non-ticker entries (trade types, sweep types, etc.)
      const invalidTickers = ['Ask', 'Above', 'Bid', 'Below', 'Sweep', 'Block', 'Trade', 'Volume', 'Premium'];
      const isValidTicker = ticker && 
        ticker.length >= 1 && 
        ticker.length <= 10 && 
        !invalidTickers.includes(ticker) &&
        !ticker.match(/^\d+$/) && // Not just numbers
        !ticker.includes(' ') && // No spaces
        /^[A-Z0-9]+$/.test(ticker); // Only uppercase letters and numbers
      
      // Check if the option has expired
      const isExpired = isOptionExpired(expiry);
      
      // Only process valid option data with valid tickers and non-expired options
      if (isValidTicker && strike > 0 && expiry && optionType && volume > 0 && !isExpired) {
        data[dataIndex++] = {
          ticker,
          strike,
          expiry,
          optionType,
          volume,
          premium,
          openInterest,
          bidAskSpread,
          timestamp,
          sweepType,
          sourceFile
        };
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Error parsing line:', line, error);
      }
    }
  }
  
  // Trim array to actual size (safely handle edge cases)
  try {
    if (dataIndex >= 0 && dataIndex <= data.length && isFinite(dataIndex)) {
      data.length = dataIndex;
    } else if (dataIndex > 0) {
      // If we exceeded pre-allocated size or have invalid index, create new array
      const trimmedData = data.slice(0, dataIndex);
      data.length = 0;
      data.push(...trimmedData);
    }
  } catch (error) {
    // Fallback: create new array with correct size
    const trimmedData: OptionData[] = [];
    for (let i = 0; i < dataIndex && i < data.length; i++) {
      if (data[i]) {
        trimmedData.push(data[i]);
      }
    }
    data.length = 0;
    data.push(...trimmedData);
    if (import.meta.env.DEV) {
      console.warn('Array length trim failed, used fallback:', error);
    }
  }
  
  // Log parsing results for debugging
  console.log(`📊 Parsed ${dataIndex} valid records from ${sourceFile || 'unknown file'} (from ${lines.length - 1} CSV rows)`);
  if (dataIndex > 0 && dataIndex < 10) {
    console.log(`   Sample records:`, data.slice(0, 3).map(d => ({
      ticker: d.ticker,
      strike: d.strike,
      expiry: d.expiry,
      timestamp: d.timestamp.substring(0, 30)
    })));
  }
  
  // Cache the result
  parseCache.set(cacheKey, data);
  setSessionParseCache(PARSE_CACHE_KEY, parseCache);
  
  return data;
}


export function getTickerSummaries(data: OptionData[]): TickerSummary[] {
  // Create cache key based on data length, first few items, and latest timestamp
  // Include latest timestamp to ensure cache invalidation when new files are added
  let latestTimestamp = 'empty';
  if (data.length > 0) {
    let latestDate: Date | null = null;
    data.forEach(trade => {
      const tradeDate = parseTimestampFromData(trade.timestamp);
      if (tradeDate && (!latestDate || tradeDate > latestDate)) {
        latestDate = tradeDate;
        latestTimestamp = trade.timestamp;
      }
    });
  }
  
  const cacheKey = `${data.length}_${data.slice(0, 3).map(d => `${d.ticker}_${d.timestamp}`).join('_')}_${latestTimestamp}`;
  const tickerSummaryCache = getSessionTickerSummaryCache(TICKER_SUMMARY_CACHE_KEY);
  const cached = tickerSummaryCache.get(cacheKey);
  if (cached) {
    if (import.meta.env.DEV) {
      console.log('Using cached ticker summaries');
    }
    return cached;
  }
  
  if (import.meta.env.DEV) {
    console.log('Recalculating ticker summaries for', data.length, 'trades');
  }

  const tickerMap = new Map<string, TickerSummary & { expirySet: Set<string> }>();
  
  // Use for loop for better performance than forEach
  for (let i = 0; i < data.length; i++) {
    const option = data[i];
    
    if (!tickerMap.has(option.ticker)) {
      const parsedTimestamp = parseTimestampFromData(option.timestamp);
      tickerMap.set(option.ticker, {
        ticker: option.ticker,
        totalVolume: 0,
        callVolume: 0,
        putVolume: 0,
        totalPremium: 0,
        uniqueExpiries: [],
        expirySet: new Set<string>(),
        lastActivity: option.timestamp,
        lastActivityDate: parsedTimestamp,
        lastTrade: {
          strike: option.strike,
          optionType: option.optionType,
          volume: option.volume,
          premium: option.premium,
          sweepType: option.sweepType,
          timestamp: option.timestamp
        }
      });
    }
    
    const summary = tickerMap.get(option.ticker)!;
    summary.totalVolume += option.volume;
    summary.totalPremium += parsePremium(option.premium);
    
    if (option.optionType === 'Call') {
      summary.callVolume += option.volume;
    } else {
      summary.putVolume += option.volume;
    }
    
    // Use Set for O(1) expiry checking instead of O(n) array.includes()
    if (!summary.expirySet.has(option.expiry)) {
      summary.expirySet.add(option.expiry);
      summary.uniqueExpiries.push(option.expiry);
    }
    
    // Update last activity if this is more recent
    const currentTimestamp = parseTimestampFromData(option.timestamp);
    if (currentTimestamp && summary.lastActivityDate && currentTimestamp > summary.lastActivityDate) {
      summary.lastActivity = option.timestamp;
      summary.lastActivityDate = currentTimestamp;
      // Update last trade with most recent trade
      summary.lastTrade = {
        strike: option.strike,
        optionType: option.optionType,
        volume: option.volume,
        premium: option.premium,
        sweepType: option.sweepType,
        timestamp: option.timestamp
      };
    } else if (currentTimestamp && !summary.lastActivityDate) {
      summary.lastActivity = option.timestamp;
      summary.lastActivityDate = currentTimestamp;
      // Set last trade if none exists
      if (!summary.lastTrade) {
        summary.lastTrade = {
          strike: option.strike,
          optionType: option.optionType,
          volume: option.volume,
          premium: option.premium,
          sweepType: option.sweepType,
          timestamp: option.timestamp
        };
      }
    }
  }
  
  // Sort by most recent activity first, then by total volume
  // Remove the expirySet before returning (it was just for performance)
  const result = Array.from(tickerMap.values()).map(({ expirySet, ...summary }) => summary).sort((a, b) => {
    // Use parsed dates for more accurate sorting
    const dateA = a.lastActivityDate instanceof Date ? a.lastActivityDate : (a.lastActivityDate ? new Date(a.lastActivityDate) : null);
    const dateB = b.lastActivityDate instanceof Date ? b.lastActivityDate : (b.lastActivityDate ? new Date(b.lastActivityDate) : null);
    
    // First sort by most recent activity
    if (dateA && dateB && dateA.getTime() !== dateB.getTime()) {
      return dateB.getTime() - dateA.getTime();
    }
    
    // If same activity time or no dates, sort by total volume
    return b.totalVolume - a.totalVolume;
  });
  
  // Cache the result
  tickerSummaryCache.set(cacheKey, result);
  setSessionTickerSummaryCache(TICKER_SUMMARY_CACHE_KEY, tickerSummaryCache);
  
  return result;
}

export function getVolumeProfileForTicker(
  data: OptionData[], 
  ticker: string, 
  expiry?: string
): VolumeProfileData[] {
  const filteredData = data.filter(option => 
    option.ticker === ticker && 
    (!expiry || option.expiry === expiry)
  );
  
  const strikeMap = new Map<number, VolumeProfileData>();
  
  filteredData.forEach(option => {
    if (!strikeMap.has(option.strike)) {
      strikeMap.set(option.strike, {
        strike: option.strike,
        callVolume: 0,
        putVolume: 0,
        openInterest: 0,
        totalVolume: 0
      });
    }
    
    const profile = strikeMap.get(option.strike)!;
    profile.totalVolume += option.volume;
    profile.openInterest += option.openInterest;
    
    if (option.optionType === 'Call') {
      profile.callVolume += option.volume;
    } else {
      profile.putVolume += option.volume;
    }
  });
  
  return Array.from(strikeMap.values())
    .sort((a, b) => a.strike - b.strike);
}

/**
 * Check if an expiry date is within the current week (Monday to Sunday)
 */
export function isExpiryInCurrentWeek(expiryStr: string): boolean {
  try {
    if (!expiryStr) return false;
    
    const today = new Date();
    const currentWeekStart = new Date(today);
    const currentWeekEnd = new Date(today);
    
    // Get Monday of current week
    const dayOfWeek = today.getDay();
    currentWeekStart.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    currentWeekStart.setHours(0, 0, 0, 0);
    
    // Get Sunday of current week (end of week)
    currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
    currentWeekEnd.setHours(23, 59, 59, 999);
    
    // Parse expiry date
    const expiryDate = parseExpiryDate(expiryStr);
    if (!expiryDate) return false;
    
    // Check if expiry is within this week
    return expiryDate >= currentWeekStart && expiryDate <= currentWeekEnd;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`Failed to check if expiry is in current week: ${expiryStr}`, error);
    }
    return false;
  }
}

/**
 * Parse expiry date from string (handles MM/DD/YYYY and ISO formats)
 */
function parseExpiryDate(expiryStr: string): Date | null {
  try {
    if (!expiryStr) return null;
    
    // Try MM/DD/YYYY format
    const parts = expiryStr.split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0]) - 1; // 0-indexed
      const day = parseInt(parts[1]);
      const year = parseInt(parts[2]);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(year, month, day);
      }
    }
    
    // Try ISO format YYYY-MM-DD
    const isoMatch = expiryStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1]);
      const month = parseInt(isoMatch[2]) - 1; // 0-indexed
      const day = parseInt(isoMatch[3]);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(year, month, day);
      }
    }
    
    // Try parsing as-is (fallback)
    const parsed = new Date(expiryStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

export function getExpiryDatesForTicker(data: OptionData[], ticker: string): string[] {
  const expiries = new Set<string>();
  
  data.forEach(option => {
    if (option.ticker === ticker) {
      expiries.add(option.expiry);
    }
  });
  
  // Sort: current week expiries first, then by date
  return Array.from(expiries).sort((a, b) => {
    const inCurrentWeekA = isExpiryInCurrentWeek(a);
    const inCurrentWeekB = isExpiryInCurrentWeek(b);
    
    // Current week expiries come first
    if (inCurrentWeekA && !inCurrentWeekB) return -1;
    if (!inCurrentWeekA && inCurrentWeekB) return 1;
    
    // Within same category, sort by date
    const dateA = parseExpiryDate(a);
    const dateB = parseExpiryDate(b);
    if (!dateA || !dateB) return 0;
    return dateA.getTime() - dateB.getTime();
  });
}

export function getHighestVolumeData(
  data: OptionData[], 
  ticker: string, 
  expiry?: string
): HighestVolumeData | null {
  const filteredData = data.filter(option => 
    option.ticker === ticker && 
    (!expiry || option.expiry === expiry)
  );
  
  if (!filteredData.length) return null;
  
  const strikeMap = new Map<number, VolumeProfileData>();
  
  filteredData.forEach(option => {
    if (!strikeMap.has(option.strike)) {
      strikeMap.set(option.strike, {
        strike: option.strike,
        callVolume: 0,
        putVolume: 0,
        openInterest: 0,
        totalVolume: 0
      });
    }
    
    const profile = strikeMap.get(option.strike)!;
    profile.totalVolume += option.volume;
    profile.openInterest += option.openInterest;
    
    if (option.optionType === 'Call') {
      profile.callVolume += option.volume;
    } else {
      profile.putVolume += option.volume;
    }
  });
  
  const profiles = Array.from(strikeMap.values());
  const highestVolume = profiles.reduce((max, current) => 
    current.totalVolume > max.totalVolume ? current : max
  );
  
  return {
    strike: highestVolume.strike,
    totalVolume: highestVolume.totalVolume,
    callVolume: highestVolume.callVolume,
    putVolume: highestVolume.putVolume,
    openInterest: highestVolume.openInterest
  };
}

export function parsePremium(premium: string): number {
  const cleanPremium = premium.replace(/[$,K]/g, '');
  const num = parseFloat(cleanPremium);
  
  if (premium.includes('K')) {
    return num * 1000;
  } else if (premium.includes('M')) {
    return num * 1000000;
  }
  
  return num;
}

export function formatVolume(volume: number): string {
  if (volume >= 1000000) {
    return `${(volume / 1000000).toFixed(1)}M`;
  } else if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}K`;
  }
  return volume.toString();
}

export function formatPremium(premium: number): string {
  if (premium >= 1000000) {
    return `$${(premium / 1000000).toFixed(1)}M`;
  } else if (premium >= 1000) {
    return `$${(premium / 1000).toFixed(1)}K`;
  }
  return `$${premium.toFixed(0)}`;
}

/**
 * Merge data from multiple CSV files
 */
export function mergeDataFromFiles(fileData: Array<{filename: string, data: string, timestamp: Date}>): {
  mergedData: OptionData[];
  info: MergedDataInfo;
} {
  const mergedData: OptionData[] = [];
  const fileInfo: MergedDataInfo['files'] = [];
  let earliestDate: Date | null = null;
  let latestDate: Date | null = null;
  
  // Track unique trades to avoid duplicates
  const uniqueTrades = new Map<string, OptionData>();
  
  // Sort files by timestamp (most recent first)
  const sortedFiles = fileData.sort((a, b) => {
    const timestampA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
    const timestampB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    return timestampB.getTime() - timestampA.getTime();
  });
  
  sortedFiles.forEach(file => {
    const parsedData = parseCSVData(file.data, file.filename);
    
    // Deduplicate trades based on key fields
    // Since files are sorted newest first, trades from newer files are processed first
    parsedData.forEach(trade => {
      // Create unique key from trade characteristics and timestamp
      // Use timestamp to distinguish same trade at different times
      const key = `${trade.ticker}_${trade.strike}_${trade.expiry}_${trade.optionType}_${trade.volume}_${trade.premium}_${trade.timestamp}`;
      
      // Only add if we haven't seen this exact trade before
      // Since files are sorted newest first, newer trades will be added first
      if (!uniqueTrades.has(key)) {
        uniqueTrades.set(key, trade);
      }
    });
    
    fileInfo.push({
      filename: file.filename,
      recordCount: parsedData.length,
      timestamp: file.timestamp
    });
    
    // Update date range
    const fileTimestamp = file.timestamp instanceof Date ? file.timestamp : new Date(file.timestamp);
    if (!earliestDate || fileTimestamp < earliestDate) {
      earliestDate = fileTimestamp;
    }
    if (!latestDate || fileTimestamp > latestDate) {
      latestDate = fileTimestamp;
    }
  });
  
  // Convert Map values to array and sort by timestamp (newest first)
  mergedData.push(...uniqueTrades.values());
  mergedData.sort((a, b) => {
    const dateA = parseTimestampFromData(a.timestamp);
    const dateB = parseTimestampFromData(b.timestamp);
    if (!dateA || !dateB) return 0;
    return dateB.getTime() - dateA.getTime(); // Newest first
  });
  
  // Sort fileInfo by timestamp (newest first) to ensure the first file is the most recent
  fileInfo.sort((a, b) => {
    const timestampA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
    const timestampB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    return timestampB.getTime() - timestampA.getTime();
  });
  
  const info: MergedDataInfo = {
    totalFiles: fileData.length,
    totalRecords: mergedData.length,
    dateRange: {
      earliest: earliestDate,
      latest: latestDate
    },
    files: fileInfo
  };
  
  return { mergedData, info };
}

/**
 * Get data summary for the merged dataset
 */
export function getDataSummary(data: OptionData[]): {
  totalTickers: number;
  totalVolume: number;
  totalCalls: number;
  totalPuts: number;
  uniqueExpiries: number;
  dateRange: {
    earliest: Date | null;
    latest: Date | null;
  };
  sourceFiles: string[];
} {
  const tickers = new Set<string>();
  const expiries = new Set<string>();
  const sourceFiles = new Set<string>();
  let totalVolume = 0;
  let totalCalls = 0;
  let totalPuts = 0;
  let earliestDate: Date | null = null;
  let latestDate: Date | null = null;
  
  data.forEach(option => {
    tickers.add(option.ticker);
    expiries.add(option.expiry);
    if (option.sourceFile) sourceFiles.add(option.sourceFile);
    
    totalVolume += option.volume;
    if (option.optionType === 'Call') {
      totalCalls += option.volume;
    } else {
      totalPuts += option.volume;
    }
    
    // Use parsed timestamp for more accurate date range
    const parsedTimestamp = parseTimestampFromData(option.timestamp);
    if (parsedTimestamp) {
      if (!earliestDate || parsedTimestamp < earliestDate) {
        earliestDate = parsedTimestamp;
      }
      if (!latestDate || parsedTimestamp > latestDate) {
        latestDate = parsedTimestamp;
      }
    }
  });
  
  return {
    totalTickers: tickers.size,
    totalVolume,
    totalCalls,
    totalPuts,
    uniqueExpiries: expiries.size,
    dateRange: {
      earliest: earliestDate,
      latest: latestDate
    },
    sourceFiles: Array.from(sourceFiles)
  };
}

/**
 * Filter data by time range
 */
export function filterDataByTimeRange(
  data: OptionData[], 
  startDate: Date, 
  endDate: Date
): OptionData[] {
  return data.filter(option => {
    const timestamp = new Date(option.timestamp);
    return timestamp >= startDate && timestamp <= endDate;
  });
}

/**
 * Get data from the last N hours
 */
export function getRecentData(data: OptionData[], hours: number = 24): OptionData[] {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  return filterDataByTimeRange(data, cutoff, new Date());
}

// ============================================================================
// ANALYTICAL FEATURES
// ============================================================================

export interface UnusualActivityAlert {
  ticker: string;
  alertType: 'volume' | 'premium' | 'sweep' | 'multiple';
  severity: 'low' | 'medium' | 'high';
  reason: string;
  metrics: {
    totalVolume: number;
    totalPremium: number;
    callPutRatio: number;
    sweepCount: number;
    avgTradeSize: number;
  };
}

export interface KeyPriceLevel {
  strike: number;
  volume: number;
  openInterest: number;
  premium: number;
  significance: 'high' | 'medium' | 'low';
  type: 'call' | 'put' | 'both';
}

export interface GammaExposure {
  strike: number;
  netGammaExposure: number; // Positive = dealers long gamma, Negative = dealers short gamma
  callVolume: number;
  putVolume: number;
  callOI: number;
  putOI: number;
  level: 'extreme' | 'high' | 'moderate' | 'low';
}

export interface TickerAnalytics {
  ticker: string;
  unusualActivity?: UnusualActivityAlert | null;
  keyPriceLevels: KeyPriceLevel[];
  gammaExposure: GammaExposure[];
  maxPainStrike: number | null;
  currentPrice?: number;
}

/**
 * Detect unusual activity for a ticker
 */
export function detectUnusualActivity(
  tickerData: OptionData[],
  ticker: string,
  allData: OptionData[]
): UnusualActivityAlert | null {
  if (tickerData.length === 0) return null;

  // Calculate metrics for this ticker
  const totalVolume = tickerData.reduce((sum, t) => sum + t.volume, 0);
  const totalPremium = tickerData.reduce((sum, t) => {
    const premium = parseFloat(t.premium.replace(/[$,]/g, '')) || 0;
    return sum + premium;
  }, 0);
  
  const callVolume = tickerData.filter(t => t.optionType === 'Call').reduce((sum, t) => sum + t.volume, 0);
  const putVolume = tickerData.filter(t => t.optionType === 'Put').reduce((sum, t) => sum + t.volume, 0);
  const callPutRatio = putVolume > 0 ? callVolume / putVolume : callVolume;
  
  const sweepCount = tickerData.filter(t => t.sweepType && t.sweepType.toLowerCase().includes('sweep')).length;
  const avgTradeSize = totalVolume / tickerData.length;

  // Calculate baseline (average across all tickers for comparison)
  const allTickers = [...new Set(allData.map(t => t.ticker))];
  const avgVolumePerTicker = allData.reduce((sum, t) => sum + t.volume, 0) / allTickers.length;
  const avgPremiumPerTicker = allData.reduce((sum, t) => {
    const premium = parseFloat(t.premium.replace(/[$,]/g, '')) || 0;
    return sum + premium;
  }, 0) / allTickers.length;

  // Detection criteria
  const alerts: string[] = [];
  let severity: 'low' | 'medium' | 'high' = 'low';
  let alertType: 'volume' | 'premium' | 'sweep' | 'multiple' = 'volume';
  
  // High volume alert (3x average)
  if (totalVolume > avgVolumePerTicker * 3) {
    alerts.push(`Volume ${((totalVolume / avgVolumePerTicker) * 100).toFixed(0)}% above average`);
    severity = 'high';
    alertType = 'volume';
  } else if (totalVolume > avgVolumePerTicker * 2) {
    alerts.push(`Volume ${((totalVolume / avgVolumePerTicker) * 100).toFixed(0)}% above average`);
    severity = 'medium';
  }

  // High premium alert (3x average)
  if (totalPremium > avgPremiumPerTicker * 3) {
    alerts.push(`Premium ${((totalPremium / avgPremiumPerTicker) * 100).toFixed(0)}% above average`);
    severity = 'high';
    if (alertType !== 'volume') alertType = 'premium';
    else alertType = 'multiple';
  } else if (totalPremium > avgPremiumPerTicker * 2) {
    alerts.push(`Premium ${((totalPremium / avgPremiumPerTicker) * 100).toFixed(0)}% above average`);
    if (severity !== 'high') severity = 'medium';
  }

  // Unusual sweep activity
  if (sweepCount > 5) {
    alerts.push(`${sweepCount} sweeps detected`);
    severity = 'high';
    alertType = alertType === 'volume' || alertType === 'premium' ? 'multiple' : 'sweep';
  } else if (sweepCount > 2) {
    alerts.push(`${sweepCount} sweeps detected`);
    if (severity === 'low') severity = 'medium';
  }

  // Extreme call/put ratio
  if (callPutRatio > 5) {
    alerts.push(`Heavy call bias (${callPutRatio.toFixed(1)}:1)`);
    if (severity === 'low') severity = 'medium';
  } else if (callPutRatio < 0.2) {
    alerts.push(`Heavy put bias (1:${(1/callPutRatio).toFixed(1)})`);
    if (severity === 'low') severity = 'medium';
  }

  // Large average trade size
  if (avgTradeSize > 5000) {
    alerts.push(`Large avg trade size: ${formatVolume(Math.round(avgTradeSize))}`);
    if (severity === 'low') severity = 'medium';
  }

  // Return alert if any criteria met
  if (alerts.length > 0) {
    return {
      ticker,
      alertType,
      severity,
      reason: alerts.join(' • '),
      metrics: {
        totalVolume,
        totalPremium,
        callPutRatio,
        sweepCount,
        avgTradeSize
      }
    };
  }

  return null;
}

/**
 * Identify key price levels based on volume and open interest
 */
export function identifyKeyPriceLevels(
  tickerData: OptionData[],
  topN: number = 5
): KeyPriceLevel[] {
  if (tickerData.length === 0) return [];

  // Aggregate by strike price
  const strikeMap = new Map<number, {
    volume: number;
    openInterest: number;
    premium: number;
    callVolume: number;
    putVolume: number;
  }>();

  tickerData.forEach(trade => {
    const existing = strikeMap.get(trade.strike) || {
      volume: 0,
      openInterest: 0,
      premium: 0,
      callVolume: 0,
      putVolume: 0
    };

    const premium = parseFloat(trade.premium.replace(/[$,]/g, '')) || 0;

    existing.volume += trade.volume;
    existing.openInterest += trade.openInterest;
    existing.premium += premium;
    
    if (trade.optionType === 'Call') {
      existing.callVolume += trade.volume;
    } else {
      existing.putVolume += trade.volume;
    }

    strikeMap.set(trade.strike, existing);
  });

  // Convert to array and sort by combined score
  const levels = Array.from(strikeMap.entries()).map(([strike, data]) => {
    // Combined significance score (weighted: 40% volume, 40% OI, 20% premium)
    const maxVolume = Math.max(...Array.from(strikeMap.values()).map(v => v.volume));
    const maxOI = Math.max(...Array.from(strikeMap.values()).map(v => v.openInterest));
    const maxPremium = Math.max(...Array.from(strikeMap.values()).map(v => v.premium));
    
    const volumeScore = maxVolume > 0 ? data.volume / maxVolume : 0;
    const oiScore = maxOI > 0 ? data.openInterest / maxOI : 0;
    const premiumScore = maxPremium > 0 ? data.premium / maxPremium : 0;
    
    const combinedScore = volumeScore * 0.4 + oiScore * 0.4 + premiumScore * 0.2;
    
    let significance: 'high' | 'medium' | 'low' = 'low';
    if (combinedScore > 0.7) significance = 'high';
    else if (combinedScore > 0.4) significance = 'medium';

    let type: 'call' | 'put' | 'both' = 'both';
    if (data.callVolume > data.putVolume * 2) type = 'call';
    else if (data.putVolume > data.callVolume * 2) type = 'put';

    return {
      strike,
      volume: data.volume,
      openInterest: data.openInterest,
      premium: data.premium,
      significance,
      type,
      combinedScore
    };
  });

  // Sort by combined score and return top N
  return levels
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, topN)
    .map(({ combinedScore, ...rest }) => rest);
}

/**
 * Estimate gamma exposure at each strike
 * Note: This is a simplified estimation without actual Greeks data
 */
export function estimateGammaExposure(
  tickerData: OptionData[],
  currentPrice?: number
): GammaExposure[] {
  if (tickerData.length === 0) return [];

  // Aggregate by strike
  const strikeMap = new Map<number, {
    callVolume: number;
    putVolume: number;
    callOI: number;
    putOI: number;
  }>();

  tickerData.forEach(trade => {
    const existing = strikeMap.get(trade.strike) || {
      callVolume: 0,
      putVolume: 0,
      callOI: 0,
      putOI: 0
    };

    if (trade.optionType === 'Call') {
      existing.callVolume += trade.volume;
      existing.callOI += trade.openInterest;
    } else {
      existing.putVolume += trade.volume;
      existing.putOI += trade.openInterest;
    }

    strikeMap.set(trade.strike, existing);
  });

  // Calculate gamma exposure estimates
  const exposures = Array.from(strikeMap.entries()).map(([strike, data]) => {
    // Simplified gamma estimation:
    // Dealers are typically short options (providing liquidity)
    // Call OI = dealers short calls = negative gamma for dealers (must buy as price rises)
    // Put OI = dealers short puts = positive gamma for dealers (must sell as price falls)
    
    // Weight ATM options higher (simplified: within 10% of current price gets full weight)
    let atmWeight = 1;
    if (currentPrice) {
      const percentFromCurrent = Math.abs(strike - currentPrice) / currentPrice;
      if (percentFromCurrent < 0.05) atmWeight = 2; // Very close to ATM
      else if (percentFromCurrent < 0.10) atmWeight = 1.5; // Near ATM
      else if (percentFromCurrent > 0.20) atmWeight = 0.5; // Far OTM/ITM
    }

    // Net gamma exposure (negative = dealers need to buy on way up, sell on way down)
    // Using OI as it represents open positions that need hedging
    const netGammaExposure = (data.putOI - data.callOI) * atmWeight;
    
    const absExposure = Math.abs(netGammaExposure);
    const maxExposure = Math.max(...Array.from(strikeMap.values()).map(v => 
      Math.abs((v.putOI - v.callOI))
    ));
    
    let level: 'extreme' | 'high' | 'moderate' | 'low' = 'low';
    if (maxExposure > 0) {
      const exposureRatio = absExposure / maxExposure;
      if (exposureRatio > 0.7) level = 'extreme';
      else if (exposureRatio > 0.4) level = 'high';
      else if (exposureRatio > 0.2) level = 'moderate';
    }

    return {
      strike,
      netGammaExposure,
      callVolume: data.callVolume,
      putVolume: data.putVolume,
      callOI: data.callOI,
      putOI: data.putOI,
      level
    };
  });

  // Sort by strike price
  return exposures.sort((a, b) => a.strike - b.strike);
}

/**
 * Calculate max pain (strike where option holders lose most money)
 */
export function calculateMaxPain(tickerData: OptionData[]): number | null {
  if (tickerData.length === 0) return null;

  // Get unique strikes
  const strikes = [...new Set(tickerData.map(t => t.strike))].sort((a, b) => a - b);
  
  // For each strike, calculate total loss for option holders
  const painMap = new Map<number, number>();

  strikes.forEach(testStrike => {
    let totalPain = 0;

    tickerData.forEach(trade => {
      const { strike, optionType, openInterest } = trade;
      
      if (optionType === 'Call') {
        // Calls lose value if price is below strike
        if (testStrike < strike) {
          totalPain += openInterest * (strike - testStrike);
        }
      } else {
        // Puts lose value if price is above strike
        if (testStrike > strike) {
          totalPain += openInterest * (testStrike - strike);
        }
      }
    });

    painMap.set(testStrike, totalPain);
  });

  // Find strike with maximum pain
  let maxPainStrike = strikes[0];
  let maxPain = painMap.get(strikes[0]) || 0;

  painMap.forEach((pain, strike) => {
    if (pain > maxPain) {
      maxPain = pain;
      maxPainStrike = strike;
    }
  });

  return maxPainStrike;
}

/**
 * Get complete analytics for a ticker
 */
export function getTickerAnalytics(
  ticker: string,
  allData: OptionData[],
  currentPrice?: number
): TickerAnalytics {
  const tickerData = allData.filter(t => t.ticker === ticker);
  
  return {
    ticker,
    unusualActivity: detectUnusualActivity(tickerData, ticker, allData),
    keyPriceLevels: identifyKeyPriceLevels(tickerData, 5),
    gammaExposure: estimateGammaExposure(tickerData, currentPrice),
    maxPainStrike: calculateMaxPain(tickerData),
    currentPrice
  };
}

// Dark Pool Data Parsing Functions

/**
 * Parse dark pool CSV data
 * Expected CSV format: avatar, username, botText, timestamp, separator, hiddenVisually, ticker, quantity, price, totalValue, relativeTime, timestamp2, time, separator2
 */
export function parseDarkPoolData(csvContent: string, filename: string): DarkPoolData[] {
  // Check cache first
  const cacheKey = `${filename}-${csvContent.length}`;
  const darkPoolParseCache = getSessionDarkPoolParseCache(DARKPOOL_PARSE_CACHE_KEY);
  const cached = darkPoolParseCache.get(cacheKey);
  if (cached) {
    if (import.meta.env.DEV) {
      console.log(`Using cached dark pool data for ${filename}`);
    }
    return cached;
  }

  const lines = csvContent.split('\n');
  const darkPoolData: DarkPoolData[] = [];
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    try {
      // Parse CSV line - handle quoted fields
      const fields = parseCSVLine(line);
      
      if (fields.length < 14) continue;
      
      const ticker = fields[6]?.replace(/"/g, '').trim();
      const quantityStr = fields[7]?.replace(/"/g, '').replace(/,/g, '').trim();
      const priceStr = fields[8]?.replace(/"/g, '').trim();
      const totalValue = fields[9]?.replace(/"/g, '').trim();
      const timestampStr = fields[5]?.replace(/"/g, '').trim();
      
      // Skip rows without ticker or if ticker is empty
      if (!ticker || ticker === '' || ticker === '[') continue;
      
      // Parse quantity
      const quantity = parseInt(quantityStr);
      if (isNaN(quantity) || quantity <= 0) continue;
      
      // Parse price
      const price = parseFloat(priceStr);
      if (isNaN(price) || price <= 0) continue;
      
      // Parse timestamp
      const timestamp = parseTimestampFromData(timestampStr);
      if (!timestamp) continue;
      
      darkPoolData.push({
        ticker,
        quantity,
        price,
        totalValue,
        timestamp: timestamp.toISOString(),
        sourceFile: filename
      });
      
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn(`Error parsing dark pool line ${i}:`, error, line);
      }
      continue;
    }
  }
  
  // Cache the parsed data
  darkPoolParseCache.set(cacheKey, darkPoolData);
  setSessionDarkPoolParseCache(DARKPOOL_PARSE_CACHE_KEY, darkPoolParseCache);
  
  return darkPoolData;
}

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  fields.push(current);
  return fields;
}

/**
 * Merge dark pool data from multiple files
 */
export function mergeDarkPoolDataFromFiles(
  files: Array<{ filename: string; data: string; timestamp: Date }>
): { mergedData: DarkPoolData[]; info: MergedDataInfo } {
  const allData: DarkPoolData[] = [];
  let totalRecords = 0;
  let earliestDate: Date | null = null;
  let latestDate: Date | null = null;
  
  const fileInfo = files.map(file => {
    const parsedData = parseDarkPoolData(file.data, file.filename);
    allData.push(...parsedData);
    totalRecords += parsedData.length;
    
    // Update date range
    parsedData.forEach(record => {
      const recordDate = new Date(record.timestamp);
      if (!earliestDate || recordDate < earliestDate) {
        earliestDate = recordDate;
      }
      if (!latestDate || recordDate > latestDate) {
        latestDate = recordDate;
      }
    });
    
    return {
      filename: file.filename,
      recordCount: parsedData.length,
      timestamp: file.timestamp
    };
  });
  
  // Sort by timestamp (newest first)
  allData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  // Sort fileInfo by timestamp (newest first) to ensure the first file is the most recent
  fileInfo.sort((a, b) => {
    const timestampA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
    const timestampB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    return timestampB.getTime() - timestampA.getTime();
  });
  
  return {
    mergedData: allData,
    info: {
      totalFiles: files.length,
      totalRecords,
      dateRange: {
        earliest: earliestDate,
        latest: latestDate
      },
      files: fileInfo
    }
  };
}

/**
 * Get dark pool summaries by ticker
 */
export function getDarkPoolTickerSummaries(darkPoolData: DarkPoolData[]): Array<{
  ticker: string;
  totalQuantity: number;
  totalValue: number;
  averagePrice: number;
  tradeCount: number;
  lastActivity: string;
  lastActivityDate: Date | null;
  largestTrade: {
    quantity: number;
    price: number;
    totalValue: string;
    timestamp: string;
  } | null;
}> {
  // Check cache first
  const cacheKey = `${darkPoolData.length}_${darkPoolData.slice(0, 3).map(d => `${d.ticker}_${d.timestamp}`).join('_')}`;
  const darkPoolTickerSummaryCache = getSessionDarkPoolTickerSummaryCache(DARKPOOL_TICKER_SUMMARY_CACHE_KEY);
  const cached = darkPoolTickerSummaryCache.get(cacheKey);
  if (cached) {
    if (import.meta.env.DEV) {
      console.log('Using cached dark pool ticker summaries');
    }
    return cached;
  }

  const tickerMap = new Map<string, {
    ticker: string;
    totalQuantity: number;
    totalValue: number;
    tradeCount: number;
    lastActivityDate: Date | null;
    largestTrade: {
      quantity: number;
      price: number;
      totalValue: string;
      timestamp: string;
    } | null;
  }>();
  
  darkPoolData.forEach(trade => {
    const existing = tickerMap.get(trade.ticker) || {
      ticker: trade.ticker,
      totalQuantity: 0,
      totalValue: 0,
      tradeCount: 0,
      lastActivityDate: null,
      largestTrade: null
    };
    
    existing.totalQuantity += trade.quantity;
    existing.totalValue += trade.quantity * trade.price;
    existing.tradeCount += 1;
    
    // Update last activity
    const tradeDate = new Date(trade.timestamp);
    if (!existing.lastActivityDate || tradeDate > existing.lastActivityDate) {
      existing.lastActivityDate = tradeDate;
    }
    
    // Update largest trade
    if (!existing.largestTrade || trade.quantity > existing.largestTrade.quantity) {
      existing.largestTrade = {
        quantity: trade.quantity,
        price: trade.price,
        totalValue: trade.totalValue,
        timestamp: trade.timestamp
      };
    }
    
    tickerMap.set(trade.ticker, existing);
  });
  
  const result = Array.from(tickerMap.values()).map(data => ({
    ...data,
    averagePrice: data.totalValue / data.totalQuantity,
    lastActivity: data.lastActivityDate ? data.lastActivityDate.toLocaleString() : 'Unknown'
  })).sort((a, b) => b.totalValue - a.totalValue);

  // Cache the result
  darkPoolTickerSummaryCache.set(cacheKey, result);
  setSessionDarkPoolTickerSummaryCache(DARKPOOL_TICKER_SUMMARY_CACHE_KEY, darkPoolTickerSummaryCache);
  
  return result;
}
