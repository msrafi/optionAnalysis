import React, { useEffect, useMemo, useState, useRef } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { fetchYahooMostActiveOptions, fetchYahooOptionChain, YahooMostActiveOptionRow } from '../utils/yahooOptions';

type DashboardType = 'options' | 'darkpool' | 'psychology' | 'yahoo' | 'chainStructure' | 'chainStructureYahoo';

interface YahooChainStructureDashboardProps {
  activeDashboard: DashboardType;
  setActiveDashboard: (dashboard: DashboardType) => void;
}

function buildTradingViewOptionUrl(contractSymbol: string): string {
  // Yahoo contract symbols are typically OCC-formatted:
  // ROOT + YYMMDD + C/P + STRIKE(8 digits, strike * 1000)
  // Example: MU260522C00710000 -> OPRA:MU260522C710.0
  const match = contractSymbol.match(/^([A-Z.]+)(\d{6})([CP])(\d{8})$/);
  let opraSymbol = contractSymbol;

  if (match) {
    const [, root, datePart, cp, strikeRaw] = match;
    const strike = (parseInt(strikeRaw, 10) / 1000).toFixed(1);
    opraSymbol = `${root}${datePart}${cp}${strike}`;
  }

  const encoded = encodeURIComponent(`OPRA:${opraSymbol}`);
  return `https://www.tradingview.com/chart/w5Dqfeyt/?symbol=${encoded}`;
}

function formatContractSymbol(contractSymbol: string): string {
  // OCC format: ROOT + YYMMDD + C/P + STRIKE(8 digits, strike * 1000)
  // Example: NVDA260615C00210000 -> NVDA 210C 06/15
  const match = contractSymbol.match(/^([A-Z.]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!match) return contractSymbol;

  const [, root, , month, day, cp, strikeRaw] = match;
  const strike = parseInt(strikeRaw, 10) / 1000;
  const strikeText = Number.isInteger(strike) ? strike.toFixed(0) : strike.toString();

  return `${root} ${strikeText}${cp} ${month}/${day}`;
}

function getMostActiveOptionType(row: YahooMostActiveOptionRow): 'CALL' | 'PUT' {
  const normalizedType = String(row.optionType || '').toUpperCase();
  if (normalizedType === 'CALL' || normalizedType === 'PUT') return normalizedType;

  // Fallback to OCC symbol parsing when Yahoo omits/changes optionType.
  const cpMatch = String(row.contractSymbol || '').match(/([CP])\d{8}$/);
  return cpMatch?.[1] === 'C' ? 'CALL' : 'PUT';
}

interface ChainRow {
  strike: number;
  callVolume: number;
  callOi: number;
  callIv: number;
  putVolume: number;
  putOi: number;
  putIv: number;
  callLast: number;
  putLast: number;
}

interface ParsedChainData {
  rows: ChainRow[];
  spotPrice: number | null;
}

interface DeltaPresetRow {
  preset: string;
  side: string;
  strike: string;
  estDelta: string;
  note: string;
}

interface ButterflyOpportunity {
  optionSide: 'CALL' | 'PUT';
  width: number;
  lowerStrike: number;
  middleStrike: number;
  upperStrike: number;
  wingWidth: number;
  debit: number;
  maxProfit: number;
  breakevenLow: number;
  breakevenHigh: number;
  score: number;
}

interface ButterflyHeatmapRow {
  middleStrike: number;
  values: Record<number, number | null>;
  heatScores: Record<number, number | null>;
}

interface SelectedButterflyCell {
  middleStrike: number;
  width: number;
}

interface VolumeFlowStrikeDelta {
  strike: number;
  callAdded: number;
  putAdded: number;
}

interface VolumeFlowUpdate {
  id: string;
  timestamp: string;
  symbol: string;
  expiry: number | null;
  expiryLabel: string;
  spot: number | null;
  totalCallAdded: number;
  totalPutAdded: number;
  dominant: 'CALL' | 'PUT' | 'BALANCED';
  strikes: VolumeFlowStrikeDelta[];
}

const InsightBarList: React.FC<{
  title: string;
  items: Array<{ label: string; value: number; optionType: 'CALL' | 'PUT'; contractSymbol: string }>;
  onOpenContract: (contractSymbol: string) => void;
}> = ({ title, items, onOpenContract }) => {
  const max = Math.max(...items.map((item) => item.value), 0);
  return (
    <div className="yahoo-chart-card">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="yahoo-muted">No chart data available.</p>
      ) : (
        <div className="yahoo-bar-list">
          {items.map((item) => {
            const width = max > 0 ? (item.value / max) * 100 : 0;
            return (
              <div
                key={item.contractSymbol}
                className="yahoo-bar-row yahoo-bar-row--clickable"
                onClick={() => onOpenContract(item.contractSymbol)}
                title={`Click to view chart: ${item.contractSymbol}`}
              >
                <div className="yahoo-bar-label">
                  <span className="yahoo-bar-chart-icon">📈</span>
                  {item.label}
                </div>
                <div className="yahoo-bar-track">
                  <div
                    className={`yahoo-bar-fill ${item.optionType === 'CALL' ? 'call' : 'put'}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="yahoo-bar-value">{item.value.toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function safeRatio(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

function normalCdf(x: number): number {
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c2 = 0.3989423;
  if (x >= 0) {
    const t = 1 / (1 + p * x);
    return 1 - c2 * Math.exp((-x * x) / 2) * t * ((((b5 * t + b4) * t + b3) * t + b2) * t + b1);
  }
  return 1 - normalCdf(-x);
}

function estimateOptionDelta(
  spot: number,
  strike: number,
  ivPercent: number,
  dteDays: number,
  optionType: 'CALL' | 'PUT'
): number {
  if (spot <= 0 || strike <= 0) return 0;
  const sigma = Math.max(0.05, ivPercent / 100);
  const t = Math.max(1, dteDays) / 365;
  const denom = sigma * Math.sqrt(t);
  if (denom <= 0) return optionType === 'CALL' ? 0.5 : -0.5;
  const d1 = (Math.log(spot / strike) + 0.5 * sigma * sigma * t) / denom;
  const callDelta = normalCdf(d1);
  return optionType === 'CALL' ? callDelta : callDelta - 1;
}

function normalizeIvToPercent(iv: number): number {
  if (!Number.isFinite(iv) || iv <= 0) return 0;
  return iv <= 3 ? iv * 100 : iv;
}

function buildChainFromYahoo(
  contracts: Array<{
    optionType: 'Call' | 'Put';
    strike: number;
    volume: number;
    openInterest: number;
    impliedVolatility: number;
    lastPrice: number;
  }>,
  underlyingPrice: number | null
): ParsedChainData {
  const byStrike = new Map<number, ChainRow>();
  contracts.forEach((contract) => {
    if (!Number.isFinite(contract.strike) || contract.strike <= 0) return;
    const strike = contract.strike;
    const row = byStrike.get(strike) || {
      strike,
      callVolume: 0,
      callOi: 0,
      callIv: 0,
      putVolume: 0,
      putOi: 0,
      putIv: 0,
      callLast: 0,
      putLast: 0
    };
    if (contract.optionType === 'Call') {
      row.callVolume = contract.volume || 0;
      row.callOi = contract.openInterest || 0;
      row.callIv = normalizeIvToPercent(contract.impliedVolatility || 0);
      row.callLast = contract.lastPrice || 0;
    } else {
      row.putVolume = contract.volume || 0;
      row.putOi = contract.openInterest || 0;
      row.putIv = normalizeIvToPercent(contract.impliedVolatility || 0);
      row.putLast = contract.lastPrice || 0;
    }
    byStrike.set(strike, row);
  });

  const rows = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  return { rows, spotPrice: underlyingPrice };
}

function daysUntilExpiry(expirySeconds: number): number {
  const now = Date.now();
  const target = expirySeconds * 1000;
  return Math.max(1, Math.ceil((target - now) / (24 * 60 * 60 * 1000)));
}

function estimateSpotFromContracts(
  contracts: Array<{
    strike: number;
    volume: number;
    openInterest: number;
  }>
): number | null {
  if (!contracts.length) return null;
  const weighted = contracts
    .map((contract) => {
      const strike = contract.strike;
      if (!Number.isFinite(strike) || strike <= 0) return null;
      const weight = Math.max(1, (contract.openInterest || 0) + (contract.volume || 0));
      return { strike, weight };
    })
    .filter((row): row is { strike: number; weight: number } => Boolean(row));

  if (!weighted.length) return null;
  const totalWeight = weighted.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) return null;
  return weighted.reduce((sum, row) => sum + row.strike * row.weight, 0) / totalWeight;
}

function toExpiryLabel(expirySeconds: number): string {
  return new Date(expirySeconds * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC'
  });
}

const YahooChainStructureDashboard: React.FC<YahooChainStructureDashboardProps> = ({
  activeDashboard,
  setActiveDashboard
}) => {
  const [symbol, setSymbol] = useState('NVDA');
  const [daysToExpiry, setDaysToExpiry] = useState(7);
  const [spotOverride, setSpotOverride] = useState('');
  const [parsed, setParsed] = useState<ParsedChainData>({ rows: [], spotPrice: null });
  const [dataHistory, setDataHistory] = useState<ParsedChainData[]>([]); // Keep last 5 snapshots
  const [availableExpiries, setAvailableExpiries] = useState<number[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<number | null>(null);
  const [loadingExpiries, setLoadingExpiries] = useState(false);
  const [loadingChain, setLoadingChain] = useState(false);
  const [error, setError] = useState('');
  const [autoRefreshActive, setAutoRefreshActive] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [nextRefreshIn, setNextRefreshIn] = useState<number>(300); // seconds until next refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mostActiveRows, setMostActiveRows] = useState<YahooMostActiveOptionRow[]>([]);
  const [selectedButterflyCell, setSelectedButterflyCell] = useState<SelectedButterflyCell | null>(null);
  const [volumeFlowHistory, setVolumeFlowHistory] = useState<VolumeFlowUpdate[]>([]);
  const selectedExpiryDays = selectedExpiry ? daysUntilExpiry(selectedExpiry) : null;
  const flowStorageKey = useMemo(
    () => `chain-structure-flow:${symbol.trim().toUpperCase() || 'UNKNOWN'}:${selectedExpiry ?? 'nearest'}`,
    [symbol, selectedExpiry]
  );

  // Refs for auto-scrolling to ATM strike
  const heatmapAtmRowRef = useRef<HTMLTableRowElement>(null);
  const butterflyAtmRowRef = useRef<HTMLDivElement>(null);
  const didInitialHeatmapScrollRef = useRef(false);
  const didInitialButterflyScrollRef = useRef(false);
  const latestLoadChainRequestRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(flowStorageKey);
      if (!raw) {
        setVolumeFlowHistory([]);
        return;
      }
      const parsedValue = JSON.parse(raw);
      setVolumeFlowHistory(Array.isArray(parsedValue) ? parsedValue.slice(0, 25) : []);
    } catch {
      setVolumeFlowHistory([]);
    }
  }, [flowStorageKey]);

  const mostActiveTopByVolume = useMemo(
    () => [...mostActiveRows].sort((a, b) => b.volume - a.volume).slice(0, 15),
    [mostActiveRows]
  );
  const mostActiveVolumeItems = useMemo(
    () =>
      mostActiveTopByVolume.slice(0, 8).map((row) => ({
        label: formatContractSymbol(row.contractSymbol),
        value: row.volume,
        optionType: getMostActiveOptionType(row),
        contractSymbol: row.contractSymbol,
      })),
    [mostActiveTopByVolume]
  );
  const mostActiveOiItems = useMemo(
    () =>
      [...mostActiveTopByVolume]
        .sort((a, b) => b.openInterest - a.openInterest)
        .slice(0, 8)
        .map((row) => ({
          label: formatContractSymbol(row.contractSymbol),
          value: row.openInterest,
          optionType: getMostActiveOptionType(row),
          contractSymbol: row.contractSymbol,
        })),
    [mostActiveTopByVolume]
  );

  const openContractInTradingView = (contractSymbol: string) => {
    const url = buildTradingViewOptionUrl(contractSymbol);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const effectiveSpot = useMemo(() => {
    const overrideNum = Number(spotOverride);
    if (Number.isFinite(overrideNum) && overrideNum > 0) return overrideNum;
    return parsed.spotPrice || null;
  }, [spotOverride, parsed.spotPrice]);

  const stats = useMemo(() => {
    const rows = parsed.rows;
    if (rows.length === 0) {
      return {
        callWall: 0,
        putWall: 0,
        expectedMove: 0,
        expectedMovePct: 0,
        direction: 'NEUTRAL',
        confidence: 50,
        suggestion: 'Load a Yahoo option chain to generate signal.',
        volBias: 0,
        oiBias: 0,
        wallBias: 0
      };
    }

    const callWall = rows.reduce((best, r) => (r.callOi > best.callOi ? r : best), rows[0]).strike;
    const putWall = rows.reduce((best, r) => (r.putOi > best.putOi ? r : best), rows[0]).strike;
    
    // Filter to strikes within ±30% of spot for more relevant walls
    const spot = effectiveSpot || rows[Math.floor(rows.length / 2)].strike;
    const rangeFilter = 0.30; // 30% range
    const relevantStrikes = rows.filter(r => 
      r.strike >= spot * (1 - rangeFilter) && r.strike <= spot * (1 + rangeFilter)
    );
    
    // Find highest OI within relevant range
    const relevantCallWall = relevantStrikes.length > 0
      ? relevantStrikes.reduce((best, r) => (r.callOi > best.callOi ? r : best), relevantStrikes[0]).strike
      : callWall;
    const relevantPutWall = relevantStrikes.length > 0
      ? relevantStrikes.reduce((best, r) => (r.putOi > best.putOi ? r : best), relevantStrikes[0]).strike
      : putWall;
    
    const totalCallVol = rows.reduce((s, r) => s + r.callVolume, 0);
    const totalPutVol = rows.reduce((s, r) => s + r.putVolume, 0);
    const totalCallOi = rows.reduce((s, r) => s + r.callOi, 0);
    const totalPutOi = rows.reduce((s, r) => s + r.putOi, 0);
    
    // Volume bias (more weight - reflects current activity)
    const volBias = safeRatio(totalCallVol - totalPutVol, totalCallVol + totalPutVol);
    
    // OI bias (medium weight - reflects positioning)
    const oiBias = safeRatio(totalCallOi - totalPutOi, totalCallOi + totalPutOi);

    const nearest = rows.reduce((best, r) =>
      Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best, rows[0]);
    const atmIv = ((nearest.callIv + nearest.putIv) / 2) / 100;
    const expectedMove = spot * Math.max(0.01, atmIv) * Math.sqrt(Math.max(1, daysToExpiry) / 365);
    const expectedMovePct = safeRatio(expectedMove, spot) * 100;

    // Gamma proxy for near-the-money positioning
    const gammaProxy = rows.reduce((sum, r) => {
      const distance = Math.abs(r.strike - spot) / Math.max(spot, 1);
      const distanceWeight = Math.max(0.1, 1 - distance * 2);
      return sum + ((r.callOi * (r.callIv / 100)) - (r.putOi * (r.putIv / 100))) * distanceWeight;
    }, 0);

    // Wall positioning bias (where are the walls relative to spot?)
    const wallBias = (() => {
      const callWallDistance = (relevantCallWall - spot) / spot;
      const putWallDistance = (spot - relevantPutWall) / spot;
      // If call wall is closer above than put wall below = bearish (resistance)
      // If put wall is closer below than call wall above = bullish (support)
      if (Math.abs(callWallDistance) < 0.001 && Math.abs(putWallDistance) < 0.001) return 0;
      return (putWallDistance - callWallDistance) * 0.5; // Normalize influence
    })();

    // Combined score with adjusted weights
    // Volume = 50% (most important for current sentiment)
    // OI = 30% (positioning)
    // Gamma = 15% (near-money activity)
    // Wall = 5% (structural levels)
    const score = (volBias * 0.50) + (oiBias * 0.30) + Math.tanh(gammaProxy / 1_000_000) * 0.15 + wallBias * 0.05;
    
    // More sensitive thresholds for better detection
    // Strong signals: > 0.12 or < -0.12
    // Moderate signals: > 0.05 or < -0.05
    // Weak/Neutral: between -0.05 and 0.05
    let direction: 'UP' | 'DOWN' | 'NEUTRAL';
    let confidence: number;

    if (score > 0.05) {
      direction = 'UP';
      // Higher confidence with stronger score
      confidence = Math.min(95, Math.max(55, 55 + Math.abs(score) * 200));
    } else if (score < -0.05) {
      direction = 'DOWN';
      confidence = Math.min(95, Math.max(55, 55 + Math.abs(score) * 200));
    } else {
      direction = 'NEUTRAL';
      // Lower confidence for neutral
      confidence = Math.min(60, Math.max(45, 50 - Math.abs(score) * 100));
    }

    const targetUp = spot + expectedMove;
    const targetDown = Math.max(0, spot - expectedMove);
    const suggestion = direction === 'UP'
      ? `Higher-probability bias: UP toward ~$${targetUp.toFixed(2)} (+${expectedMovePct.toFixed(2)}%). Prefer bullish structures near ${spot.toFixed(2)} with call-wall at ${relevantCallWall}.`
      : direction === 'DOWN'
        ? `Higher-probability bias: DOWN toward ~$${targetDown.toFixed(2)} (-${expectedMovePct.toFixed(2)}%). Prefer bearish structures with put-wall at ${relevantPutWall}.`
        : `Neutral / range likely. Expected move ±$${expectedMove.toFixed(2)} (${expectedMovePct.toFixed(2)}%). Trade around ${relevantPutWall}-${relevantCallWall}.`;

    return { 
      callWall: relevantCallWall, 
      putWall: relevantPutWall, 
      expectedMove, 
      expectedMovePct, 
      direction, 
      confidence, 
      suggestion, 
      volBias, 
      oiBias, 
      wallBias 
    };
  }, [daysToExpiry, effectiveSpot, parsed.rows]);

  const visibleRows = useMemo(() => {
    if (parsed.rows.length <= 100) return parsed.rows;
    const spot = effectiveSpot ?? parsed.rows[Math.floor(parsed.rows.length / 2)].strike;
    return [...parsed.rows]
      .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
      .slice(0, 100)
      .sort((a, b) => a.strike - b.strike);
  }, [parsed.rows, effectiveSpot]);

  const maxOi = Math.max(1, ...visibleRows.map((r) => Math.max(r.callOi, r.putOi)));
  const maxVol = Math.max(1, ...visibleRows.map((r) => Math.max(r.callVolume, r.putVolume)));
  const downTarget = effectiveSpot ? Math.max(0, effectiveSpot - stats.expectedMove) : 0;
  const upTarget = effectiveSpot ? effectiveSpot + stats.expectedMove : 0;
  const currentVolumeFlowSnapshot = useMemo(() => {
    if (parsed.rows.length === 0) {
      return {
        totalCallVolume: 0,
        totalPutVolume: 0,
        dominant: 'BALANCED' as 'CALL' | 'PUT' | 'BALANCED',
        strikes: [] as Array<{ strike: number; callValue: number; putValue: number }>
      };
    }

    const totalCallVolume = parsed.rows.reduce((sum, row) => sum + row.callVolume, 0);
    const totalPutVolume = parsed.rows.reduce((sum, row) => sum + row.putVolume, 0);
    const dominant: 'CALL' | 'PUT' | 'BALANCED' =
      totalCallVolume > totalPutVolume * 1.05 ? 'CALL' : totalPutVolume > totalCallVolume * 1.05 ? 'PUT' : 'BALANCED';
    const strikes = [...parsed.rows]
      .map((row) => ({ strike: row.strike, callValue: row.callVolume, putValue: row.putVolume }))
      .filter((item) => item.callValue > 0 || item.putValue > 0)
      .sort((a, b) => Math.max(b.callValue, b.putValue) - Math.max(a.callValue, a.putValue))
      .slice(0, 10);

    return { totalCallVolume, totalPutVolume, dominant, strikes };
  }, [parsed.rows]);

  const deltaPresets = useMemo(() => {
    if (!effectiveSpot || parsed.rows.length === 0) return [];
    const spot = effectiveSpot;
    const nearest = parsed.rows.reduce((best, r) =>
      Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best, parsed.rows[0]);
    const atmIv = Math.max(10, (nearest.callIv + nearest.putIv) / 2);

    const enriched = parsed.rows.map((r) => {
      const callIv = r.callIv > 0 ? r.callIv : atmIv;
      const putIv = r.putIv > 0 ? r.putIv : atmIv;
      const callDelta = estimateOptionDelta(spot, r.strike, callIv, daysToExpiry, 'CALL');
      const putDelta = estimateOptionDelta(spot, r.strike, putIv, daysToExpiry, 'PUT');
      return {
        ...r,
        callDelta,
        putDelta,
        callLiq: r.callVolume + r.callOi * 0.5,
        putLiq: r.putVolume + r.putOi * 0.5
      };
    });

    const directionalTargets = [
      { preset: 'Conservative', target: 0.3 },
      { preset: 'Balanced', target: 0.4 },
      { preset: 'Aggressive', target: 0.55 }
    ];

    const pickCandidate = (
      side: 'CALL' | 'PUT',
      targetAbsDelta: number,
      used: Set<number>,
      strikeFilter: (strike: number) => boolean
    ) => {
      const candidates = enriched
        .filter((r) => !used.has(r.strike) && strikeFilter(r.strike))
        .map((r) => ({
          row: r,
          delta: side === 'CALL' ? r.callDelta : r.putDelta,
          liq: side === 'CALL' ? r.callLiq : r.putLiq
        }))
        .filter((x) => Math.abs(x.delta) >= 0.05 && Math.abs(x.delta) <= 0.95);
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => {
        const deltaDiff = Math.abs(Math.abs(a.delta) - targetAbsDelta) - Math.abs(Math.abs(b.delta) - targetAbsDelta);
        if (deltaDiff !== 0) return deltaDiff;
        return b.liq - a.liq;
      });
      return candidates[0];
    };

    if (stats.direction === 'UP' || stats.direction === 'DOWN') {
      const side: 'CALL' | 'PUT' = stats.direction === 'UP' ? 'CALL' : 'PUT';
      const used = new Set<number>();
      return directionalTargets.map(({ preset, target }): DeltaPresetRow => {
        const picked = pickCandidate(
          side,
          target,
          used,
          (strike) => side === 'CALL' ? strike >= spot * 0.9 : strike <= spot * 1.1
        );
        if (!picked) {
          return { preset, side, strike: '-', estDelta: '-', note: 'Not enough contracts to estimate a strike.' };
        }
        used.add(picked.row.strike);
        return {
          preset,
          side,
          strike: picked.row.strike.toFixed(2),
          estDelta: Math.abs(picked.delta).toFixed(2),
          note: `Closest to ${target.toFixed(2)} delta with better liquidity.`
        };
      });
    }

    const rangeTargets = [
      { preset: 'Conservative', target: 0.15 },
      { preset: 'Balanced', target: 0.22 },
      { preset: 'Aggressive', target: 0.3 }
    ];
    const usedPuts = new Set<number>();
    const usedCalls = new Set<number>();
    return rangeTargets.map(({ preset, target }): DeltaPresetRow => {
      const putPick = pickCandidate('PUT', target, usedPuts, (strike) => strike <= spot * 1.05);
      const callPick = pickCandidate('CALL', target, usedCalls, (strike) => strike >= spot * 0.95);
      if (putPick) usedPuts.add(putPick.row.strike);
      if (callPick) usedCalls.add(callPick.row.strike);
      return {
        preset,
        side: 'PUT / CALL',
        strike: putPick && callPick ? `${putPick.row.strike.toFixed(2)} / ${callPick.row.strike.toFixed(2)}` : '-',
        estDelta: putPick && callPick ? `${Math.abs(putPick.delta).toFixed(2)} / ${Math.abs(callPick.delta).toFixed(2)}` : '-',
        note: 'Range setup around expected move using paired deltas.'
      };
    });
  }, [daysToExpiry, effectiveSpot, parsed.rows, stats.direction]);
  void deltaPresets;

  const [butterflySide, setButterflySide] = useState<'BOTH' | 'CALL' | 'PUT'>('BOTH');
  const butterflyWidths = [5, 10, 15, 20, 25, 30, 40, 50];
  const butterflyModel = useMemo(() => {
    if (parsed.rows.length < 3) {
      return {
        middleStrikeUsed: null as number | null,
        heatmapRows: [] as ButterflyHeatmapRow[],
        opportunities: [] as ButterflyOpportunity[],
        opportunityLookup: {} as Record<string, { call?: ButterflyOpportunity; put?: ButterflyOpportunity }>,
        maxCellValue: 0
      };
    }

    const nearestByStrike = (target: number) =>
      parsed.rows.reduce((best, row) =>
        Math.abs(row.strike - target) < Math.abs(best.strike - target) ? row : best, parsed.rows[0]);

    const middlePrice = effectiveSpot ?? parsed.spotPrice ?? parsed.rows[Math.floor(parsed.rows.length / 2)].strike;
    const centerRow = nearestByStrike(middlePrice);
    const centerIndex = parsed.rows.findIndex((r) => r.strike === centerRow.strike);
    const windowRows = parsed.rows.slice(Math.max(0, centerIndex - 50), Math.min(parsed.rows.length, centerIndex + 51));

    const buildOpportunity = (middleStrike: number, width: number, optionSide: 'CALL' | 'PUT'): ButterflyOpportunity | null => {
      const middleRow = nearestByStrike(middleStrike);
      const lowerRow = nearestByStrike(middleRow.strike - width);
      const upperRow = nearestByStrike(middleRow.strike + width);
      if (!(lowerRow.strike < middleRow.strike && middleRow.strike < upperRow.strike)) return null;

      const debit = optionSide === 'CALL'
        ? Math.max(0, lowerRow.callLast + upperRow.callLast - 2 * middleRow.callLast)
        : Math.max(0, lowerRow.putLast + upperRow.putLast - 2 * middleRow.putLast);
      const wingWidth = Math.min(middleRow.strike - lowerRow.strike, upperRow.strike - middleRow.strike);
      const maxProfit = Math.max(0, wingWidth - debit);
      const score = debit <= 0 ? maxProfit : maxProfit / debit;

      return {
        optionSide,
        width,
        lowerStrike: lowerRow.strike,
        middleStrike: middleRow.strike,
        upperStrike: upperRow.strike,
        wingWidth,
        debit,
        maxProfit,
        breakevenLow: middleRow.strike - debit,
        breakevenHigh: middleRow.strike + debit,
        score
      };
    };

    const targetDebitHeatScore = (opportunity: ButterflyOpportunity | null): number | null => {
      if (!opportunity || opportunity.wingWidth <= 0) return null;
      const targetRatio = 0.1;
      const ratio = opportunity.debit / opportunity.wingWidth;
      const distance = Math.abs(ratio - targetRatio);
      return Math.max(0, Math.min(1, 1 - distance / targetRatio));
    };

    const opportunities: ButterflyOpportunity[] = [];
    const opportunityLookup: Record<string, { call?: ButterflyOpportunity; put?: ButterflyOpportunity }> = {};
    const heatmapRows: ButterflyHeatmapRow[] = windowRows.map((row) => {
      const values = butterflyWidths.reduce<Record<number, number | null>>((acc, width) => {
        const callOpp = buildOpportunity(row.strike, width, 'CALL');
        const putOpp = buildOpportunity(row.strike, width, 'PUT');
        const key = `${row.strike}-${width}`;
        if (callOpp || putOpp) {
          opportunityLookup[key] = {
            call: callOpp ?? undefined,
            put: putOpp ?? undefined
          };
        }
        if (!callOpp || !putOpp) {
          acc[width] = null;
          return acc;
        }
        opportunities.push(callOpp, putOpp);
        acc[width] = butterflySide === 'CALL'
          ? callOpp.debit
          : butterflySide === 'PUT'
            ? putOpp.debit
            : (callOpp.debit + putOpp.debit) / 2;
        return acc;
      }, {});
      const heatScores = butterflyWidths.reduce<Record<number, number | null>>((acc, width) => {
        const pair = opportunityLookup[`${row.strike}-${width}`];
        if (!pair?.call && !pair?.put) {
          acc[width] = null;
          return acc;
        }
        const callScore = targetDebitHeatScore(pair?.call ?? null);
        const putScore = targetDebitHeatScore(pair?.put ?? null);
        acc[width] = butterflySide === 'CALL'
          ? callScore
          : butterflySide === 'PUT'
            ? putScore
            : (callScore != null && putScore != null ? (callScore + putScore) / 2 : callScore ?? putScore ?? null);
        return acc;
      }, {});
      return { middleStrike: row.strike, values, heatScores };
    });

    const maxCellValue = Math.max(
      0,
      ...heatmapRows.flatMap((row) => butterflyWidths.map((width) => row.heatScores[width] ?? 0))
    );

    return {
      middleStrikeUsed: centerRow.strike,
      heatmapRows,
      opportunities,
      opportunityLookup,
      maxCellValue
    };
  }, [butterflySide, effectiveSpot, parsed.rows, parsed.spotPrice]);

  const selectedButterflyData = useMemo(() => {
    if (!selectedButterflyCell) return null;
    const key = `${selectedButterflyCell.middleStrike}-${selectedButterflyCell.width}`;
    return butterflyModel.opportunityLookup[key] ?? null;
  }, [butterflyModel.opportunityLookup, selectedButterflyCell]);

  const selectedMiddleAllWidths = useMemo(() => {
    if (!selectedButterflyCell) return [];
    return butterflyWidths
      .map((width) => ({
        width,
        data: butterflyModel.opportunityLookup[`${selectedButterflyCell.middleStrike}-${width}`] ?? null
      }))
      .filter((row) => row.data && (row.data.call || row.data.put));
  }, [butterflyModel.opportunityLookup, butterflyWidths, selectedButterflyCell]);

  useEffect(() => {
    setSelectedButterflyCell(null);
  }, [symbol, selectedExpiry, parsed.rows.length]);

  const loadExpiries = async () => {
    const ticker = symbol.trim().toUpperCase();
    if (!ticker) {
      setError('Enter a symbol first.');
      return;
    }
    setLoadingExpiries(true);
    setError('');
    try {
      const chain = await fetchYahooOptionChain(ticker);
      const expiries = chain.expirations || [];
      const detectedSpot = chain.underlyingPrice ?? estimateSpotFromContracts(chain.contracts);
      setAvailableExpiries(expiries);
      const first = expiries[0] ?? null;
      setSelectedExpiry(first);
      if (first) {
        setDaysToExpiry(daysUntilExpiry(first));
      }
      if ((!spotOverride || Number(spotOverride) <= 0) && detectedSpot && detectedSpot > 0) {
        setSpotOverride(detectedSpot.toFixed(2));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expiries.');
    } finally {
      setLoadingExpiries(false);
    }
  };

  const loadChain = async (isRefresh = false) => {
    const requestId = ++latestLoadChainRequestRef.current;
    const ticker = symbol.trim().toUpperCase();
    if (!ticker) {
      setError('Enter a symbol first.');
      return;
    }
    setLoadingChain(true);
    setIsRefreshing(isRefresh);
    setError('');
    try {
      const [chainResult, mostActiveResult] = await Promise.allSettled([
        fetchYahooOptionChain(ticker, selectedExpiry || undefined),
        fetchYahooMostActiveOptions(ticker)
      ]);
      if (chainResult.status !== 'fulfilled') {
        throw chainResult.reason;
      }
      if (requestId !== latestLoadChainRequestRef.current) {
        return;
      }
      const chain = chainResult.value;
      const detectedSpot = chain.underlyingPrice ?? estimateSpotFromContracts(chain.contracts);
      const normalized = buildChainFromYahoo(chain.contracts, detectedSpot);

      // Build a compact per-update flow snapshot so users can see
      // where fresh call/put volume is being added on each fetch.
      if (parsed.rows.length > 0) {
        const prevByStrike = new Map<number, ChainRow>(parsed.rows.map((row) => [row.strike, row]));
        const strikeDiffs: VolumeFlowStrikeDelta[] = normalized.rows
          .map((row) => {
            const prev = prevByStrike.get(row.strike);
            const callAdded = row.callVolume - (prev?.callVolume ?? 0);
            const putAdded = row.putVolume - (prev?.putVolume ?? 0);
            return { strike: row.strike, callAdded, putAdded };
          })
          .filter((item) => item.callAdded !== 0 || item.putAdded !== 0)
          .sort(
            (a, b) =>
              Math.max(Math.abs(b.callAdded), Math.abs(b.putAdded)) -
              Math.max(Math.abs(a.callAdded), Math.abs(a.putAdded))
          )
          .slice(0, 10);

        const totalCallAdded = normalized.rows.reduce((sum, row) => {
          const prev = prevByStrike.get(row.strike);
          return sum + (row.callVolume - (prev?.callVolume ?? 0));
        }, 0);
        const totalPutAdded = normalized.rows.reduce((sum, row) => {
          const prev = prevByStrike.get(row.strike);
          return sum + (row.putVolume - (prev?.putVolume ?? 0));
        }, 0);

        const positiveCall = Math.max(0, totalCallAdded);
        const positivePut = Math.max(0, totalPutAdded);
        const dominant: 'CALL' | 'PUT' | 'BALANCED' =
          positiveCall > positivePut * 1.1 ? 'CALL' : positivePut > positiveCall * 1.1 ? 'PUT' : 'BALANCED';

        const flowUpdate: VolumeFlowUpdate = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          symbol: ticker,
          expiry: selectedExpiry ?? null,
          expiryLabel: selectedExpiry ? toExpiryLabel(selectedExpiry) : 'Nearest expiry',
          spot: detectedSpot ?? normalized.spotPrice,
          totalCallAdded,
          totalPutAdded,
          dominant,
          strikes: strikeDiffs
        };

        setVolumeFlowHistory((prev) => {
          const next = [flowUpdate, ...prev].slice(0, 25);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(flowStorageKey, JSON.stringify(next));
          }
          return next;
        });
      }
      
      // Save current data to history before updating (for delta calculation)
      // Keep history for every successful fetch (manual + auto refresh),
      // so heatmap deltas reflect each update cycle.
      if (parsed.rows.length > 0) {
        setDataHistory(prev => {
          const newHistory = [parsed, ...prev].slice(0, 5); // Keep last 5 snapshots
          return newHistory;
        });
      }
      
      setParsed(normalized);
      if (mostActiveResult.status === 'fulfilled') {
        setMostActiveRows(mostActiveResult.value);
      } else {
        setMostActiveRows([]);
      }
      if ((!spotOverride || Number(spotOverride) <= 0) && detectedSpot && detectedSpot > 0) {
        setSpotOverride(detectedSpot.toFixed(2));
      }
      if (selectedExpiry) {
        setDaysToExpiry(daysUntilExpiry(selectedExpiry));
      }
      
      // Update last refresh time
      setLastUpdateTime(new Date());
      
      // Reset countdown to 5 minutes on refresh
      if (isRefresh) {
        setNextRefreshIn(300);
      }
      
      // Start auto-refresh on first load (not on subsequent refreshes)
      if (!isRefresh && !autoRefreshActive) {
        setAutoRefreshActive(true);
        setNextRefreshIn(300); // Start 5-minute countdown
      }
    } catch (err) {
      if (requestId === latestLoadChainRequestRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load Yahoo chain.');
      }
    } finally {
      if (requestId === latestLoadChainRequestRef.current) {
        setLoadingChain(false);
        setIsRefreshing(false);
      }
    }
  };

  // Helper function to get deltas for a specific strike and field (returns last 5 changes)
  const getDeltas = (strike: number, field: 'callVolume' | 'callOi' | 'putVolume' | 'putOi'): number[] => {
    if (dataHistory.length === 0) {
      return [];
    }
    
    const currentRow = parsed.rows.find(r => r.strike === strike);
    if (!currentRow) {
      return [];
    }
    
    const deltas: number[] = [];
    let previousValue = currentRow[field];
    
    // Go through history from most recent to oldest
    for (const historicalData of dataHistory) {
      const historicalRow = historicalData.rows.find(r => r.strike === strike);
      if (historicalRow) {
        const delta = previousValue - historicalRow[field];
        if (delta !== 0) {
          deltas.push(delta);
        }
        previousValue = historicalRow[field];
      }
    }

    return deltas.slice(0, 5); // Return max 5 changes
  };

  const formatSignedDelta = (delta: number) => `${delta > 0 ? '+' : ''}${delta.toLocaleString()}`;
  const renderRecentDeltas = (deltas: number[]) =>
    deltas.slice(0, 5).map((delta, idx) => (
      <span
        key={`delta-${idx}-${delta}`}
        style={{
          marginLeft: '4px',
          fontSize: '0.8em',
          color: delta > 0 ? '#4ade80' : '#f87171',
          fontWeight: 600,
          opacity: 1 - (idx * 0.15)
        }}
      >
        ({formatSignedDelta(delta)})
      </span>
    ));

  // Calculate total absolute change for a strike (across all fields, most recent change only)
  const getTotalAbsoluteChange = (strike: number): number => {
    const callVolDeltas = getDeltas(strike, 'callVolume');
    const callOiDeltas = getDeltas(strike, 'callOi');
    const putVolDeltas = getDeltas(strike, 'putVolume');
    const putOiDeltas = getDeltas(strike, 'putOi');
    
    // Sum the most recent change (first in array) for each field
    const callVolDelta = Math.abs(callVolDeltas[0] || 0);
    const callOiDelta = Math.abs(callOiDeltas[0] || 0);
    const putVolDelta = Math.abs(putVolDeltas[0] || 0);
    const putOiDelta = Math.abs(putOiDeltas[0] || 0);
    
    return callVolDelta + callOiDelta + putVolDelta + putOiDelta;
  };

  // Identify top movers (strikes with most significant changes)
  const topMovers = useMemo(() => {
    if (dataHistory.length === 0) {
      return { top3: [] as number[], maxChange: 0 };
    }
    
    const strikesWithChanges = parsed.rows
      .map(r => ({
        strike: r.strike,
        totalChange: getTotalAbsoluteChange(r.strike)
      }))
      .filter(s => s.totalChange > 0)
      .sort((a, b) => b.totalChange - a.totalChange);
    
    return {
      top3: strikesWithChanges.slice(0, 3).map(s => s.strike),
      maxChange: strikesWithChanges[0]?.totalChange || 0
    };
  }, [parsed.rows, dataHistory]);

  // Format last update time
  const formatLastUpdate = (date: Date | null): string => {
    if (!date) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    
    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} mins ago`;
    
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatCountdown = (seconds: number): string => {
    if (seconds <= 0) return 'Refreshing...';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Countdown timer for next refresh
  useEffect(() => {
    if (!autoRefreshActive || nextRefreshIn <= 0) {
      return;
    }

    const countdownInterval = setInterval(() => {
      setNextRefreshIn(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [autoRefreshActive, nextRefreshIn]);

  // Auto-refresh every 5 minutes after initial 5-minute wait
  useEffect(() => {
    if (!autoRefreshActive || !symbol.trim()) {
      return;
    }

    // Wait 5 minutes before starting the refresh cycle
    const initialTimer = setTimeout(() => {
      // Then refresh every 5 minutes
      const intervalId = setInterval(() => {
        loadChain(true);
      }, 5 * 60 * 1000); // 5 minutes

      // Do the first refresh
      loadChain(true);

      // Cleanup interval on unmount or when dependencies change
      return () => clearInterval(intervalId);
    }, 5 * 60 * 1000); // Initial 5-minute delay

    return () => clearTimeout(initialTimer);
  }, [autoRefreshActive, symbol, selectedExpiry]);

  // Auto-scroll to ATM strike in Volume/OI Heatmap
  useEffect(() => {
    if (didInitialHeatmapScrollRef.current) return;
    if (heatmapAtmRowRef.current && effectiveSpot) {
      setTimeout(() => {
        heatmapAtmRowRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
        didInitialHeatmapScrollRef.current = true;
      }, 100);
    }
  }, [effectiveSpot, parsed.rows]);

  // Auto-scroll to ATM strike in Butterfly Workspace
  useEffect(() => {
    if (didInitialButterflyScrollRef.current) return;
    if (butterflyAtmRowRef.current && effectiveSpot) {
      setTimeout(() => {
        butterflyAtmRowRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
        didInitialButterflyScrollRef.current = true;
      }, 100);
    }
  }, [effectiveSpot, parsed.rows]);

  const handleSymbolChange = (nextRawSymbol: string) => {
    const nextSymbol = nextRawSymbol.toUpperCase();
    setSymbol(nextSymbol);
    setAvailableExpiries([]);
    setSelectedExpiry(null);
    setParsed({ rows: [], spotPrice: null });
    setDataHistory([]);
    setVolumeFlowHistory([]);
    setMostActiveRows([]);
    setSpotOverride('');
    setDaysToExpiry(7);
    setSelectedButterflyCell(null);
    setError('');
    setAutoRefreshActive(false);
    setLastUpdateTime(null);
  };

  return (
    <div className="options-dashboard yahoo-options-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Chain Structure (Yahoo) Dashboard</h1>
          <div className="header-stats">
            <span className="header-stat">{parsed.rows.length} strikes parsed</span>
            {effectiveSpot && <span className="header-stat">Spot: ${effectiveSpot.toFixed(2)}</span>}
            <span className="header-stat">Bias: {stats.direction}</span>
            <span className="header-stat">Confidence: {stats.confidence.toFixed(0)}%</span>
            {autoRefreshActive && (
              <span className="header-stat" style={{ color: '#4ade80' }}>
                🔄 Auto-refresh: ON (every 5min)
              </span>
            )}
            {lastUpdateTime && (
              <span className="header-stat" style={{ color: '#94a3b8' }}>
                ⏱️ Last updated: {formatLastUpdate(lastUpdateTime)}
              </span>
            )}
          </div>
        </div>
        <div className="header-right">
          <div className="nav-buttons">
            <button className={`nav-button ${activeDashboard === 'yahoo' ? 'active' : ''}`} onClick={() => setActiveDashboard('yahoo')}>Yahoo Options</button>
            <button className={`nav-button ${activeDashboard === 'chainStructureYahoo' ? 'active' : ''}`} onClick={() => setActiveDashboard('chainStructureYahoo')}>Chain Structure (Yahoo)</button>
          </div>
        </div>
      </header>

      <section className="yahoo-controls">
        <div className="yahoo-symbols-panel chain-flow-panel">
          <h4 className="chain-flow-title">Input Flow</h4>
          <div className="chain-flow-grid">
            <div className="chain-flow-field">
              <label htmlFor="chain-symbol">1) Symbol</label>
              <input
                id="chain-symbol"
                className="search-input"
                placeholder="e.g. NVDA"
                value={symbol}
                onChange={(e) => handleSymbolChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && symbol.trim() && !loadingExpiries) {
                    loadExpiries();
                  }
                }}
              />
            </div>
            <div className="chain-flow-field">
              <label htmlFor="spot-override-yahoo">Spot Price</label>
              <input id="spot-override-yahoo" value={spotOverride} onChange={(e) => setSpotOverride(e.target.value)} className="search-input" />
            </div>

            <div className="chain-flow-field">
              <label>2) Load Expiries</label>
              <button className="refresh-button-compact" onClick={loadExpiries} disabled={loadingExpiries}>
                <RefreshCw className={`refresh-icon ${loadingExpiries ? 'spinning' : ''}`} />
                {loadingExpiries ? 'Loading expiries...' : 'Load Expiries'}
              </button>
            </div>
            <div className="chain-flow-field">
              <label htmlFor="chain-expiry">Expiry</label>
              <select
                id="chain-expiry"
                className="history-select"
                value={selectedExpiry ?? ''}
                onChange={(e) => {
                  const next = e.target.value ? Number(e.target.value) : null;
                  setSelectedExpiry(next);
                  if (next) setDaysToExpiry(daysUntilExpiry(next));
                }}
              >
                <option value="">Select expiry</option>
                {availableExpiries.map((expiry) => (
                  <option key={expiry} value={expiry}>
                    {toExpiryLabel(expiry)}
                  </option>
                ))}
              </select>
            </div>

            <div className="chain-flow-days" role="status">
              3) Days to Expiry: <strong>{selectedExpiryDays ?? '-'}</strong>
            </div>

            <div className="chain-flow-submit">
              <button className="refresh-button-compact" onClick={() => loadChain(false)} disabled={loadingChain}>
                <RefreshCw className={`refresh-icon ${loadingChain ? 'spinning' : ''}`} />
                {loadingChain ? 'Loading chain...' : 'Build From Yahoo'}
              </button>
            </div>
          </div>

          {/* Refresh Status - Inside Form */}
          {autoRefreshActive && (
            <div className="refresh-status-inline">
              <div className="refresh-status-left">
                <span className={`refresh-indicator ${isRefreshing ? 'refreshing' : ''}`}>
                  {isRefreshing ? '🔄 Updating...' : '✓ Live Updates Active'}
                </span>
                {lastUpdateTime && !isRefreshing && (
                  <span className="last-update-time">
                    Last updated: {formatLastUpdate(lastUpdateTime)}
                  </span>
                )}
              </div>
              <div className="refresh-countdown">
                {!isRefreshing && nextRefreshIn > 0 && (
                  <>
                    <span className="countdown-label">Next refresh:</span>
                    <span className="countdown-timer">{formatCountdown(nextRefreshIn)}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="decision-snapshot-modern">
          <div className="decision-left-panel">
            {/* Header with Direction and Confidence */}
            <div className="decision-header">
              <div className="decision-direction">
                <div className={`direction-badge direction-badge-icon ${stats.direction.toLowerCase()}`} title={stats.direction === 'UP' ? 'BULLISH' : stats.direction === 'DOWN' ? 'BEARISH' : 'NEUTRAL'}>
                  <span className="direction-icon">{stats.direction === 'UP' ? '📈' : stats.direction === 'DOWN' ? '📉' : '↔️'}</span>
                </div>
              </div>
              <div className="decision-confidence">
                <div className="confidence-label">Confidence</div>
                <div className="confidence-value">{stats.confidence.toFixed(0)}%</div>
                <div className="confidence-gauge">
                  <div className="confidence-gauge-fill" style={{ width: `${stats.confidence}%` }} />
                </div>
              </div>
            </div>

            {/* Expected Move Slider */}
            {effectiveSpot && (
              <>
                <div className="decision-slider">
                  <div className="slider-labels">
                    <div className="slider-label downside">
                      <div>DOWNSIDE</div>
                      <div className="slider-label-value">${downTarget.toFixed(2)}</div>
                      <div className="slider-label-pct">-{stats.expectedMovePct.toFixed(2)}%</div>
                    </div>
                    <div className="slider-label spot">
                      <div>SPOT</div>
                      <div className="slider-label-value">${effectiveSpot.toFixed(2)}</div>
                    </div>
                    <div className="slider-label upside">
                      <div>UPSIDE</div>
                      <div className="slider-label-value">${upTarget.toFixed(2)}</div>
                      <div className="slider-label-pct">+{stats.expectedMovePct.toFixed(2)}%</div>
                    </div>
                  </div>
                  <div className="slider-track">
                    <div className="slider-fill slider-fill-down" style={{ width: '50%' }} />
                    <div className="slider-fill slider-fill-up" style={{ width: '50%' }} />
                    <div className="slider-thumb" style={{ left: '50%' }} />
                  </div>
                </div>

                {/* Day's Range Slider */}
                <div className="range-slider-compact">
                  <div className="range-slider-label">DAY'S RANGE</div>
                  <div className="range-values">
                    <span className="range-low">{(effectiveSpot * 0.98).toFixed(2)}</span>
                    <span className="range-high">{(effectiveSpot * 1.02).toFixed(2)}</span>
                  </div>
                  <div className="range-track">
                    <div className="range-progress" style={{ left: '20%', width: '60%' }} />
                    <div className="range-marker" style={{ left: '50%' }} />
                  </div>
                </div>

                {/* 52-Week Range Slider */}
                <div className="range-slider-compact">
                  <div className="range-slider-label">52WK RANGE</div>
                  <div className="range-values">
                    <span className="range-low">{(effectiveSpot * 0.70).toFixed(2)}</span>
                    <span className="range-high">{(effectiveSpot * 1.30).toFixed(2)}</span>
                  </div>
                  <div className="range-track">
                    <div className="range-progress" style={{ left: '15%', width: '70%' }} />
                    <div className="range-marker" style={{ left: '60%' }} />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* TradingView Chart */}
          <div className="decision-chart-panel">
            {symbol && (
              <div className="tradingview-widget-container" style={{ height: '100%', width: '100%' }}>
                <iframe
                  src={`https://www.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=${encodeURIComponent(symbol)}&interval=D&hidesidetoolbar=1&symboledit=1&saveimage=0&toolbarbg=0e1621&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en&utm_source=localhost&utm_medium=widget_new&utm_campaign=chart&utm_term=${encodeURIComponent(symbol)}`}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title="TradingView Chart"
                />
              </div>
            )}
            {!symbol && (
              <div className="chart-placeholder">
                <p>Enter a symbol to view the chart</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {error && <p className="chain-inline-error">{error}</p>}

      <section className="yahoo-table-section" style={{ gridColumn: '1 / -1' }}>
        <div className="yahoo-table-title">
          <BarChart3 size={18} />
          <h3>
            {symbol && <span style={{ color: '#60a5fa', fontWeight: 700 }}>{symbol}</span>}
            {effectiveSpot && <span style={{ marginLeft: '8px', color: '#94a3b8', fontSize: '0.9em' }}>${effectiveSpot.toFixed(2)}</span>}
            {(symbol || effectiveSpot) && <span style={{ margin: '0 8px', color: '#475569' }}>•</span>}
            Volume/OI Heatmap (by strike)
            {autoRefreshActive && dataHistory.length === 0 && (
              <span style={{ marginLeft: '12px', fontSize: '0.85em', color: '#94a3b8', fontWeight: 400 }}>
                • Changes will appear after first refresh (5min)
              </span>
            )}
            {topMovers.top3.length > 0 && (
              <span style={{ marginLeft: '12px', fontSize: '0.85em', color: '#fbbf24', fontWeight: 500 }}>
                🔥 Top movers highlighted
              </span>
            )}
          </h3>
        </div>
        <div className="yahoo-table-wrapper">
            <table className="yahoo-table">
              <thead>
                <tr>
                  <th>Strike</th>
                  <th>Call Vol</th>
                  <th>Call OI</th>
                  <th>Call Premium</th>
                  <th>Put Vol</th>
                  <th>Put OI</th>
                  <th>Put Premium</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const cv = r.callVolume / maxVol;
                  const co = r.callOi / maxOi;
                  const pv = r.putVolume / maxVol;
                  const po = r.putOi / maxOi;
                  
                  // Get deltas (up to last 5 changes)
                  const callVolDeltas = getDeltas(r.strike, 'callVolume');
                  const callOiDeltas = getDeltas(r.strike, 'callOi');
                  const putVolDeltas = getDeltas(r.strike, 'putVolume');
                  const putOiDeltas = getDeltas(r.strike, 'putOi');
                  
                  // Check if this strike is a top mover
                  const isTopMover = topMovers.top3.includes(r.strike);
                  const moverRank = topMovers.top3.indexOf(r.strike) + 1;
                  
                  // Check if this strike is closest to spot price
                  const isClosestToSpot = effectiveSpot && visibleRows.reduce((closest, row) => 
                    Math.abs(row.strike - effectiveSpot) < Math.abs(closest.strike - effectiveSpot) ? row : closest
                  ).strike === r.strike;
                  
                  return (
                    <tr 
                      key={`hm-${r.strike}`}
                      ref={isClosestToSpot ? heatmapAtmRowRef : null}
                      style={{
                        background: isClosestToSpot ? 'rgba(56, 189, 248, 0.15)' : isTopMover ? 'rgba(251, 191, 36, 0.08)' : undefined,
                        borderLeft: isClosestToSpot ? '3px solid #38bdf8' : isTopMover ? '3px solid #fbbf24' : undefined,
                        boxShadow: isClosestToSpot ? '0 0 8px rgba(56, 189, 248, 0.3)' : undefined
                      }}
                    >
                      <td style={{ fontWeight: isClosestToSpot || isTopMover ? 600 : undefined }}>
                        {isClosestToSpot && (
                          <span style={{ 
                            marginRight: '6px',
                            padding: '2px 6px',
                            background: '#38bdf8',
                            color: '#000',
                            borderRadius: '4px',
                            fontSize: '0.75em',
                            fontWeight: 700
                          }}>
                            📍 ATM
                          </span>
                        )}
                        {isTopMover && (
                          <span style={{ 
                            marginRight: '6px',
                            padding: '2px 6px',
                            background: moverRank === 1 ? '#fbbf24' : moverRank === 2 ? '#f59e0b' : '#d97706',
                            color: '#000',
                            borderRadius: '4px',
                            fontSize: '0.75em',
                            fontWeight: 700
                          }}>
                            🔥 #{moverRank}
                          </span>
                        )}
                        {r.strike}
                      </td>
                      <td style={{ background: `rgba(34,197,94,${0.1 + cv * 0.7})` }}>
                        {r.callVolume.toLocaleString()}
                        {renderRecentDeltas(callVolDeltas)}
                      </td>
                      <td style={{ background: `rgba(34,197,94,${0.1 + co * 0.7})` }}>
                        {r.callOi.toLocaleString()}
                        {renderRecentDeltas(callOiDeltas)}
                      </td>
                      <td style={{ background: 'rgba(34,197,94,0.1)', fontWeight: 500, color: '#22c55e' }}>
                        ${r.callLast > 0 ? r.callLast.toFixed(2) : '-'}
                      </td>
                      <td style={{ background: `rgba(239,68,68,${0.1 + pv * 0.7})` }}>
                        {r.putVolume.toLocaleString()}
                        {renderRecentDeltas(putVolDeltas)}
                      </td>
                      <td style={{ background: `rgba(239,68,68,${0.1 + po * 0.7})` }}>
                        {r.putOi.toLocaleString()}
                        {renderRecentDeltas(putOiDeltas)}
                      </td>
                      <td style={{ background: 'rgba(239,68,68,0.1)', fontWeight: 500, color: '#ef4444' }}>
                        ${r.putLast > 0 ? r.putLast.toFixed(2) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      </section>

      <section className="yahoo-table-section" style={{ gridColumn: '1 / -1' }}>
        <div className="yahoo-table-title">
          <BarChart3 size={18} />
          <h3>
            {symbol && <span style={{ color: '#60a5fa', fontWeight: 700 }}>{symbol}</span>}
            {effectiveSpot && <span style={{ marginLeft: '8px', color: '#94a3b8', fontSize: '0.9em' }}>${effectiveSpot.toFixed(2)}</span>}
            {(symbol || effectiveSpot) && <span style={{ margin: '0 8px', color: '#475569' }}>•</span>}
            Volume Added Flow (Calls vs Puts)
          </h3>
        </div>
        <p className="yahoo-muted" style={{ marginTop: '-2px', marginBottom: '8px', fontSize: '0.8rem' }}>
          Compact per-update profile for 10 strikes below + ATM + 10 above. Persisted in local storage per symbol + expiry.
        </p>

        {(() => {
          const currentByStrike = new Map(
            currentVolumeFlowSnapshot.strikes.map((entry) => [entry.strike, entry] as const)
          );

          const updatesByStrike = new Map<number, Array<{ id: string; timestamp: string; callAdded: number; putAdded: number }>>();
          volumeFlowHistory.forEach((update) => {
            update.strikes.forEach((entry) => {
              const list = updatesByStrike.get(entry.strike) || [];
              list.push({
                id: update.id,
                timestamp: update.timestamp,
                callAdded: entry.callAdded,
                putAdded: entry.putAdded
              });
              updatesByStrike.set(entry.strike, list);
            });
          });

          const sortedRows = [...parsed.rows].sort((a, b) => a.strike - b.strike);
          const spotForWindow = effectiveSpot ?? sortedRows[Math.floor(sortedRows.length / 2)]?.strike ?? 0;
          const centerIndex = sortedRows.length === 0
            ? -1
            : sortedRows.reduce(
                (bestIdx, row, idx) =>
                  Math.abs(row.strike - spotForWindow) < Math.abs(sortedRows[bestIdx].strike - spotForWindow) ? idx : bestIdx,
                0
              );
          const start = centerIndex >= 0 ? Math.max(0, centerIndex - 10) : 0;
          const end = centerIndex >= 0 ? Math.min(sortedRows.length, centerIndex + 11) : 0;
          const strikes = sortedRows.slice(start, end).map((row) => row.strike);

          if (strikes.length === 0) {
            return (
              <p className="yahoo-muted">
                Run analysis to load current volumes, then updates will accumulate per strike here.
              </p>
            );
          }

          const maxCurrentTotal = Math.max(
            1,
            ...strikes.map((strike) => {
              const current = currentByStrike.get(strike);
              return (current?.callValue ?? 0) + (current?.putValue ?? 0);
            })
          );
          const maxAddedTotal = Math.max(
            1,
            ...strikes.flatMap((strike) =>
              (updatesByStrike.get(strike) || []).map((x) => Math.abs(x.callAdded) + Math.abs(x.putAdded))
            )
          );

          return (
            <div
              style={{
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '10px',
                padding: '10px',
                background: 'rgba(15, 23, 42, 0.45)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '10px' }}>
                <strong style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>Current Available Volumes + Update Timeline</strong>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    color:
                      currentVolumeFlowSnapshot.dominant === 'CALL'
                        ? '#bfdbfe'
                        : currentVolumeFlowSnapshot.dominant === 'PUT'
                          ? '#fde68a'
                          : '#e2e8f0',
                    background:
                      currentVolumeFlowSnapshot.dominant === 'CALL'
                        ? 'rgba(59,130,246,0.25)'
                        : currentVolumeFlowSnapshot.dominant === 'PUT'
                          ? 'rgba(245,158,11,0.25)'
                          : 'rgba(100,116,139,0.25)'
                  }}
                >
                  {currentVolumeFlowSnapshot.dominant === 'CALL'
                    ? 'CALLS DOMINATING'
                    : currentVolumeFlowSnapshot.dominant === 'PUT'
                      ? 'PUTS DOMINATING'
                      : 'BALANCED'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '10px' }}>
                <span style={{ color: '#60a5fa' }}>Call Vol {currentVolumeFlowSnapshot.totalCallVolume.toLocaleString()}</span>
                <span style={{ color: '#fbbf24' }}>Put Vol {currentVolumeFlowSnapshot.totalPutVolume.toLocaleString()}</span>
              </div>

              <div style={{ display: 'grid', gap: '8px' }}>
                {strikes.map((strike) => {
                  const current = currentByStrike.get(strike);
                  const updates = (updatesByStrike.get(strike) || []).slice(0, 6);
                  const currentCall = current?.callValue ?? 0;
                  const currentPut = current?.putValue ?? 0;
                  const currentTotal = currentCall + currentPut;
                  const currentStrength = currentTotal > 0 ? currentTotal / maxCurrentTotal : 0;
                  const currentCallShare = currentTotal > 0 ? currentCall / currentTotal : 0;
                  const currentPutShare = currentTotal > 0 ? currentPut / currentTotal : 0;
                  const callCurrentWidth = currentStrength * currentCallShare * 50;
                  const putCurrentWidth = currentStrength * currentPutShare * 50;

                  return (
                    <div
                      key={`flow-strike-${strike}`}
                      style={{
                        borderTop: '1px dashed rgba(148, 163, 184, 0.25)',
                        paddingTop: '6px'
                      }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '54px 120px 1fr 120px', alignItems: 'center', gap: '8px', marginBottom: updates.length > 0 ? '4px' : 0 }}>
                        <span style={{ fontSize: '0.74rem', color: '#cbd5e1', textAlign: 'right', fontWeight: 600 }}>
                          {strike.toFixed(0)}
                        </span>
                        <div style={{ fontSize: '0.72rem', color: '#60a5fa', textAlign: 'left', fontWeight: 600 }}>
                          C {current?.callValue.toLocaleString() ?? '-'}
                        </div>
                        <div style={{ position: 'relative', height: '12px', borderRadius: '999px', background: 'rgba(15,23,42,0.65)', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'rgba(148,163,184,0.45)' }} />
                          {callCurrentWidth > 0 && (
                            <div style={{ position: 'absolute', right: '50%', top: 0, bottom: 0, width: `${callCurrentWidth}%`, background: 'rgba(59,130,246,0.9)' }} />
                          )}
                          {putCurrentWidth > 0 && (
                            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: `${putCurrentWidth}%`, background: 'rgba(245,158,11,0.9)' }} />
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#fbbf24', textAlign: 'right', fontWeight: 600 }}>
                          P {current?.putValue.toLocaleString() ?? '-'}
                        </div>
                      </div>

                      {updates.length > 0 && (
                        <div style={{ display: 'grid', gap: '4px', marginLeft: '62px' }}>
                          {updates.map((entry) => {
                            const absCall = Math.abs(entry.callAdded);
                            const absPut = Math.abs(entry.putAdded);
                            const updateTotal = absCall + absPut;
                            const updateStrength = updateTotal > 0 ? updateTotal / maxAddedTotal : 0;
                            const callShare = updateTotal > 0 ? absCall / updateTotal : 0;
                            const putShare = updateTotal > 0 ? absPut / updateTotal : 0;
                            const callWidth = updateStrength * callShare * 50;
                            const putWidth = updateStrength * putShare * 50;
                            return (
                              <div key={`${entry.id}-${strike}`} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 120px', alignItems: 'center', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.66rem' }}>
                                  <span style={{ color: '#94a3b8', minWidth: '38px' }}>
                                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <span style={{ color: '#60a5fa', textAlign: 'left' }}>
                                    C {entry.callAdded > 0 ? '+' : ''}{entry.callAdded.toLocaleString()}
                                  </span>
                                </div>
                                <div style={{ position: 'relative', height: '8px', borderRadius: '999px', background: 'rgba(15,23,42,0.45)', overflow: 'hidden' }}>
                                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'rgba(148,163,184,0.3)' }} />
                                  {callWidth > 0 && (
                                    <div
                                      style={{
                                        position: 'absolute',
                                        right: '50%',
                                        top: 0,
                                        bottom: 0,
                                        width: `${callWidth}%`,
                                        background: entry.callAdded >= 0 ? 'rgba(59,130,246,0.7)' : 'rgba(239,68,68,0.75)'
                                      }}
                                    />
                                  )}
                                  {putWidth > 0 && (
                                    <div
                                      style={{
                                        position: 'absolute',
                                        left: '50%',
                                        top: 0,
                                        bottom: 0,
                                        width: `${putWidth}%`,
                                        background: entry.putAdded >= 0 ? 'rgba(245,158,11,0.7)' : 'rgba(239,68,68,0.75)'
                                      }}
                                    />
                                  )}
                                </div>
                                <div style={{ fontSize: '0.66rem', color: '#fbbf24', textAlign: 'right' }}>
                                  P {entry.putAdded > 0 ? '+' : ''}{entry.putAdded.toLocaleString()}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </section>

      <section className="yahoo-table-section">
        <div className="yahoo-table-title">
          <BarChart3 size={18} />
          <h3>Butterfly Strategy Workspace</h3>
        </div>
        <div className="butterfly-toolbar">
          <div className="butterfly-chip-group">
            <button className="butterfly-chip active">Butterfly</button>
            {/* <button className="butterfly-chip">Vertical</button>
            <button className="butterfly-chip">Single</button> */}
          </div>
          <div className="butterfly-chip-group">
            <button className={`butterfly-chip ${butterflySide === 'CALL' ? 'active' : ''}`} onClick={() => setButterflySide('CALL')}>Call</button>
            <button className={`butterfly-chip ${butterflySide === 'PUT' ? 'active' : ''}`} onClick={() => setButterflySide('PUT')}>Put</button>
            <button className={`butterfly-chip ${butterflySide === 'BOTH' ? 'active' : ''}`} onClick={() => setButterflySide('BOTH')}>Both</button>
          </div>
          <span className="butterfly-meta">
            Middle Strike Used: <strong>{butterflyModel.middleStrikeUsed ? butterflyModel.middleStrikeUsed.toFixed(2) : '-'}</strong>
          </span>
        </div>
        <p className="yahoo-muted" style={{ marginTop: 0, marginBottom: '0.7rem' }}>
          Heat focuses on debit near <strong>10%</strong> of leg spacing (for example, width 10 is hottest around debit 1.00).
        </p>
        <div className="butterfly-legend">
          <span className="butterfly-legend-label">Far from 10%</span>
          <div className="butterfly-legend-bar" />
          <span className="butterfly-legend-label">Closest to 10%</span>
        </div>
        <div className="butterfly-workspace">
          <div className="butterfly-heatmap-card">
            <div className="butterfly-heatmap-header">
              <span>STRIKE</span>
              {butterflyWidths.map((width) => <span key={`w-${width}`}>{width}</span>)}
            </div>
            <div className="butterfly-heatmap-body">
              {butterflyModel.heatmapRows.length === 0 ? (
                <p className="yahoo-muted">Load Yahoo chain data to generate butterfly heatmap.</p>
              ) : (
                butterflyModel.heatmapRows.map((row) => {
                  // Check if this strike is closest to spot price
                  const isClosestToSpot = effectiveSpot && butterflyModel.heatmapRows.reduce((closest, r) => 
                    Math.abs(r.middleStrike - effectiveSpot) < Math.abs(closest.middleStrike - effectiveSpot) ? r : closest
                  ).middleStrike === row.middleStrike;
                  
                  return (
                  <div 
                    key={`hm-row-${row.middleStrike}`} 
                    ref={isClosestToSpot ? butterflyAtmRowRef : null}
                    className="butterfly-heatmap-row"
                    style={{
                      background: isClosestToSpot ? 'rgba(56, 189, 248, 0.08)' : undefined,
                      borderLeft: isClosestToSpot ? '3px solid #38bdf8' : undefined
                    }}
                  >
                    <span 
                      className="butterfly-strike"
                      style={{
                        fontWeight: isClosestToSpot ? 700 : undefined,
                        color: isClosestToSpot ? '#38bdf8' : undefined
                      }}
                    >
                      {isClosestToSpot && '📍 '}
                      {row.middleStrike.toFixed(0)}
                    </span>
                    {butterflyWidths.map((width) => {
                      const val = row.values[width];
                      const isSelected = selectedButterflyCell?.middleStrike === row.middleStrike && selectedButterflyCell?.width === width;
                      const heatScore = row.heatScores[width];
                      const intensity = heatScore != null ? Math.max(0, Math.min(1, heatScore)) : 0;
                      // Blue (far from 10%) → Violet/Purple (close to 10%)
                      const r = Math.round(20 + (148 - 20) * intensity);
                      const g = Math.round(30 + (10 - 30) * intensity);
                      const b = Math.round(120 + (230 - 120) * intensity);
                      const bg = val == null
                        ? 'rgba(30,41,59,0.45)'
                        : `rgb(${r}, ${g}, ${b})`;
                      return (
                        <button
                          key={`hm-cell-${row.middleStrike}-${width}`}
                          className={`butterfly-cell ${isSelected ? 'selected' : ''}`}
                          style={{
                            background: bg,
                            borderColor: `rgba(148, 10, 230, ${0.1 + intensity * 0.7})`,
                            boxShadow: intensity > 0.7 ? `0 0 ${2 + intensity * 8}px rgba(148, 10, 230, ${0.2 + intensity * 0.3})` : 'none',
                            color: intensity > 0.35 ? '#f4f0ff' : '#a5b8e8'
                          }}
                          disabled={val == null}
                          onClick={() => setSelectedButterflyCell({ middleStrike: row.middleStrike, width })}
                          title={
                            val == null
                              ? 'No valid butterfly for this strike/width'
                              : `Middle ${row.middleStrike} | Width ${width} | Debit ${val.toFixed(2)} | Target ${(
                                  width * 0.1
                                ).toFixed(2)} | Heat ${(intensity * 100).toFixed(0)}%`
                          }
                        >
                          {val == null ? '-' : val.toFixed(2)}
                        </button>
                      );
                    })}
                  </div>
                  );
                })
              )}
            </div>
          </div>
          <div className="butterfly-opportunities">
            {!selectedButterflyCell ? (
              <div className="butterfly-op-card empty" />
            ) : (
              <>
                <div className="butterfly-op-card put">
                  <h4>Selected Long Put Butterfly</h4>
                  {selectedButterflyData?.put ? (
                    <>
                      <div className="butterfly-op-line">
                        <span>
                          {selectedButterflyData.put.lowerStrike.toFixed(0)}P / {selectedButterflyData.put.middleStrike.toFixed(0)}P / {selectedButterflyData.put.upperStrike.toFixed(0)}P
                        </span>
                        <strong>{selectedButterflyData.put.debit.toFixed(2)} debit</strong>
                      </div>
                      <p className="yahoo-muted">Max Profit: {selectedButterflyData.put.maxProfit.toFixed(2)} | B/E: {selectedButterflyData.put.breakevenLow.toFixed(2)} - {selectedButterflyData.put.breakevenHigh.toFixed(2)}</p>
                    </>
                  ) : <p className="yahoo-muted">No valid put setup for this selection.</p>}
                </div>
                <div className="butterfly-op-card call">
                  <h4>Selected Long Call Butterfly</h4>
                  {selectedButterflyData?.call ? (
                    <>
                      <div className="butterfly-op-line">
                        <span>
                          {selectedButterflyData.call.lowerStrike.toFixed(0)}C / {selectedButterflyData.call.middleStrike.toFixed(0)}C / {selectedButterflyData.call.upperStrike.toFixed(0)}C
                        </span>
                        <strong>{selectedButterflyData.call.debit.toFixed(2)} debit</strong>
                      </div>
                      <p className="yahoo-muted">Max Profit: {selectedButterflyData.call.maxProfit.toFixed(2)} | B/E: {selectedButterflyData.call.breakevenLow.toFixed(2)} - {selectedButterflyData.call.breakevenHigh.toFixed(2)}</p>
                    </>
                  ) : <p className="yahoo-muted">No valid call setup for this selection.</p>}
                </div>
                <div className="butterfly-op-card">
                  <h4>Strike Legs by Width (same middle strike)</h4>
                  <div className="butterfly-leg-list">
                    {selectedMiddleAllWidths.map((entry) => (
                      <div key={`legs-${selectedButterflyCell.middleStrike}-${entry.width}`} className="butterfly-op-line">
                        <span>W{entry.width}: {entry.data?.call ? `${entry.data.call.lowerStrike.toFixed(0)} / ${entry.data.call.middleStrike.toFixed(0)} / ${entry.data.call.upperStrike.toFixed(0)}` : '-'}</span>
                        <strong>{entry.data?.call ? `${entry.data.call.debit.toFixed(2)}C` : '-'} | {entry.data?.put ? `${entry.data.put.debit.toFixed(2)}P` : '-'}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="yahoo-chart-grid">
        <InsightBarList
          title="Most Active Contracts by Volume"
          items={mostActiveVolumeItems}
          onOpenContract={openContractInTradingView}
        />
        <InsightBarList
          title="Most Active Contracts by Open Interest"
          items={mostActiveOiItems}
          onOpenContract={openContractInTradingView}
        />
      </section>

      <section className="yahoo-table-section">
        <div className="yahoo-table-title">
          <BarChart3 size={18} />
          <h3>Most Active Contracts ({symbol.toUpperCase()})</h3>
        </div>
        <div className="yahoo-table-wrapper">
          <table className="yahoo-table">
            <thead>
              <tr>
                <th>Contract</th>
                <th>Type</th>
                <th>Strike</th>
                <th>Expiry</th>
                <th>Volume</th>
                <th>Open Interest</th>
                <th>IV</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {mostActiveTopByVolume.length === 0 ? (
                <tr>
                  <td colSpan={8} className="chain-delta-empty">Load chain data to populate most active contracts.</td>
                </tr>
              ) : (
                mostActiveTopByVolume.map((row) => {
                  const optionType = getMostActiveOptionType(row);
                  return (
                    <tr
                      key={row.contractSymbol}
                      className="most-active-row"
                      onClick={() => openContractInTradingView(row.contractSymbol)}
                      title="Click to view TradingView chart"
                    >
                      <td className="most-active-contract-cell">
                        <span className="most-active-chart-icon">📈</span>
                        {formatContractSymbol(row.contractSymbol)}
                      </td>
                      <td className={optionType === 'CALL' ? 'yahoo-call' : 'yahoo-put'}>
                        {optionType}
                      </td>
                      <td>{row.strike.toFixed(2)}</td>
                      <td>{new Date(row.expiration * 1000).toLocaleDateString()}</td>
                      <td>{row.volume.toLocaleString()}</td>
                      <td>{row.openInterest.toLocaleString()}</td>
                      <td>{(row.impliedVolatility > 3 ? row.impliedVolatility : row.impliedVolatility * 100).toFixed(2)}%</td>
                      <td>{row.price.toFixed(2)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </section>

      {/* Four Insight Cards - Full Width Section */}
      {effectiveSpot && parsed.rows.length > 0 && (() => {
          const rows = parsed.rows;
          
          // Find top volume and OI strikes
          const topCallVolumeStrikes = [...rows]
            .sort((a, b) => b.callVolume - a.callVolume)
            .slice(0, 5);
          
          const topPutVolumeStrikes = [...rows]
            .sort((a, b) => b.putVolume - a.putVolume)
            .slice(0, 5);
          
          const topCallOiStrikes = [...rows]
            .sort((a, b) => b.callOi - a.callOi)
            .slice(0, 5);
          
          const topPutOiStrikes = [...rows]
            .sort((a, b) => b.putOi - a.putOi)
            .slice(0, 5);
          
          // Find hot strikes (where volume is being added)
          const hotStrikes = dataHistory.length > 0 
            ? rows
                .map(r => {
                  const callVolDeltas = getDeltas(r.strike, 'callVolume');
                  const putVolDeltas = getDeltas(r.strike, 'putVolume');
                  const recentCallChange = callVolDeltas[0] || 0;
                  const recentPutChange = putVolDeltas[0] || 0;
                  const totalRecentChange = recentCallChange + recentPutChange;

                  return {
                    strike: r.strike,
                    callChange: recentCallChange,
                    putChange: recentPutChange,
                    totalChange: totalRecentChange,
                    type: recentCallChange > recentPutChange ? 'CALL' : 'PUT',
                    row: r
                  };
                })
                .filter(s => Math.abs(s.totalChange) > 0)
                .sort((a, b) => Math.abs(b.totalChange) - Math.abs(a.totalChange))
                .slice(0, 5)
            : rows
                .map(r => {
                  const totalVolume = r.callVolume + r.putVolume;
                  return {
                    strike: r.strike,
                    callChange: r.callVolume,
                    putChange: r.putVolume,
                    totalChange: totalVolume,
                    type: r.callVolume > r.putVolume ? 'CALL' : 'PUT',
                    row: r
                  };
                })
                .filter(s => s.totalChange > 0)
                .sort((a, b) => b.totalChange - a.totalChange)
                .slice(0, 5);

          return (
            <div className="insight-cards-container">
              <div className={`decision-insights ${isRefreshing ? 'updating' : ''}`}>
                  {/* Top Volume Strikes */}
                  <div className="insight-card">
                    <div className="insight-header">
                      <span className="insight-icon">📈</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                        <span className="insight-title">Highest Volume Strikes</span>
                        {symbol && effectiveSpot && (
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 400 }}>
                            {symbol} • ${effectiveSpot.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="insight-content">
                      <div className="strike-list-section">
                        <div className="strike-list-header call">Call Options</div>
                        {topCallVolumeStrikes.map((row, idx) => (
                          <div key={`call-vol-${row.strike}`} className="strike-list-item">
                            <span className="strike-rank">#{idx + 1}</span>
                            <span className="strike-price">${row.strike.toFixed(2)}</span>
                            <span className="strike-metric call">
                              Vol: {row.callVolume.toLocaleString()}
                            </span>
                            <span className="strike-premium">${row.callLast.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="strike-list-section">
                        <div className="strike-list-header put">Put Options</div>
                        {topPutVolumeStrikes.map((row, idx) => (
                          <div key={`put-vol-${row.strike}`} className="strike-list-item">
                            <span className="strike-rank">#{idx + 1}</span>
                            <span className="strike-price">${row.strike.toFixed(2)}</span>
                            <span className="strike-metric put">
                              Vol: {row.putVolume.toLocaleString()}
                            </span>
                            <span className="strike-premium">${row.putLast.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Top OI Strikes */}
                  <div className="insight-card">
                    <div className="insight-header">
                      <span className="insight-icon">💼</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                        <span className="insight-title">Highest Open Interest</span>
                        {symbol && effectiveSpot && (
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 400 }}>
                            {symbol} • ${effectiveSpot.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="insight-content">
                      <div className="strike-list-section">
                        <div className="strike-list-header call">Call Options</div>
                        {topCallOiStrikes.map((row, idx) => (
                          <div key={`call-oi-${row.strike}`} className="strike-list-item">
                            <span className="strike-rank">#{idx + 1}</span>
                            <span className="strike-price">${row.strike.toFixed(2)}</span>
                            <span className="strike-metric call">
                              OI: {row.callOi.toLocaleString()}
                            </span>
                            <span className="strike-premium">${row.callLast.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="strike-list-section">
                        <div className="strike-list-header put">Put Options</div>
                        {topPutOiStrikes.map((row, idx) => (
                          <div key={`put-oi-${row.strike}`} className="strike-list-item">
                            <span className="strike-rank">#{idx + 1}</span>
                            <span className="strike-price">${row.strike.toFixed(2)}</span>
                            <span className="strike-metric put">
                              OI: {row.putOi.toLocaleString()}
                            </span>
                            <span className="strike-premium">${row.putLast.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Hot Strikes - Volume Being Added */}
                  <div className="insight-card">
                    <div className="insight-header">
                      <span className="insight-icon">🔥</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                        <span className="insight-title">Hot Strikes (Volume Added Recently)</span>
                        {symbol && effectiveSpot && (
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 400 }}>
                            {symbol} • ${effectiveSpot.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="insight-content">
                      {hotStrikes.length > 0 ? (
                        <>
                          <div className="hot-strikes-list">
                            {hotStrikes.map((hs, idx) => (
                              <div key={hs.strike} className="hot-strike-item">
                                <div className="hot-strike-main">
                                  <span className="strike-rank hot">#{idx + 1}</span>
                                  <span className="strike-price">${hs.strike.toFixed(2)}</span>
                                  <span className={`hot-strike-type ${hs.type.toLowerCase()}`}>
                                    {hs.type}
                                  </span>
                                </div>
                                <div className="hot-strike-details">
                                  <span className="hot-strike-change call">
                                    C: {hs.callChange > 0 ? '+' : ''}{hs.callChange.toLocaleString()}
                                  </span>
                                  <span className="hot-strike-change put">
                                    P: {hs.putChange > 0 ? '+' : ''}{hs.putChange.toLocaleString()}
                                  </span>
                                  <span className="hot-strike-current">
                                    Total: {(hs.row.callVolume + hs.row.putVolume).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="hot-strikes-note">
                            {dataHistory.length > 0 
                              ? '⚡ These strikes are attracting the most new volume in recent updates'
                              : '📊 Showing highest volume strikes (no delta history yet)'}
                          </div>
                        </>
                      ) : (
                        <p className="yahoo-muted">No volume data available.</p>
                      )}
                    </div>
                  </div>

                  {/* Key Trading Levels */}
                  <div className="insight-card">
                    <div className="insight-header">
                      <span className="insight-icon">🎯</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                        <span className="insight-title">Key Trading Levels</span>
                        {symbol && effectiveSpot && (
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 400 }}>
                            {symbol} • ${effectiveSpot.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="insight-content">
                      <div className="trading-levels">
                        <div className="trading-level-item">
                          <span className="level-label">Max Pain / Pinning Risk:</span>
                          <span className="level-value">${Math.max(stats.callWall, stats.putWall).toFixed(2)}</span>
                        </div>
                        <div className="trading-level-item">
                          <span className="level-label">Call Wall (Resistance):</span>
                          <span className="level-value call">${stats.callWall.toFixed(2)}</span>
                        </div>
                        <div className="trading-level-item">
                          <span className="level-label">Put Wall (Support):</span>
                          <span className="level-value put">${stats.putWall.toFixed(2)}</span>
                        </div>
                        <div className="trading-level-item">
                          <span className="level-label">Expected Move (±):</span>
                          <span className="level-value">${stats.expectedMove.toFixed(2)} ({stats.expectedMovePct.toFixed(1)}%)</span>
                        </div>
                        <div className="trading-level-item">
                          <span className="level-label">Breakout Targets:</span>
                          <span className="level-value">
                            ${downTarget.toFixed(2)} / ${upTarget.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
    </div>
  );
};

export default YahooChainStructureDashboard;
