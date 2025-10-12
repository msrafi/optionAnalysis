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

// Cache for parsed data to avoid re-parsing
const parseCache = new Map<string, OptionData[]>();

// Clear cache function for development
export function clearDataCache() {
  parseCache.clear();
  tickerSummaryCache.clear();
  if (import.meta.env.DEV) {
    console.log('Data cache cleared - all caches reset');
  }
}

/**
 * Parse timestamp from CSV data
 * Expected format: "Wednesday, October 8, 2025 at 3:02 PM"
 */
export function parseTimestampFromData(timestampStr: string): Date | null {
  try {
    if (!timestampStr) return null;
    
    // Handle format: "Wednesday, October 8, 2025 at 3:02 PM"
    const match = timestampStr.match(/(\w+),\s+(\w+)\s+(\d+),\s+(\d+)\s+at\s+(\d+):(\d+)\s+(AM|PM)/i);
    if (!match) {
      if (import.meta.env.DEV) {
        console.warn(`Timestamp format not recognized: ${timestampStr}`);
      }
      return null;
    }
    
    const [, , monthName, day, year, hour, minute, ampm] = match;
    
    // Convert month name to number
    const monthMap: { [key: string]: number } = {
      'january': 0, 'february': 1, 'march': 2, 'april': 3,
      'may': 4, 'june': 5, 'july': 6, 'august': 7,
      'september': 8, 'october': 9, 'november': 10, 'december': 11
    };
    
    const month = monthMap[monthName.toLowerCase()];
    if (month === undefined) {
      if (import.meta.env.DEV) {
        console.warn(`Unknown month: ${monthName}`);
      }
      return null;
    }
    
    // Convert 12-hour to 24-hour format
    let hour24 = parseInt(hour);
    if (ampm.toUpperCase() === 'PM' && hour24 !== 12) {
      hour24 += 12;
    } else if (ampm.toUpperCase() === 'AM' && hour24 === 12) {
      hour24 = 0;
    }
    
    const parsedDate = new Date(parseInt(year), month, parseInt(day), hour24, parseInt(minute));
    return parsedDate;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(`Failed to parse timestamp: ${timestampStr}`, error);
    }
    return null;
  }
}

export function parseCSVData(csvText: string, sourceFile?: string): OptionData[] {
  // Check cache first
  const cacheKey = `${sourceFile || 'unknown'}_${csvText.length}_${csvText.slice(0, 100)}`;
  const cached = parseCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const lines = csvText.split('\n');
  const data: OptionData[] = [];
  
  // Pre-allocate array with estimated size for better performance
  const estimatedSize = Math.max(1000, lines.length * 0.8);
  data.length = estimatedSize;
  let dataIndex = 0;
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV line (handle quoted fields)
    const fields = parseCSVLine(line);
    
    if (fields.length < 20) continue;
    
    try {
      // Extract relevant fields based on the CSV structure
      const sweepType = fields[6] || '';
      const ticker = fields[7] || '';
      const strike = parseFloat(fields[8]) || 0;
      const expiry = fields[9] || '';
      const optionType = fields[10] as 'Call' | 'Put';
      const volume = parseInt(fields[12]?.replace(/,/g, '') || '0');
      const premium = fields[13] || '$0';
      const openInterest = parseInt(fields[14]?.replace(/,/g, '') || '0');
      const bidAskSpread = parseInt(fields[15]?.replace(/,/g, '') || '0');
      const timestamp = fields[5] || ''; // Use the actual timestamp from column 6 (index 5)
      
      // Filter out non-ticker entries (trade types, sweep types, etc.)
      const invalidTickers = ['Ask', 'Above', 'Bid', 'Below', 'Sweep', 'Block', 'Trade', 'Volume', 'Premium'];
      const isValidTicker = ticker && 
        ticker.length >= 1 && 
        ticker.length <= 10 && 
        !invalidTickers.includes(ticker) &&
        !ticker.match(/^\d+$/) && // Not just numbers
        !ticker.includes(' ') && // No spaces
        /^[A-Z0-9]+$/.test(ticker); // Only uppercase letters and numbers
      
      // Only process valid option data with valid tickers
      if (isValidTicker && strike > 0 && expiry && optionType && volume > 0) {
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
  
  // Trim array to actual size
  data.length = dataIndex;
  
  // Cache the result
  parseCache.set(cacheKey, data);
  
  return data;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  fields.push(current.trim());
  return fields;
}

// Cache for ticker summaries
const tickerSummaryCache = new Map<string, TickerSummary[]>();

export function getTickerSummaries(data: OptionData[]): TickerSummary[] {
  // Create cache key based on data length and first few items
  const cacheKey = `${data.length}_${data.slice(0, 3).map(d => `${d.ticker}_${d.timestamp}`).join('_')}`;
  const cached = tickerSummaryCache.get(cacheKey);
  if (cached) {
    return cached;
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
    const dateA = a.lastActivityDate;
    const dateB = b.lastActivityDate;
    
    // First sort by most recent activity
    if (dateA && dateB && dateA.getTime() !== dateB.getTime()) {
      return dateB.getTime() - dateA.getTime();
    }
    
    // If same activity time or no dates, sort by total volume
    return b.totalVolume - a.totalVolume;
  });
  
  // Cache the result
  tickerSummaryCache.set(cacheKey, result);
  
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

export function getExpiryDatesForTicker(data: OptionData[], ticker: string): string[] {
  const expiries = new Set<string>();
  
  data.forEach(option => {
    if (option.ticker === ticker) {
      expiries.add(option.expiry);
    }
  });
  
  return Array.from(expiries).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
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

function parsePremium(premium: string): number {
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
  
  // Sort files by timestamp (most recent first)
  const sortedFiles = fileData.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  sortedFiles.forEach(file => {
    const parsedData = parseCSVData(file.data, file.filename);
    mergedData.push(...parsedData);
    
    fileInfo.push({
      filename: file.filename,
      recordCount: parsedData.length,
      timestamp: file.timestamp
    });
    
    // Update date range
    if (!earliestDate || file.timestamp < earliestDate) {
      earliestDate = file.timestamp;
    }
    if (!latestDate || file.timestamp > latestDate) {
      latestDate = file.timestamp;
    }
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
