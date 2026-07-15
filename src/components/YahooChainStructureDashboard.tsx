import React, { useEffect, useMemo, useState, useRef } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { fetchYahooMostActiveOptions, fetchYahooOptionChain, YahooMostActiveOptionRow } from '../utils/yahooOptions';

type DashboardType =
  | 'options'
  | 'darkpool'
  | 'psychology'
  | 'chainStructure'
  | 'chainStructureYahoo'
  | 'yahooExpiryHighlights';

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

function readStoredJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStoredJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / privacy errors.
  }
}

function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isTimestampToday(timestamp: string): boolean {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return false;
  return getLocalDateKey(parsed) === getLocalDateKey();
}

function filterVolumeFlowToToday(history: VolumeFlowUpdate[]): VolumeFlowUpdate[] {
  return history.filter((update) => isTimestampToday(update.timestamp));
}

interface StoredChainSnapshot extends ParsedChainData {
  savedAt?: string;
}

function readStoredChainSnapshot(key: string): ParsedChainData | null {
  const snapshot = readStoredJson<StoredChainSnapshot>(key);
  if (!snapshot || !Array.isArray(snapshot.rows)) return null;
  if (!snapshot.savedAt || snapshot.savedAt !== getLocalDateKey()) {
    return null;
  }
  const { savedAt: _savedAt, ...parsed } = snapshot;
  return parsed;
}

function writeStoredChainSnapshot(key: string, data: ParsedChainData): void {
  writeStoredJson(key, { ...data, savedAt: getLocalDateKey() });
}

function readStoredFlowHistory(key: string): VolumeFlowUpdate[] {
  const stored = readStoredJson<VolumeFlowUpdate[]>(key);
  if (!Array.isArray(stored)) return [];
  const todayOnly = filterVolumeFlowToToday(stored);
  if (todayOnly.length !== stored.length) {
    writeStoredJson(key, todayOnly);
  }
  return todayOnly.slice(0, 25);
}

function writeStoredFlowHistory(key: string, history: VolumeFlowUpdate[]): void {
  writeStoredJson(key, filterVolumeFlowToToday(history).slice(0, 25));
}

function getChainStorageBase(symbol: string, expiry: number | null): string {
  return `chain-structure:v2:${symbol.trim().toUpperCase() || 'UNKNOWN'}:${expiry ?? 'nearest'}`;
}

function getAtmWindowRows(rows: ChainRow[], spot: number, below = 10, above = 10): ChainRow[] {
  const sortedRows = [...rows].sort((a, b) => a.strike - b.strike);
  if (sortedRows.length === 0) return [];
  const centerIndex = sortedRows.reduce(
    (bestIdx, row, idx) =>
      Math.abs(row.strike - spot) < Math.abs(sortedRows[bestIdx].strike - spot) ? idx : bestIdx,
    0
  );
  const start = Math.max(0, centerIndex - below);
  const end = Math.min(sortedRows.length, centerIndex + above + 1);
  return sortedRows.slice(start, end);
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
  callOiAdded?: number;
  putOiAdded?: number;
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

function getFlowExpiries(selectedExpiry: number | null, availableExpiries: number[], count = 3): number[] {
  if (availableExpiries.length === 0) {
    return selectedExpiry ? [selectedExpiry] : [];
  }
  if (!selectedExpiry) {
    return availableExpiries.slice(0, count);
  }
  const selectedIndex = availableExpiries.indexOf(selectedExpiry);
  const startIndex = selectedIndex >= 0 ? selectedIndex : 0;
  return availableExpiries.slice(startIndex, startIndex + count);
}

interface FlowExpiryState {
  parsed: ParsedChainData;
  history: VolumeFlowUpdate[];
}

function buildVolumeFlowUpdate(
  ticker: string,
  expiry: number,
  normalized: ParsedChainData,
  previousParsed: ParsedChainData,
  detectedSpot: number | null
): VolumeFlowUpdate | null {
  if (previousParsed.rows.length === 0) return null;

  const prevByStrike = new Map<number, ChainRow>(previousParsed.rows.map((row) => [row.strike, row]));
  const spotForWindow = detectedSpot ?? normalized.spotPrice ?? previousParsed.spotPrice ?? 0;
  const windowRows = getAtmWindowRows(normalized.rows, spotForWindow);
  const strikeDiffs: VolumeFlowStrikeDelta[] = windowRows.map((row) => {
    const prev = prevByStrike.get(row.strike);
    return {
      strike: row.strike,
      callAdded: row.callVolume - (prev?.callVolume ?? 0),
      putAdded: row.putVolume - (prev?.putVolume ?? 0),
      callOiAdded: row.callOi - (prev?.callOi ?? 0),
      putOiAdded: row.putOi - (prev?.putOi ?? 0)
    };
  });

  const totalCallAdded = strikeDiffs.reduce((sum, row) => sum + row.callAdded, 0);
  const totalPutAdded = strikeDiffs.reduce((sum, row) => sum + row.putAdded, 0);
  const changedStrikes = strikeDiffs.filter((row) => row.callAdded !== 0 || row.putAdded !== 0);
  if (changedStrikes.length === 0) return null;

  const positiveCall = Math.max(0, totalCallAdded);
  const positivePut = Math.max(0, totalPutAdded);
  const dominant: 'CALL' | 'PUT' | 'BALANCED' =
    positiveCall > positivePut * 1.1 ? 'CALL' : positivePut > positiveCall * 1.1 ? 'PUT' : 'BALANCED';

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    symbol: ticker,
    expiry,
    expiryLabel: toExpiryLabel(expiry),
    spot: detectedSpot ?? normalized.spotPrice,
    totalCallAdded,
    totalPutAdded,
    dominant,
    strikes: changedStrikes
  };
}

type FlowStrikeUpdateEntry = {
  id: string;
  timestamp: string;
  callAdded: number;
  putAdded: number;
  callOiAdded: number;
  putOiAdded: number;
};

interface FlowColumnModel {
  expiryLabel: string;
  currentByStrike: Map<
    number,
    {
      strike: number;
      callValue: number;
      putValue: number;
      callOiValue: number;
      putOiValue: number;
    }
  >;
  updatesByStrike: Map<number, FlowStrikeUpdateEntry[]>;
  windowCallTotal: number;
  windowPutTotal: number;
  windowDominant: 'CALL' | 'PUT' | 'BALANCED';
  maxCurrentTotal: number;
  maxCurrentOiTotal: number;
  hasData: boolean;
}

const MAX_FLOW_UPDATES_PER_STRIKE = 6;
const FLOW_UPDATE_SLOT_HEIGHT = 22;
const FLOW_TIME_COL = '52px';
const FLOW_CALL_COL = '82px';
const FLOW_PUT_COL = '82px';
const FLOW_CELL_ROW_GRID = `${FLOW_TIME_COL} ${FLOW_CALL_COL} minmax(48px, 1fr) ${FLOW_PUT_COL}`;

function getFlowProportionalWidths(callValue: number, putValue: number): { callWidth: number; putWidth: number } {
  const total = Math.abs(callValue) + Math.abs(putValue);
  if (total <= 0) return { callWidth: 0, putWidth: 0 };
  return {
    callWidth: (Math.abs(callValue) / total) * 50,
    putWidth: (Math.abs(putValue) / total) * 50
  };
}

const FlowVolumeBar: React.FC<{
  callWidth: number;
  putWidth: number;
  callOiWidth?: number;
  putOiWidth?: number;
  callBarColor?: string;
  putBarColor?: string;
  height?: number;
}> = ({
  callWidth,
  putWidth,
  callOiWidth = 0,
  putOiWidth = 0,
  callBarColor = 'rgba(59,130,246,0.85)',
  putBarColor = 'rgba(245,158,11,0.85)',
  height = 8
}) => (
  <div
    style={{
      position: 'relative',
      height: `${height}px`,
      borderRadius: '999px',
      background: 'rgba(15,23,42,0.45)',
      overflow: 'hidden',
      minWidth: 0,
      width: '100%'
    }}
  >
    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'rgba(148,163,184,0.35)' }} />
    {callWidth > 0 && (
      <div
        style={{
          position: 'absolute',
          right: '50%',
          top: 0,
          bottom: 0,
          width: `${callWidth}%`,
          background: callBarColor
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
          background: putBarColor
        }}
      />
    )}
    {callOiWidth > 0 && (
      <div
        style={{
          position: 'absolute',
          right: '50%',
          top: '50%',
          height: '2px',
          marginTop: '-1px',
          width: `${callOiWidth}%`,
          background: 'rgba(74, 222, 128, 0.9)'
        }}
      />
    )}
    {putOiWidth > 0 && (
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          height: '2px',
          marginTop: '-1px',
          width: `${putOiWidth}%`,
          background: 'rgba(251, 113, 133, 0.9)'
        }}
      />
    )}
  </div>
);

const FlowDataRow: React.FC<{
  timeLabel?: string | null;
  callLabel: string;
  putLabel: string;
  callWidth: number;
  putWidth: number;
  callOiWidth?: number;
  putOiWidth?: number;
  callBarColor?: string;
  putBarColor?: string;
  callLabelColor?: string;
  putLabelColor?: string;
  barHeight?: number;
  fontSize?: string;
  fontWeight?: number;
  minHeight?: number;
  opacity?: number;
}> = ({
  timeLabel = null,
  callLabel,
  putLabel,
  callWidth,
  putWidth,
  callOiWidth = 0,
  putOiWidth = 0,
  callBarColor,
  putBarColor,
  callLabelColor = '#60a5fa',
  putLabelColor = '#fbbf24',
  barHeight = 8,
  fontSize = '0.62rem',
  fontWeight = 600,
  minHeight = FLOW_UPDATE_SLOT_HEIGHT,
  opacity = 1
}) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: FLOW_CELL_ROW_GRID,
      gap: '6px',
      alignItems: 'center',
      minHeight: `${minHeight}px`,
      fontSize,
      opacity
    }}
  >
    <span
      style={{
        color: '#94a3b8',
        whiteSpace: 'nowrap',
        lineHeight: 1,
        textAlign: 'left'
      }}
    >
      {timeLabel ?? ''}
    </span>
    <span
      style={{
        color: callLabelColor,
        whiteSpace: 'nowrap',
        lineHeight: 1,
        fontWeight,
        textAlign: 'left'
      }}
    >
      {callLabel}
    </span>
    <FlowVolumeBar
      callWidth={callWidth}
      putWidth={putWidth}
      callOiWidth={callOiWidth}
      putOiWidth={putOiWidth}
      callBarColor={callBarColor}
      putBarColor={putBarColor}
      height={barHeight}
    />
    <span
      style={{
        color: putLabelColor,
        whiteSpace: 'nowrap',
        textAlign: 'right',
        lineHeight: 1,
        fontWeight,
        justifySelf: 'stretch'
      }}
    >
      {putLabel}
    </span>
  </div>
);

const FlowOptionsDivider: React.FC<{ label?: string }> = ({ label = 'Options' }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      marginBottom: '6px',
      fontSize: '0.58rem',
      color: '#64748b',
      letterSpacing: '0.08em',
      textTransform: 'uppercase'
    }}
  >
    <div style={{ flex: 1, height: '1px', background: 'rgba(148,163,184,0.28)' }} />
    <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
    <div style={{ flex: 1, height: '1px', background: 'rgba(148,163,184,0.28)' }} />
  </div>
);

function buildFlowColumnModel(
  expiryLabel: string,
  chainRows: ChainRow[],
  volumeFlowHistory: VolumeFlowUpdate[],
  spot: number | null
): FlowColumnModel {
  const updatesByStrike = new Map<number, FlowStrikeUpdateEntry[]>();
  const todayHistory = filterVolumeFlowToToday(volumeFlowHistory);
  todayHistory.forEach((update) => {
    update.strikes.forEach((entry) => {
      if (entry.callAdded === 0 && entry.putAdded === 0) return;
      const list = updatesByStrike.get(entry.strike) || [];
      list.push({
        id: update.id,
        timestamp: update.timestamp,
        callAdded: entry.callAdded,
        putAdded: entry.putAdded,
        callOiAdded: entry.callOiAdded ?? 0,
        putOiAdded: entry.putOiAdded ?? 0
      });
      updatesByStrike.set(entry.strike, list);
    });
  });

  const sortedRows = [...chainRows].sort((a, b) => a.strike - b.strike);
  const spotForWindow = spot ?? sortedRows[Math.floor(sortedRows.length / 2)]?.strike ?? 0;
  const windowRows = getAtmWindowRows(sortedRows, spotForWindow);
  const currentByStrike = new Map(
    windowRows.map((row) => [
      row.strike,
      {
        strike: row.strike,
        callValue: row.callVolume,
        putValue: row.putVolume,
        callOiValue: row.callOi,
        putOiValue: row.putOi
      }
    ] as const)
  );

  const strikes = windowRows.map((row) => row.strike);
  const windowCallTotal = windowRows.reduce((sum, row) => sum + row.callVolume, 0);
  const windowPutTotal = windowRows.reduce((sum, row) => sum + row.putVolume, 0);
  const windowDominant: 'CALL' | 'PUT' | 'BALANCED' =
    windowCallTotal > windowPutTotal * 1.05
      ? 'CALL'
      : windowPutTotal > windowCallTotal * 1.05
        ? 'PUT'
        : 'BALANCED';

  const maxCurrentTotal = Math.max(
    1,
    ...strikes.map((strike) => {
      const current = currentByStrike.get(strike);
      return (current?.callValue ?? 0) + (current?.putValue ?? 0);
    })
  );
  const maxCurrentOiTotal = Math.max(
    1,
    ...strikes.map((strike) => {
      const current = currentByStrike.get(strike);
      return (current?.callOiValue ?? 0) + (current?.putOiValue ?? 0);
    })
  );

  return {
    expiryLabel,
    currentByStrike,
    updatesByStrike,
    windowCallTotal,
    windowPutTotal,
    windowDominant,
    maxCurrentTotal,
    maxCurrentOiTotal,
    hasData: strikes.length > 0
  };
}

function getFlowUpdatesForStrike(
  updatesByStrike: Map<number, FlowStrikeUpdateEntry[]>,
  strike: number
): FlowStrikeUpdateEntry[] {
  return (updatesByStrike.get(strike) || [])
    .filter((entry) => entry.callAdded !== 0 || entry.putAdded !== 0)
    .slice(0, MAX_FLOW_UPDATES_PER_STRIKE);
}

function getAtmStrike(strikes: number[], spot: number): number | null {
  if (!spot || strikes.length === 0) return null;
  return strikes.reduce((best, strike) =>
    Math.abs(strike - spot) < Math.abs(best - spot) ? strike : best
  );
}

function getSpotMarkerAfterStrike(strikes: number[], spot: number): number | null {
  if (!spot || strikes.length === 0) return null;
  const atmStrike = getAtmStrike(strikes, spot);
  if (atmStrike != null && Math.abs(atmStrike - spot) < 0.005) return null;

  for (let i = 0; i < strikes.length - 1; i++) {
    if (spot > strikes[i] && spot < strikes[i + 1]) {
      return strikes[i];
    }
  }
  return null;
}

const SpotPriceMarkerRow: React.FC<{
  spot: number;
  gridTemplate: string;
  columnCount: number;
}> = ({ spot, gridTemplate, columnCount }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: gridTemplate,
      gap: '8px 12px',
      alignItems: 'center',
      margin: '2px 0'
    }}
  >
    <div style={{ textAlign: 'right', fontSize: '0.62rem', color: '#38bdf8', fontWeight: 700, lineHeight: 1.2 }}>
      ●
    </div>
    <div style={{ gridColumn: `span ${columnCount}`, display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <div style={{ flex: 1, height: '2px', background: 'linear-gradient(90deg, transparent, #38bdf8)' }} />
      <span
        style={{
          fontSize: '0.68rem',
          color: '#38bdf8',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          padding: '2px 8px',
          borderRadius: '999px',
          background: 'rgba(56, 189, 248, 0.15)',
          border: '1px solid rgba(56, 189, 248, 0.45)',
          boxShadow: '0 0 8px rgba(56, 189, 248, 0.25)'
        }}
      >
        Spot ${spot.toFixed(2)}
      </span>
      <div style={{ flex: 1, height: '2px', background: 'linear-gradient(90deg, #38bdf8, transparent)' }} />
    </div>
  </div>
);

const VolumeFlowStrikeCell: React.FC<{
  strike: number;
  model: FlowColumnModel;
  updateSlots: number;
}> = ({ strike, model, updateSlots }) => {
  const current = model.currentByStrike.get(strike);
  const updates = getFlowUpdatesForStrike(model.updatesByStrike, strike);
  const paddedUpdates: Array<FlowStrikeUpdateEntry | null> = [
    ...updates,
    ...Array.from({ length: Math.max(0, updateSlots - updates.length) }, () => null)
  ];

  const currentCall = current?.callValue ?? 0;
  const currentPut = current?.putValue ?? 0;
  const callCurrentWidth = (currentCall / model.maxCurrentTotal) * 50;
  const putCurrentWidth = (currentPut / model.maxCurrentTotal) * 50;
  const currentCallOi = current?.callOiValue ?? 0;
  const currentPutOi = current?.putOiValue ?? 0;
  const callCurrentOiWidth = (currentCallOi / model.maxCurrentOiTotal) * 50;
  const putCurrentOiWidth = (currentPutOi / model.maxCurrentOiTotal) * 50;

  return (
    <div style={{ minWidth: 0, height: '100%' }}>
      <FlowOptionsDivider />
      <FlowDataRow
        callLabel={`C ${current ? current.callValue.toLocaleString() : '-'}`}
        putLabel={`P ${current ? current.putValue.toLocaleString() : '-'}`}
        callWidth={callCurrentWidth}
        putWidth={putCurrentWidth}
        callOiWidth={callCurrentOiWidth}
        putOiWidth={putCurrentOiWidth}
        barHeight={10}
        fontSize="0.66rem"
        minHeight={24}
      />

      {updateSlots > 0 && (
        <div style={{ display: 'grid', gap: '3px', marginTop: '4px' }}>
          {paddedUpdates.map((entry, idx) => {
            if (!entry) {
              return (
                <div
                  key={`pad-${strike}-${idx}`}
                  style={{ height: `${FLOW_UPDATE_SLOT_HEIGHT}px`, visibility: 'hidden' }}
                  aria-hidden="true"
                />
              );
            }

            const absCall = Math.abs(entry.callAdded);
            const absPut = Math.abs(entry.putAdded);
            const updateTotal = absCall + absPut;
            const isZeroUpdate = updateTotal === 0;
            const callWidth = (absCall / model.maxCurrentTotal) * 50;
            const putWidth = (absPut / model.maxCurrentTotal) * 50;
            const absCallOi = Math.abs(entry.callOiAdded ?? 0);
            const absPutOi = Math.abs(entry.putOiAdded ?? 0);
            const callOiWidth = (absCallOi / model.maxCurrentOiTotal) * 50;
            const putOiWidth = (absPutOi / model.maxCurrentOiTotal) * 50;

            return (
              <FlowDataRow
                key={`${entry.id}-${strike}`}
                timeLabel={new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                callLabel={`C ${entry.callAdded > 0 ? '+' : ''}${entry.callAdded.toLocaleString()}`}
                putLabel={`P ${entry.putAdded > 0 ? '+' : ''}${entry.putAdded.toLocaleString()}`}
                callWidth={callWidth}
                putWidth={putWidth}
                callOiWidth={callOiWidth}
                putOiWidth={putOiWidth}
                callBarColor={entry.callAdded >= 0 ? 'rgba(59,130,246,0.7)' : 'rgba(239,68,68,0.75)'}
                putBarColor={entry.putAdded >= 0 ? 'rgba(245,158,11,0.7)' : 'rgba(239,68,68,0.75)'}
                callLabelColor={isZeroUpdate ? '#64748b' : '#60a5fa'}
                putLabelColor={isZeroUpdate ? '#64748b' : '#fbbf24'}
                opacity={isZeroUpdate ? 0.55 : 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

const VolumeFlowGrid: React.FC<{
  columns: Array<{
    expiry: number;
    expiryLabel: string;
    chainRows: ChainRow[];
    volumeFlowHistory: VolumeFlowUpdate[];
    spot: number | null;
  }>;
  referenceSpot: number | null;
}> = ({ columns, referenceSpot }) => {
  const models = columns.map((column) =>
    buildFlowColumnModel(column.expiryLabel, column.chainRows, column.volumeFlowHistory, column.spot)
  );

  const referenceRows =
    columns.find((column) => column.chainRows.length > 0)?.chainRows ??
    columns[0]?.chainRows ??
    [];
  const spotForAlignment =
    referenceSpot ??
    columns.find((column) => column.spot)?.spot ??
    referenceRows[Math.floor(referenceRows.length / 2)]?.strike ??
    0;
  const alignedStrikes = getAtmWindowRows(
    [...referenceRows].sort((a, b) => a.strike - b.strike),
    spotForAlignment
  ).map((row) => row.strike);

  const maxUpdatesPerStrike = new Map<number, number>();
  alignedStrikes.forEach((strike) => {
    let maxSlots = 0;
    models.forEach((model) => {
      const count = getFlowUpdatesForStrike(model.updatesByStrike, strike).length;
      maxSlots = Math.max(maxSlots, count);
    });
    maxUpdatesPerStrike.set(strike, maxSlots);
  });

  const atmStrike = spotForAlignment > 0 ? getAtmStrike(alignedStrikes, spotForAlignment) : null;
  const isSpotOnStrike =
    atmStrike != null && spotForAlignment > 0 && Math.abs(atmStrike - spotForAlignment) < 0.005;
  const spotMarkerAfterStrike =
    spotForAlignment > 0 ? getSpotMarkerAfterStrike(alignedStrikes, spotForAlignment) : null;

  const columnCount = columns.length;
  const gridTemplate = `48px repeat(${columnCount}, minmax(0, 1fr))`;

  if (alignedStrikes.length === 0) {
    return (
      <p className="yahoo-muted">
        Run analysis to load current volumes, then updates will accumulate per strike here.
      </p>
    );
  }

  return (
    <div
      style={{
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: '10px',
        padding: '10px',
        background: 'rgba(15, 23, 42, 0.45)'
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridTemplate,
          gap: '8px 12px',
          marginBottom: '12px',
          alignItems: 'stretch'
        }}
      >
        <div />
        {models.map((model, idx) => (
          <div
            key={`flow-header-${columns[idx].expiry}`}
            style={{
              border: '1px solid rgba(148, 163, 184, 0.15)',
              borderRadius: '8px',
              padding: '8px',
              background: 'rgba(15, 23, 42, 0.35)',
              minWidth: 0
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '6px', fontWeight: 700, fontSize: '0.82rem', color: '#e2e8f0' }}>
              {model.expiryLabel}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
              <strong style={{ fontSize: '0.68rem', color: '#e2e8f0' }}>Current + Updates</strong>
              <span
                style={{
                  fontSize: '0.64rem',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '999px',
                  color:
                    model.windowDominant === 'CALL'
                      ? '#bfdbfe'
                      : model.windowDominant === 'PUT'
                        ? '#fde68a'
                        : '#e2e8f0',
                  background:
                    model.windowDominant === 'CALL'
                      ? 'rgba(59,130,246,0.25)'
                      : model.windowDominant === 'PUT'
                        ? 'rgba(245,158,11,0.25)'
                        : 'rgba(100,116,139,0.25)'
                }}
              >
                {model.windowDominant === 'CALL'
                  ? 'CALLS'
                  : model.windowDominant === 'PUT'
                    ? 'PUTS'
                    : 'BALANCED'}
              </span>
            </div>
            <FlowOptionsDivider label="Total Options" />
            <FlowDataRow
              callLabel={`C ${model.windowCallTotal.toLocaleString()}`}
              putLabel={`P ${model.windowPutTotal.toLocaleString()}`}
              callWidth={getFlowProportionalWidths(model.windowCallTotal, model.windowPutTotal).callWidth}
              putWidth={getFlowProportionalWidths(model.windowCallTotal, model.windowPutTotal).putWidth}
              barHeight={10}
              fontSize="0.68rem"
              minHeight={24}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: '8px' }}>
        {alignedStrikes.map((strike) => {
          const updateSlots = maxUpdatesPerStrike.get(strike) ?? 0;
          const isAtmRow = isSpotOnStrike && strike === atmStrike;
          return (
            <React.Fragment key={`flow-row-${strike}`}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: gridTemplate,
                  gap: '8px 12px',
                  borderTop: '1px dashed rgba(148, 163, 184, 0.25)',
                  paddingTop: '6px',
                  paddingBottom: isAtmRow ? '6px' : undefined,
                  alignItems: 'start',
                  background: isAtmRow ? 'rgba(56, 189, 248, 0.1)' : undefined,
                  borderLeft: isAtmRow ? '3px solid #38bdf8' : undefined,
                  borderRadius: isAtmRow ? '6px' : undefined,
                  boxShadow: isAtmRow ? '0 0 8px rgba(56, 189, 248, 0.2)' : undefined
                }}
              >
                <div
                  style={{
                    fontSize: '0.74rem',
                    color: isAtmRow ? '#38bdf8' : '#cbd5e1',
                    textAlign: 'right',
                    fontWeight: 700,
                    paddingTop: '2px',
                    lineHeight: 1.2
                  }}
                >
                  {isAtmRow && (
                    <div style={{ fontSize: '0.58rem', marginBottom: '2px' }}>📍</div>
                  )}
                  {strike.toFixed(0)}
                  {isAtmRow && spotForAlignment > 0 && (
                    <div style={{ fontSize: '0.58rem', color: '#7dd3fc', marginTop: '2px', fontWeight: 600 }}>
                      ${spotForAlignment.toFixed(2)}
                    </div>
                  )}
                </div>
                {models.map((model, idx) => (
                  <div
                    key={`flow-cell-${columns[idx].expiry}-${strike}`}
                    style={{
                      borderLeft: idx > 0 ? '1px solid rgba(148, 163, 184, 0.12)' : undefined,
                      paddingLeft: idx > 0 ? '10px' : undefined,
                      minWidth: 0
                    }}
                  >
                    <VolumeFlowStrikeCell strike={strike} model={model} updateSlots={updateSlots} />
                  </div>
                ))}
              </div>
              {spotMarkerAfterStrike === strike && spotForAlignment > 0 && (
                <SpotPriceMarkerRow
                  spot={spotForAlignment}
                  gridTemplate={gridTemplate}
                  columnCount={columnCount}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

const YahooChainStructureDashboard: React.FC<YahooChainStructureDashboardProps> = ({
  activeDashboard,
  setActiveDashboard
}) => {
  const [symbol, setSymbol] = useState('NVDA');
  const [debouncedChartSymbol, setDebouncedChartSymbol] = useState('NVDA');
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
  const [flowDataByExpiry, setFlowDataByExpiry] = useState<Record<number, FlowExpiryState>>({});
  const selectedExpiryDays = selectedExpiry ? daysUntilExpiry(selectedExpiry) : null;
  const flowExpiries = useMemo(
    () => getFlowExpiries(selectedExpiry, availableExpiries, 3),
    [selectedExpiry, availableExpiries]
  );
  const chainStorageBase = useMemo(
    () => getChainStorageBase(symbol, selectedExpiry),
    [symbol, selectedExpiry]
  );
  const snapshotStorageKey = `${chainStorageBase}:snapshot`;

  // Refs for auto-scrolling to ATM strike
  const heatmapAtmRowRef = useRef<HTMLTableRowElement>(null);
  const butterflyAtmRowRef = useRef<HTMLDivElement>(null);
  const didInitialHeatmapScrollRef = useRef(false);
  const didInitialButterflyScrollRef = useRef(false);
  const latestLoadChainRequestRef = useRef(0);
  const parsedRef = useRef(parsed);
  const flowDataByExpiryRef = useRef(flowDataByExpiry);

  useEffect(() => {
    parsedRef.current = parsed;
  }, [parsed]);

  useEffect(() => {
    flowDataByExpiryRef.current = flowDataByExpiry;
  }, [flowDataByExpiry]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const expiries = getFlowExpiries(selectedExpiry, availableExpiries, 3);
    if (expiries.length === 0) {
      setFlowDataByExpiry({});
      parsedRef.current = { rows: [], spotPrice: null };
      return;
    }

    const restored: Record<number, FlowExpiryState> = {};
    expiries.forEach((expiry) => {
      const storageBase = getChainStorageBase(symbol, expiry);
      const storedFlow = readStoredFlowHistory(`${storageBase}:flow`);
      const storedSnapshot = readStoredChainSnapshot(`${storageBase}:snapshot`);
      restored[expiry] = {
        parsed: storedSnapshot ?? { rows: [], spotPrice: null },
        history: storedFlow
      };
    });
    setFlowDataByExpiry(restored);

    const selectedSnapshot = selectedExpiry ? restored[selectedExpiry]?.parsed : null;
    parsedRef.current = selectedSnapshot ?? { rows: [], spotPrice: null };
  }, [symbol, selectedExpiry, availableExpiries]);

  useEffect(() => {
    if (!symbol.trim() || !selectedExpiry || availableExpiries.length === 0 || parsed.rows.length === 0) {
      return;
    }

    const expiries = getFlowExpiries(selectedExpiry, availableExpiries, 3);
    const missing = expiries.filter((expiry) => !flowDataByExpiryRef.current[expiry]?.parsed?.rows?.length);
    if (missing.length === 0) return;

    let cancelled = false;
    const ticker = symbol.trim().toUpperCase();

    (async () => {
      const results = await Promise.allSettled(
        missing.map((expiry) => fetchYahooOptionChain(ticker, expiry))
      );
      if (cancelled) return;

      setFlowDataByExpiry((prev) => {
        const next = { ...prev };
        missing.forEach((expiry, idx) => {
          const result = results[idx];
          if (!result || result.status !== 'fulfilled') return;

          const chain = result.value;
          const expirySpot = chain.underlyingPrice ?? estimateSpotFromContracts(chain.contracts);
          const expiryNormalized = buildChainFromYahoo(chain.contracts, expirySpot);
          const storageBase = getChainStorageBase(ticker, expiry);
          const storedHistory = readStoredFlowHistory(`${storageBase}:flow`);

          writeStoredChainSnapshot(`${storageBase}:snapshot`, expiryNormalized);
          next[expiry] = {
            parsed: expiryNormalized,
            history: prev[expiry]?.history ?? storedHistory
          };
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [symbol, selectedExpiry, availableExpiries, parsed.rows.length]);

  // Debounce chart symbol updates to avoid reloading iframe on every keystroke.
  useEffect(() => {
    const normalized = symbol.trim().toUpperCase();
    const timer = setTimeout(() => {
      setDebouncedChartSymbol(normalized);
    }, 1000);
    return () => clearTimeout(timer);
  }, [symbol]);

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
      const expiriesToLoad = getFlowExpiries(selectedExpiry, availableExpiries, 3);
      const primaryExpiry = selectedExpiry ?? expiriesToLoad[0] ?? null;

      const [chainResults, mostActiveResult] = await Promise.all([
        Promise.allSettled(expiriesToLoad.map((expiry) => fetchYahooOptionChain(ticker, expiry))),
        fetchYahooMostActiveOptions(ticker)
      ]);

      if (requestId !== latestLoadChainRequestRef.current) {
        return;
      }

      const primaryIndex = primaryExpiry ? expiriesToLoad.indexOf(primaryExpiry) : 0;
      const primaryChainResult = chainResults[primaryIndex] ?? chainResults[0];
      if (!primaryChainResult || primaryChainResult.status !== 'fulfilled') {
        throw primaryChainResult?.status === 'rejected'
          ? primaryChainResult.reason
          : new Error('Failed to load Yahoo chain.');
      }

      const primaryChain = primaryChainResult.value;
      const detectedSpot =
        primaryChain.underlyingPrice ?? estimateSpotFromContracts(primaryChain.contracts);
      const normalized = buildChainFromYahoo(primaryChain.contracts, detectedSpot);

      const previousParsed =
        parsedRef.current.rows.length > 0
          ? parsedRef.current
          : readStoredChainSnapshot(snapshotStorageKey) ?? parsedRef.current;

      setFlowDataByExpiry((prev) => {
        const next = { ...prev };

        expiriesToLoad.forEach((expiry, idx) => {
          const result = chainResults[idx];
          if (!result || result.status !== 'fulfilled') return;

          const chain = result.value;
          const expirySpot = chain.underlyingPrice ?? estimateSpotFromContracts(chain.contracts);
          const expiryNormalized = buildChainFromYahoo(chain.contracts, expirySpot);
          const storageBase = getChainStorageBase(ticker, expiry);
          const isPrimary = expiry === primaryExpiry;

          const expiryPrevious =
            isPrimary && previousParsed.rows.length > 0
              ? previousParsed
              : next[expiry]?.parsed?.rows.length
                ? next[expiry].parsed
                : flowDataByExpiryRef.current[expiry]?.parsed?.rows.length
                  ? flowDataByExpiryRef.current[expiry].parsed
                  : readStoredChainSnapshot(`${storageBase}:snapshot`) ?? { rows: [], spotPrice: null };

          const prevHistory = filterVolumeFlowToToday(
            next[expiry]?.history ??
            flowDataByExpiryRef.current[expiry]?.history ??
            readStoredFlowHistory(`${storageBase}:flow`)
          );

          const flowUpdate = buildVolumeFlowUpdate(
            ticker,
            expiry,
            expiryNormalized,
            expiryPrevious,
            expirySpot
          );
          const nextHistory = flowUpdate
            ? [flowUpdate, ...prevHistory].slice(0, 25)
            : prevHistory;

          writeStoredFlowHistory(`${storageBase}:flow`, nextHistory);
          writeStoredChainSnapshot(`${storageBase}:snapshot`, expiryNormalized);
          next[expiry] = { parsed: expiryNormalized, history: nextHistory };
        });

        return next;
      });

      writeStoredChainSnapshot(snapshotStorageKey, normalized);

      if (previousParsed.rows.length > 0) {
        setDataHistory((prev) => {
          const newHistory = [previousParsed, ...prev].slice(0, 5);
          return newHistory;
        });
      }

      parsedRef.current = normalized;
      setParsed(normalized);
      setMostActiveRows(mostActiveResult);
      if ((!spotOverride || Number(spotOverride) <= 0) && detectedSpot && detectedSpot > 0) {
        setSpotOverride(detectedSpot.toFixed(2));
      }
      if (selectedExpiry) {
        setDaysToExpiry(daysUntilExpiry(selectedExpiry));
      }

      setLastUpdateTime(new Date());

      if (isRefresh) {
        setNextRefreshIn(300);
      }

      if (!isRefresh && !autoRefreshActive) {
        setAutoRefreshActive(true);
        setNextRefreshIn(300);
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

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const initialTimer = setTimeout(() => {
      loadChain(true);
      intervalId = setInterval(() => {
        loadChain(true);
      }, 5 * 60 * 1000);
    }, 5 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
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
    parsedRef.current = { rows: [], spotPrice: null };
    setDataHistory([]);
    setFlowDataByExpiry({});
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
            <button className={`nav-button ${activeDashboard === 'chainStructureYahoo' ? 'active' : ''}`} onClick={() => setActiveDashboard('chainStructureYahoo')}>Chain Structure (Yahoo)</button>
            <button className={`nav-button ${activeDashboard === 'yahooExpiryHighlights' ? 'active' : ''}`} onClick={() => setActiveDashboard('yahooExpiryHighlights')}>High Vol &amp; OI</button>
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
                  setParsed({ rows: [], spotPrice: null });
                  parsedRef.current = { rows: [], spotPrice: null };
                  setDataHistory([]);
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
            {debouncedChartSymbol && (
              <div className="tradingview-widget-container" style={{ height: '100%', width: '100%' }}>
                <iframe
                  src={`https://www.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=${encodeURIComponent(debouncedChartSymbol)}&interval=D&hidesidetoolbar=1&symboledit=1&saveimage=0&toolbarbg=0e1621&studies=[]&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en&utm_source=localhost&utm_medium=widget_new&utm_campaign=chart&utm_term=${encodeURIComponent(debouncedChartSymbol)}`}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title="TradingView Chart"
                />
              </div>
            )}
            {!debouncedChartSymbol && (
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
          Top row shows current volumes. Each update below shows only the change since the previous fetch (0 if unchanged).
          Showing selected expiry plus the next 2 available expiries. Flow history resets each calendar day.
        </p>

        {flowExpiries.length === 0 ? (
          <p className="yahoo-muted">
            Select an expiry and run analysis to load current volumes, then updates will accumulate per strike here.
          </p>
        ) : (
          <VolumeFlowGrid
            referenceSpot={effectiveSpot}
            columns={flowExpiries.map((expiry) => {
              const flowState = flowDataByExpiry[expiry];
              const columnSpot =
                flowState?.parsed.spotPrice ??
                (expiry === selectedExpiry ? effectiveSpot : null);
              return {
                expiry,
                expiryLabel: toExpiryLabel(expiry),
                chainRows: flowState?.parsed.rows ?? (expiry === selectedExpiry ? parsed.rows : []),
                volumeFlowHistory: flowState?.history ?? [],
                spot: columnSpot
              };
            })}
          />
        )}
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
