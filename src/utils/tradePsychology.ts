import { OptionData, parseTimestampFromData } from './dataParser';

export interface HourlyTradeData {
  hour: number; // 0-23
  totalVolume: number;
  callVolume: number;
  putVolume: number;
  totalTrades: number;
  callTrades: number;
  putTrades: number;
  totalPremium: number;
  callPremium: number;
  putPremium: number;
  sweepCount: number;
  unusualSweepCount: number;
  highlyUnusualSweepCount: number;
  avgTradeSize: number;
  callPutRatio: number;
  premiumCallPutRatio: number;
  psychology: TradePsychology;
  trades: OptionData[]; // Individual trades for this hour
}

export interface TradePsychology {
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  confidence: 'high' | 'medium' | 'low';
  activity: 'high' | 'medium' | 'low';
  sweepIntensity: 'high' | 'medium' | 'low';
  description: string;
}

export interface DailyTradePsychology {
  date: string; // YYYY-MM-DD format
  dayOfWeek: string;
  hourlyData: HourlyTradeData[];
  dailySummary: {
    totalVolume: number;
    callVolume: number;
    putVolume: number;
    totalTrades: number;
    totalPremium: number;
    callPremium: number;
    putPremium: number;
    callPutRatio: number;
    sweepCount: number;
    uniqueExpiries: string[];
    psychology: TradePsychology;
    peakHour: number;
    peakVolume: number;
    peakTrades: number;
  };
}

export interface FourDayPsychologyAnalysis {
  days: DailyTradePsychology[];
  overallTrend: {
    sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
    confidence: 'high' | 'medium' | 'low';
    activity: 'increasing' | 'decreasing' | 'stable';
    description: string;
  };
  hourlyPatterns: {
    [hour: number]: {
      avgVolume: number;
      avgTrades: number;
      sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
      consistency: number; // 0-1, how consistent the pattern is across days
    };
  };
}

/**
 * Parse premium string to number
 */
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

/**
 * Analyze trade psychology for a given hour
 */
function analyzeTradePsychology(hourlyData: HourlyTradeData): TradePsychology {
  const { callPutRatio, premiumCallPutRatio, sweepCount, unusualSweepCount, highlyUnusualSweepCount, totalVolume, totalTrades } = hourlyData;
  
  // Determine sentiment based on call/put ratios
  let sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed' = 'neutral';
  if (callPutRatio > 1.5 && premiumCallPutRatio > 1.3) {
    sentiment = 'bullish';
  } else if (callPutRatio < 0.7 && premiumCallPutRatio < 0.8) {
    sentiment = 'bearish';
  } else if (Math.abs(callPutRatio - 1) < 0.3 && Math.abs(premiumCallPutRatio - 1) < 0.3) {
    sentiment = 'neutral';
  } else {
    sentiment = 'mixed';
  }
  
  // Determine confidence based on sweep activity and volume
  let confidence: 'high' | 'medium' | 'low' = 'low';
  const totalSweeps = sweepCount + unusualSweepCount + highlyUnusualSweepCount;
  if (totalSweeps > 5 || highlyUnusualSweepCount > 0 || totalVolume > 50000) {
    confidence = 'high';
  } else if (totalSweeps > 2 || unusualSweepCount > 0 || totalVolume > 20000) {
    confidence = 'medium';
  }
  
  // Determine activity level
  let activity: 'high' | 'medium' | 'low' = 'low';
  if (totalTrades > 20 || totalVolume > 30000) {
    activity = 'high';
  } else if (totalTrades > 10 || totalVolume > 15000) {
    activity = 'medium';
  }
  
  // Determine sweep intensity
  let sweepIntensity: 'high' | 'medium' | 'low' = 'low';
  if (highlyUnusualSweepCount > 0 || totalSweeps > 8) {
    sweepIntensity = 'high';
  } else if (unusualSweepCount > 0 || totalSweeps > 3) {
    sweepIntensity = 'medium';
  }
  
  // Generate description
  let description = '';
  if (sentiment === 'bullish') {
    description = `Strong bullish sentiment with ${callPutRatio.toFixed(1)}:1 call/put ratio`;
  } else if (sentiment === 'bearish') {
    description = `Strong bearish sentiment with ${(1/callPutRatio).toFixed(1)}:1 put/call ratio`;
  } else if (sentiment === 'mixed') {
    description = `Mixed sentiment with conflicting signals`;
  } else {
    description = `Neutral sentiment with balanced activity`;
  }
  
  if (sweepIntensity === 'high') {
    description += ` and high sweep activity (${totalSweeps} sweeps)`;
  } else if (sweepIntensity === 'medium') {
    description += ` and moderate sweep activity (${totalSweeps} sweeps)`;
  }
  
  if (activity === 'high') {
    description += ` - High volume trading`;
  } else if (activity === 'medium') {
    description += ` - Moderate activity`;
  }
  
  return {
    sentiment,
    confidence,
    activity,
    sweepIntensity,
    description
  };
}

/**
 * Check if an hour is within trading hours (9:30 AM - 4:15 PM ET)
 */
function isTradingHour(hour: number): boolean {
  // Trading hours: 9:30 AM (9.5) to 4:15 PM (16.25)
  return hour >= 9.5 && hour <= 16.25;
}

/**
 * Get trading hours for the day (9:30 AM - 4:15 PM)
 */
function getTradingHours(): number[] {
  const hours: number[] = [];
  // Start at 9:30 AM (9.5) and go to 4:15 PM (16.25)
  for (let hour = 9.5; hour <= 16.25; hour += 0.5) {
    hours.push(hour);
  }
  return hours;
}

/**
 * Aggregate trades by hour for a given day (trading hours only)
 */
export function aggregateTradesByHour(trades: OptionData[], targetDate: Date): HourlyTradeData[] {
  const hourlyMap = new Map<number, {
    totalVolume: number;
    callVolume: number;
    putVolume: number;
    totalTrades: number;
    callTrades: number;
    putTrades: number;
    totalPremium: number;
    callPremium: number;
    putPremium: number;
    sweepCount: number;
    unusualSweepCount: number;
    highlyUnusualSweepCount: number;
    trades: OptionData[];
  }>();
  
  // Initialize only trading hours (9:30 AM - 4:15 PM)
  const tradingHours = getTradingHours();
  tradingHours.forEach(hour => {
    hourlyMap.set(hour, {
      totalVolume: 0,
      callVolume: 0,
      putVolume: 0,
      totalTrades: 0,
      callTrades: 0,
      putTrades: 0,
      totalPremium: 0,
      callPremium: 0,
      putPremium: 0,
      sweepCount: 0,
      unusualSweepCount: 0,
      highlyUnusualSweepCount: 0,
      trades: []
    });
  });
  
  // Process each trade
  trades.forEach(trade => {
    const tradeDate = parseTimestampFromData(trade.timestamp);
    if (!tradeDate) return;
    
    // Check if trade is on the target date
    if (tradeDate.getFullYear() === targetDate.getFullYear() &&
        tradeDate.getMonth() === targetDate.getMonth() &&
        tradeDate.getDate() === targetDate.getDate()) {
      
      // Calculate hour with minutes (e.g., 9:30 AM = 9.5, 10:00 AM = 10)
      const rawHour = tradeDate.getHours() + (tradeDate.getMinutes() / 60);
      
      // Only process trades within trading hours
      if (!isTradingHour(rawHour)) return;
      
      // Round to nearest 30-minute interval (9.5, 10.0, 10.5, etc.)
      const hour = Math.round(rawHour * 2) / 2;
      
      const hourData = hourlyMap.get(hour);
      if (!hourData) return; // Skip if hour not found in map
      
      // Add trade to the trades array
      hourData.trades.push(trade);
      
      // Update volume and trade counts
      hourData.totalVolume += trade.volume;
      hourData.totalTrades += 1;
      
      const premium = parsePremium(trade.premium);
      hourData.totalPremium += premium;
      
      if (trade.optionType === 'Call') {
        hourData.callVolume += trade.volume;
        hourData.callTrades += 1;
        hourData.callPremium += premium;
      } else {
        hourData.putVolume += trade.volume;
        hourData.putTrades += 1;
        hourData.putPremium += premium;
      }
      
      // Count sweeps
      if (trade.sweepType) {
        const sweepType = trade.sweepType.toLowerCase();
        if (sweepType.includes('highly unusual')) {
          hourData.highlyUnusualSweepCount += 1;
        } else if (sweepType.includes('unusual')) {
          hourData.unusualSweepCount += 1;
        } else if (sweepType.includes('sweep')) {
          hourData.sweepCount += 1;
        }
      }
    }
  });
  
  // Convert to HourlyTradeData array with psychology analysis
  return Array.from(hourlyMap.entries()).map(([hour, data]) => {
    const callPutRatio = data.putVolume > 0 ? data.callVolume / data.putVolume : data.callVolume;
    const premiumCallPutRatio = data.putPremium > 0 ? data.callPremium / data.putPremium : data.callPremium;
    const avgTradeSize = data.totalTrades > 0 ? data.totalVolume / data.totalTrades : 0;
    
    const hourlyData: HourlyTradeData = {
      hour,
      totalVolume: data.totalVolume,
      callVolume: data.callVolume,
      putVolume: data.putVolume,
      totalTrades: data.totalTrades,
      callTrades: data.callTrades,
      putTrades: data.putTrades,
      totalPremium: data.totalPremium,
      callPremium: data.callPremium,
      putPremium: data.putPremium,
      sweepCount: data.sweepCount,
      unusualSweepCount: data.unusualSweepCount,
      highlyUnusualSweepCount: data.highlyUnusualSweepCount,
      avgTradeSize,
      callPutRatio,
      premiumCallPutRatio,
      trades: data.trades,
      psychology: { sentiment: 'neutral' as const, confidence: 'low' as const, activity: 'low' as const, sweepIntensity: 'low' as const, description: '' }
    };
    
    // Re-analyze psychology with complete data
    hourlyData.psychology = analyzeTradePsychology(hourlyData);
    
    return hourlyData;
  })
  .filter((data): data is HourlyTradeData => data !== undefined && data !== null)
  .sort((a, b) => a.hour - b.hour);
}

/**
 * Analyze trade psychology for a single day
 */
export function analyzeDailyTradePsychology(trades: OptionData[], targetDate: Date): DailyTradePsychology {
  const hourlyData = aggregateTradesByHour(trades, targetDate);
  
  // Handle case where no hourly data is available
  if (!hourlyData || hourlyData.length === 0) {
    return {
      date: targetDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      dayOfWeek: targetDate.toLocaleDateString('en-US', { weekday: 'long' }),
      hourlyData: [],
      dailySummary: {
        totalVolume: 0,
        callVolume: 0,
        putVolume: 0,
        totalTrades: 0,
        totalPremium: 0,
        callPremium: 0,
        putPremium: 0,
        callPutRatio: 0,
        peakVolume: 0,
        peakHour: 0,
        peakTrades: 0,
        sweepCount: 0,
        uniqueExpiries: [],
        psychology: {
          sentiment: 'neutral',
          confidence: 'low',
          activity: 'low',
          sweepIntensity: 'low',
          description: 'No trading data available'
        }
      }
    };
  }
  
  // Calculate daily summary
  const dailySummary = hourlyData.reduce((summary, hourData) => {
    summary.totalVolume += hourData.totalVolume;
    summary.totalTrades += hourData.totalTrades;
    summary.totalPremium += hourData.totalPremium;
    summary.sweepCount += hourData.sweepCount + hourData.unusualSweepCount + hourData.highlyUnusualSweepCount;
    
    if (hourData.totalVolume > summary.peakVolume) {
      summary.peakVolume = hourData.totalVolume;
      summary.peakHour = hourData.hour;
    }
    
    if (hourData.totalTrades > summary.peakTrades) {
      summary.peakTrades = hourData.totalTrades;
    }
    
    return summary;
  }, {
    totalVolume: 0,
    callVolume: 0,
    putVolume: 0,
    totalTrades: 0,
    totalPremium: 0,
    callPremium: 0,
    putPremium: 0,
    callPutRatio: 0,
    sweepCount: 0,
    uniqueExpiries: [] as string[],
    psychology: { sentiment: 'neutral' as 'bullish' | 'bearish' | 'neutral' | 'mixed', confidence: 'low' as 'high' | 'medium' | 'low', activity: 'low' as 'high' | 'medium' | 'low', sweepIntensity: 'low' as 'high' | 'medium' | 'low', description: '' },
    peakHour: 0,
    peakVolume: 0,
    peakTrades: 0
  });
  
  // Calculate overall call/put volume and premium
  const totalCallVolume = hourlyData.reduce((sum, h) => sum + h.callVolume, 0);
  const totalPutVolume = hourlyData.reduce((sum, h) => sum + h.putVolume, 0);
  const totalCallPremium = hourlyData.reduce((sum, h) => sum + h.callPremium, 0);
  const totalPutPremium = hourlyData.reduce((sum, h) => sum + h.putPremium, 0);
  
  // Add call/put breakdown to daily summary
  dailySummary.callVolume = totalCallVolume;
  dailySummary.putVolume = totalPutVolume;
  dailySummary.callPremium = totalCallPremium;
  dailySummary.putPremium = totalPutPremium;
  dailySummary.callPutRatio = totalPutVolume > 0 ? totalCallVolume / totalPutVolume : totalCallVolume;
  
  if (import.meta.env.DEV) {
    console.log(`📊 Daily Summary for ${targetDate.toISOString().split('T')[0]}:`, {
      callVolume: totalCallVolume,
      putVolume: totalPutVolume,
      callPremium: totalCallPremium,
      putPremium: totalPutPremium
    });
  }
  
  // Calculate unique expiries for the day
  const expirySet = new Set<string>();
  trades.forEach(trade => {
    const tradeDate = parseTimestampFromData(trade.timestamp);
    if (tradeDate && tradeDate.toISOString().split('T')[0] === targetDate.toISOString().split('T')[0]) {
      expirySet.add(trade.expiry);
    }
  });
  dailySummary.uniqueExpiries = Array.from(expirySet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime()) as string[];
  
  // Analyze overall daily psychology - create a complete HourlyTradeData object
  const dailyHourlyData: HourlyTradeData = {
    hour: 0,
    totalVolume: dailySummary.totalVolume,
    callVolume: totalCallVolume,
    putVolume: totalPutVolume,
    totalTrades: dailySummary.totalTrades,
    callTrades: hourlyData.reduce((sum, h) => sum + h.callTrades, 0),
    putTrades: hourlyData.reduce((sum, h) => sum + h.putTrades, 0),
    totalPremium: dailySummary.totalPremium,
    callPremium: totalCallPremium,
    putPremium: totalPutPremium,
    sweepCount: hourlyData.reduce((sum, h) => sum + h.sweepCount, 0),
    unusualSweepCount: hourlyData.reduce((sum, h) => sum + h.unusualSweepCount, 0),
    highlyUnusualSweepCount: hourlyData.reduce((sum, h) => sum + h.highlyUnusualSweepCount, 0),
    avgTradeSize: dailySummary.totalTrades > 0 ? dailySummary.totalVolume / dailySummary.totalTrades : 0,
    callPutRatio: dailySummary.callPutRatio,
    premiumCallPutRatio: totalPutPremium > 0 ? totalCallPremium / totalPutPremium : totalCallPremium,
    trades: trades.filter(t => {
      const tradeDate = parseTimestampFromData(t.timestamp);
      return tradeDate && tradeDate.toISOString().split('T')[0] === targetDate.toISOString().split('T')[0];
    }),
    psychology: { sentiment: 'neutral' as const, confidence: 'low' as const, activity: 'low' as const, sweepIntensity: 'low' as const, description: '' }
  };
  
  dailySummary.psychology = analyzeTradePsychology(dailyHourlyData);
  
  const dateStr = targetDate.toISOString().split('T')[0];
  const dayOfWeek = targetDate.toLocaleDateString('en-US', { weekday: 'long' });
  
  return {
    date: dateStr,
    dayOfWeek,
    hourlyData,
    dailySummary
  };
}

/**
 * Get the previous trading day (Monday-Friday, excluding weekends)
 */
function getPreviousTradingDay(date: Date): Date {
  const prevDay = new Date(date);
  prevDay.setDate(date.getDate() - 1);
  
  // If it's Sunday (0), go back to Friday (5)
  if (prevDay.getDay() === 0) {
    prevDay.setDate(prevDay.getDate() - 2);
  }
  // If it's Saturday (6), go back to Friday (5)
  else if (prevDay.getDay() === 6) {
    prevDay.setDate(prevDay.getDate() - 1);
  }
  
  return prevDay;
}

/**
 * Check if a date is a trading day (Monday-Friday)
 */
function isTradingDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5; // Monday = 1, Friday = 5
}

/**
 * Get the most recent date from the trades data
 */
function getMostRecentTradeDate(trades: OptionData[]): Date {
  let mostRecentDate = new Date(0); // Start with epoch
  
  trades.forEach(trade => {
    const tradeDate = parseTimestampFromData(trade.timestamp);
    if (tradeDate && tradeDate > mostRecentDate) {
      mostRecentDate = tradeDate;
    }
  });
  
  return mostRecentDate;
}

/**
 * Analyze trade psychology for the past 5 trading days
 */
export function analyzeFourDayTradePsychology(trades: OptionData[]): FourDayPsychologyAnalysis {
  const days: DailyTradePsychology[] = [];
  
  // Get the most recent date from the actual trade data
  const mostRecentDate = getMostRecentTradeDate(trades);
  
  // Start from the most recent trading day in the data
  let currentDate = new Date(mostRecentDate);
  if (!isTradingDay(currentDate)) {
    // If the most recent date is weekend, start from the last trading day
    currentDate = getPreviousTradingDay(currentDate);
  }
  
  // Get data for the past 5 trading days
  for (let i = 0; i < 5; i++) {
    const targetDate = new Date(currentDate);
    targetDate.setHours(0, 0, 0, 0); // Start of day
    
    const dayAnalysis = analyzeDailyTradePsychology(trades, targetDate);
    days.push(dayAnalysis);
    
    // Move to previous trading day
    currentDate = getPreviousTradingDay(currentDate);
  }
  
  // Reverse to get chronological order (oldest to newest)
  days.reverse();
  
  // Analyze overall trend
  const overallTrend = analyzeOverallTrend(days);
  
  // Analyze hourly patterns
  const hourlyPatterns = analyzeHourlyPatterns(days);
  
  return {
    days,
    overallTrend,
    hourlyPatterns
  };
}

/**
 * Analyze overall trend across the 5 trading days
 */
function analyzeOverallTrend(days: DailyTradePsychology[]): FourDayPsychologyAnalysis['overallTrend'] {
  if (days.length === 0) {
    return {
      sentiment: 'neutral',
      confidence: 'low',
      activity: 'stable',
      description: 'No data available'
    };
  }
  
  // Calculate trend metrics
  const sentiments = days.map(d => d.dailySummary.psychology.sentiment);
  const volumes = days.map(d => d.dailySummary.totalVolume);
  const confidences = days.map(d => d.dailySummary.psychology.confidence);
  
  // Determine overall sentiment
  const sentimentCounts = sentiments.reduce((acc, sentiment) => {
    acc[sentiment] = (acc[sentiment] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const dominantSentiment = Object.entries(sentimentCounts)
    .sort(([,a], [,b]) => b - a)[0][0] as 'bullish' | 'bearish' | 'neutral' | 'mixed';
  
  // Determine confidence
  const highConfidenceDays = confidences.filter(c => c === 'high').length;
  const confidence = highConfidenceDays >= 2 ? 'high' : 
                    highConfidenceDays >= 1 ? 'medium' : 'low';
  
  // Determine activity trend
  const volumeTrend = volumes[volumes.length - 1] - volumes[0];
  const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
  const activity = volumeTrend > avgVolume * 0.2 ? 'increasing' :
                   volumeTrend < -avgVolume * 0.2 ? 'decreasing' : 'stable';
  
  // Generate description
  let description = `Overall ${dominantSentiment} sentiment over 5 trading days`;
  if (confidence === 'high') {
    description += ' with high confidence';
  } else if (confidence === 'medium') {
    description += ' with moderate confidence';
  }
  
  if (activity === 'increasing') {
    description += ' and increasing activity';
  } else if (activity === 'decreasing') {
    description += ' and decreasing activity';
  } else {
    description += ' with stable activity';
  }
  
  return {
    sentiment: dominantSentiment,
    confidence,
    activity,
    description
  };
}

/**
 * Analyze hourly patterns across the 5 trading days (trading hours only)
 */
function analyzeHourlyPatterns(days: DailyTradePsychology[]): FourDayPsychologyAnalysis['hourlyPatterns'] {
  const patterns: FourDayPsychologyAnalysis['hourlyPatterns'] = {};
  
  // Initialize only trading hours (9:30 AM - 4:15 PM)
  const tradingHours = getTradingHours();
  tradingHours.forEach(hour => {
    patterns[hour] = {
      avgVolume: 0,
      avgTrades: 0,
      sentiment: 'neutral',
      consistency: 0
    };
  });
  
  // Calculate averages and patterns for each trading hour
  tradingHours.forEach(hour => {
    const hourData = days.map(day => day.hourlyData.find(h => h.hour === hour)).filter((h): h is HourlyTradeData => h !== undefined);
    
    if (hourData.length === 0) return;
    
    // Calculate averages
    const avgVolume = hourData.reduce((sum, h) => sum + h.totalVolume, 0) / hourData.length;
    const avgTrades = hourData.reduce((sum, h) => sum + h.totalTrades, 0) / hourData.length;
    
    // Determine dominant sentiment for this hour
    const sentiments = hourData.map(h => h.psychology.sentiment);
    const sentimentCounts = sentiments.reduce((acc, sentiment) => {
      acc[sentiment] = (acc[sentiment] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const dominantSentiment = Object.entries(sentimentCounts)
      .sort(([,a], [,b]) => b - a)[0][0] as 'bullish' | 'bearish' | 'neutral' | 'mixed';
    
    // Calculate consistency (how often the same sentiment occurs)
    const maxCount = Math.max(...Object.values(sentimentCounts));
    const consistency = maxCount / hourData.length;
    
    patterns[hour] = {
      avgVolume,
      avgTrades,
      sentiment: dominantSentiment,
      consistency
    };
  });
  
  return patterns;
}

/**
 * Get the 5 most recent trading days with data
 */
export function getRecentTradingDays(trades: OptionData[]): Date[] {
  const dates = new Set<string>();
  
  trades.forEach(trade => {
    const tradeDate = parseTimestampFromData(trade.timestamp);
    if (tradeDate && isTradingDay(tradeDate)) {
      const dateStr = tradeDate.toISOString().split('T')[0];
      dates.add(dateStr);
    }
  });
  
  const sortedDates = Array.from(dates)
    .map(dateStr => new Date(dateStr))
    .sort((a, b) => b.getTime() - a.getTime())
    .slice(0, 5);
  
  return sortedDates;
}

// New interfaces for ticker weekly analysis
export interface WeeklyTickerData {
  weekStart: string; // YYYY-MM-DD format
  weekEnd: string;   // YYYY-MM-DD format
  ticker: string;
  totalVolume: number;
  callVolume: number;
  putVolume: number;
  totalTrades: number;
  callTrades: number;
  putTrades: number;
  totalPremium: number;
  callPremium: number;
  putPremium: number;
  callPutRatio: number;
  premiumCallPutRatio: number;
  sweepCount: number;
  unusualSweepCount: number;
  highlyUnusualSweepCount: number;
  avgTradeSize: number;
  uniqueExpiries: string[];
  psychology: TradePsychology;
}

export interface TickerWeeklyAnalysis {
  ticker: string;
  weeks: WeeklyTickerData[];
  overallSentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  trendDirection: 'improving' | 'declining' | 'stable';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Get week start date (Monday) for a given date
 */
function getWeekStart(date: Date): Date {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(date.setDate(diff));
}

/**
 * Get week end date (Friday) for a given date
 */
function getWeekEnd(weekStart: Date): Date {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 4); // Friday is 4 days after Monday
  return weekEnd;
}

/**
 * Format date to YYYY-MM-DD string
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Analyze weekly trade psychology (similar to hourly but for weekly data)
 */
function analyzeWeeklyTradePsychology(weeklyData: {
  callPutRatio: number;
  premiumCallPutRatio: number;
  totalVolume: number;
  totalTrades: number;
  sweepCount: number;
  unusualSweepCount: number;
  highlyUnusualSweepCount: number;
  avgTradeSize: number;
}): TradePsychology {
  const { callPutRatio, premiumCallPutRatio, sweepCount, unusualSweepCount, highlyUnusualSweepCount, totalVolume, totalTrades } = weeklyData;
  
  // Determine sentiment based on call/put ratios
  let sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed' = 'neutral';
  if (callPutRatio > 1.5 && premiumCallPutRatio > 1.3) {
    sentiment = 'bullish';
  } else if (callPutRatio < 0.7 && premiumCallPutRatio < 0.8) {
    sentiment = 'bearish';
  } else if (Math.abs(callPutRatio - 1) < 0.3 && Math.abs(premiumCallPutRatio - 1) < 0.3) {
    sentiment = 'neutral';
  } else {
    sentiment = 'mixed';
  }

  // Determine activity level
  let activity: 'high' | 'medium' | 'low' = 'low';
  if (totalVolume > 100000 || totalTrades > 1000) {
    activity = 'high';
  } else if (totalVolume > 10000 || totalTrades > 100) {
    activity = 'medium';
  }

  // Determine sweep intensity
  let sweepIntensity: 'high' | 'medium' | 'low' = 'low';
  const totalSweeps = sweepCount + unusualSweepCount + highlyUnusualSweepCount;
  if (totalSweeps > 50 || highlyUnusualSweepCount > 10) {
    sweepIntensity = 'high';
  } else if (totalSweeps > 10 || unusualSweepCount > 5) {
    sweepIntensity = 'medium';
  }

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' = 'low';
  const volumeThreshold = 50000;
  const tradesThreshold = 500;
  
  if (totalVolume > volumeThreshold && totalTrades > tradesThreshold && totalSweeps > 20) {
    confidence = 'high';
  } else if (totalVolume > volumeThreshold / 2 && totalTrades > tradesThreshold / 2 && totalSweeps > 5) {
    confidence = 'medium';
  }

  // Generate description
  let description = '';
  if (sentiment === 'bullish') {
    description = `Strong bullish sentiment with ${callPutRatio.toFixed(1)}:1 call/put ratio and high call premium dominance`;
  } else if (sentiment === 'bearish') {
    description = `Bearish sentiment with ${callPutRatio.toFixed(1)}:1 call/put ratio indicating put buying pressure`;
  } else if (sentiment === 'neutral') {
    description = `Balanced sentiment with neutral call/put ratios around 1:1`;
  } else {
    description = `Mixed sentiment with varying call/put ratios indicating uncertainty`;
  }

  if (sweepIntensity === 'high') {
    description += ` and high sweep activity (${totalSweeps} sweeps)`;
  } else if (sweepIntensity === 'medium') {
    description += ` with moderate sweep activity`;
  }

  return {
    sentiment,
    confidence,
    activity,
    sweepIntensity,
    description
  };
}

/**
 * Analyze ticker sentiment by week
 */
export function analyzeTickerWeeklySentiment(trades: OptionData[]): TickerWeeklyAnalysis[] {
  // Group trades by ticker
  const tickerGroups = new Map<string, OptionData[]>();
  
  trades.forEach(trade => {
    if (!tickerGroups.has(trade.ticker)) {
      tickerGroups.set(trade.ticker, []);
    }
    tickerGroups.get(trade.ticker)!.push(trade);
  });

  const analyses: TickerWeeklyAnalysis[] = [];

  tickerGroups.forEach((tickerTrades, ticker) => {
    // Group by week
    const weekGroups = new Map<string, OptionData[]>();
    
    tickerTrades.forEach(trade => {
      const tradeDate = parseTimestampFromData(trade.timestamp);
      if (tradeDate) {
        const weekStart = getWeekStart(new Date(tradeDate));
        const weekKey = formatDate(weekStart);
        
        if (!weekGroups.has(weekKey)) {
          weekGroups.set(weekKey, []);
        }
        weekGroups.get(weekKey)!.push(trade);
      }
    });

    // Analyze each week
    const weeks: WeeklyTickerData[] = [];
    
    weekGroups.forEach((weekTrades, weekKey) => {
      const weekStartDate = new Date(weekKey);
      const weekEndDate = getWeekEnd(new Date(weekStartDate));
      
      // Calculate weekly metrics
      const totalVolume = weekTrades.reduce((sum, trade) => sum + trade.volume, 0);
      const callTrades = weekTrades.filter(trade => trade.optionType === 'Call');
      const putTrades = weekTrades.filter(trade => trade.optionType === 'Put');
      
      const callVolume = callTrades.reduce((sum, trade) => sum + trade.volume, 0);
      const putVolume = putTrades.reduce((sum, trade) => sum + trade.volume, 0);
      
      const totalTrades = weekTrades.length;
      const callTradeCount = callTrades.length;
      const putTradeCount = putTrades.length;
      
      const totalPremium = weekTrades.reduce((sum, trade) => {
        const premium = parseFloat(trade.premium.replace(/[$,]/g, ''));
        return sum + (isNaN(premium) ? 0 : premium);
      }, 0);
      
      const callPremium = callTrades.reduce((sum, trade) => {
        const premium = parseFloat(trade.premium.replace(/[$,]/g, ''));
        return sum + (isNaN(premium) ? 0 : premium);
      }, 0);
      
      const putPremium = putTrades.reduce((sum, trade) => {
        const premium = parseFloat(trade.premium.replace(/[$,]/g, ''));
        return sum + (isNaN(premium) ? 0 : premium);
      }, 0);
      
      const callPutRatio = putVolume > 0 ? callVolume / putVolume : callVolume;
      const premiumCallPutRatio = putPremium > 0 ? callPremium / putPremium : callPremium;
      
      const sweepCount = weekTrades.filter(trade => 
        trade.sweepType && trade.sweepType.toLowerCase().includes('sweep')
      ).length;
      
      const unusualSweepCount = weekTrades.filter(trade => 
        trade.sweepType && trade.sweepType.toLowerCase().includes('unusual')
      ).length;
      
      const highlyUnusualSweepCount = weekTrades.filter(trade => 
        trade.sweepType && trade.sweepType.toLowerCase().includes('highly unusual')
      ).length;
      
      const avgTradeSize = totalTrades > 0 ? totalVolume / totalTrades : 0;
      
      const uniqueExpiries = [...new Set(weekTrades.map(trade => trade.expiry))];
      
      // Analyze psychology for this week
      const psychology = analyzeWeeklyTradePsychology({
        callPutRatio,
        premiumCallPutRatio,
        totalVolume,
        totalTrades,
        sweepCount,
        unusualSweepCount,
        highlyUnusualSweepCount,
        avgTradeSize
      });

      weeks.push({
        weekStart: formatDate(weekStartDate),
        weekEnd: formatDate(weekEndDate),
        ticker,
        totalVolume,
        callVolume,
        putVolume,
        totalTrades,
        callTrades: callTradeCount,
        putTrades: putTradeCount,
        totalPremium,
        callPremium,
        putPremium,
        callPutRatio,
        premiumCallPutRatio,
        sweepCount,
        unusualSweepCount,
        highlyUnusualSweepCount,
        avgTradeSize,
        uniqueExpiries,
        psychology
      });
    });

    // Sort weeks by date (most recent first)
    weeks.sort((a, b) => {
      const dateA = new Date(a.weekStart);
      const dateB = new Date(b.weekStart);
      return dateB.getTime() - dateA.getTime();
    });

    // Determine overall sentiment and trend
    const sentiments = weeks.map(w => w.psychology.sentiment);
    const sentimentCounts = sentiments.reduce((acc, sentiment) => {
      acc[sentiment] = (acc[sentiment] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const overallSentiment = Object.entries(sentimentCounts)
      .sort(([,a], [,b]) => b - a)[0][0] as 'bullish' | 'bearish' | 'neutral' | 'mixed';

    // Determine trend direction by comparing recent weeks
    let trendDirection: 'improving' | 'declining' | 'stable' = 'stable';
    if (weeks.length >= 2) {
      const recentSentiment = weeks[0].psychology.sentiment;
      const previousSentiment = weeks[1].psychology.sentiment;
      
      if ((recentSentiment === 'bullish' && previousSentiment !== 'bullish') ||
          (recentSentiment === 'bearish' && previousSentiment !== 'bearish')) {
        trendDirection = 'improving';
      } else if ((recentSentiment === 'bearish' && previousSentiment === 'bullish') ||
                 (recentSentiment === 'neutral' && previousSentiment === 'bullish')) {
        trendDirection = 'declining';
      }
    }

    // Calculate confidence based on consistency
    const maxCount = Math.max(...Object.values(sentimentCounts));
    const confidence = maxCount / sentiments.length > 0.7 ? 'high' : 
                      maxCount / sentiments.length > 0.5 ? 'medium' : 'low';

    analyses.push({
      ticker,
      weeks,
      overallSentiment,
      trendDirection,
      confidence
    });
  });

  // Sort by total volume across all weeks (most active tickers first)
  analyses.sort((a, b) => {
    const aTotalVolume = a.weeks.reduce((sum, week) => sum + week.totalVolume, 0);
    const bTotalVolume = b.weeks.reduce((sum, week) => sum + week.totalVolume, 0);
    return bTotalVolume - aTotalVolume;
  });

  return analyses;
}
