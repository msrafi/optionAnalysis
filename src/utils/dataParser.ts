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
}

export interface TickerSummary {
  ticker: string;
  totalVolume: number;
  callVolume: number;
  putVolume: number;
  totalPremium: number;
  uniqueExpiries: string[];
  lastActivity: string;
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

export function parseCSVData(csvText: string): OptionData[] {
  const lines = csvText.split('\n');
  const data: OptionData[] = [];
  
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
      const timestamp = fields[5] || '';
      
      // Only process valid option data
      if (ticker && strike > 0 && expiry && optionType && volume > 0) {
        data.push({
          ticker,
          strike,
          expiry,
          optionType,
          volume,
          premium,
          openInterest,
          bidAskSpread,
          timestamp,
          sweepType
        });
      }
    } catch (error) {
      console.warn('Error parsing line:', line, error);
    }
  }
  
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

export function getTickerSummaries(data: OptionData[]): TickerSummary[] {
  const tickerMap = new Map<string, TickerSummary>();
  
  data.forEach(option => {
    if (!tickerMap.has(option.ticker)) {
      tickerMap.set(option.ticker, {
        ticker: option.ticker,
        totalVolume: 0,
        callVolume: 0,
        putVolume: 0,
        totalPremium: 0,
        uniqueExpiries: [],
        lastActivity: option.timestamp
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
    
    if (!summary.uniqueExpiries.includes(option.expiry)) {
      summary.uniqueExpiries.push(option.expiry);
    }
    
    // Update last activity if this is more recent
    if (new Date(option.timestamp) > new Date(summary.lastActivity)) {
      summary.lastActivity = option.timestamp;
    }
  });
  
  // Sort by most recent activity first, then by total volume
  return Array.from(tickerMap.values()).sort((a, b) => {
    const dateA = new Date(a.lastActivity);
    const dateB = new Date(b.lastActivity);
    
    // First sort by most recent activity
    if (dateA.getTime() !== dateB.getTime()) {
      return dateB.getTime() - dateA.getTime();
    }
    
    // If same activity time, sort by total volume
    return b.totalVolume - a.totalVolume;
  });
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
