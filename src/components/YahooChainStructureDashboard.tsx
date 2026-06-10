import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { fetchYahooMostActiveOptions, fetchYahooOptionChain, YahooMostActiveOptionRow } from '../utils/yahooOptions';

type DashboardType = 'options' | 'darkpool' | 'psychology' | 'yahoo' | 'chainStructure' | 'chainStructureYahoo';

interface YahooChainStructureDashboardProps {
  activeDashboard: DashboardType;
  setActiveDashboard: (dashboard: DashboardType) => void;
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

const InsightBarList: React.FC<{
  title: string;
  items: Array<{ label: string; value: number; optionType: 'CALL' | 'PUT' }>;
}> = ({ title, items }) => {
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
              <div key={item.label} className="yahoo-bar-row">
                <div className="yahoo-bar-label">{item.label}</div>
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
  const [availableExpiries, setAvailableExpiries] = useState<number[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<number | null>(null);
  const [loadingExpiries, setLoadingExpiries] = useState(false);
  const [loadingChain, setLoadingChain] = useState(false);
  const [error, setError] = useState('');
  const [mostActiveRows, setMostActiveRows] = useState<YahooMostActiveOptionRow[]>([]);
  const [selectedButterflyCell, setSelectedButterflyCell] = useState<SelectedButterflyCell | null>(null);
  const selectedExpiryDays = selectedExpiry ? daysUntilExpiry(selectedExpiry) : null;

  const mostActiveTopByVolume = useMemo(
    () => [...mostActiveRows].sort((a, b) => b.volume - a.volume).slice(0, 15),
    [mostActiveRows]
  );
  const mostActiveVolumeItems = useMemo(
    () =>
      mostActiveTopByVolume.slice(0, 8).map((row) => ({
        label: `${row.contractSymbol.slice(0, 14)}...`,
        value: row.volume,
        optionType: String(row.optionType).toUpperCase() === 'CALL' ? 'CALL' as const : 'PUT' as const
      })),
    [mostActiveTopByVolume]
  );
  const mostActiveOiItems = useMemo(
    () =>
      [...mostActiveTopByVolume]
        .sort((a, b) => b.openInterest - a.openInterest)
        .slice(0, 8)
        .map((row) => ({
          label: `${row.contractSymbol.slice(0, 14)}...`,
          value: row.openInterest,
          optionType: String(row.optionType).toUpperCase() === 'CALL' ? 'CALL' as const : 'PUT' as const
        })),
    [mostActiveTopByVolume]
  );

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
        direction: 'Neutral',
        confidence: 50,
        suggestion: 'Load a Yahoo option chain to generate signal.'
      };
    }

    const callWall = rows.reduce((best, r) => (r.callOi > best.callOi ? r : best), rows[0]).strike;
    const putWall = rows.reduce((best, r) => (r.putOi > best.putOi ? r : best), rows[0]).strike;
    const totalCallVol = rows.reduce((s, r) => s + r.callVolume, 0);
    const totalPutVol = rows.reduce((s, r) => s + r.putVolume, 0);
    const totalCallOi = rows.reduce((s, r) => s + r.callOi, 0);
    const totalPutOi = rows.reduce((s, r) => s + r.putOi, 0);
    const volBias = safeRatio(totalCallVol - totalPutVol, totalCallVol + totalPutVol);
    const oiBias = safeRatio(totalCallOi - totalPutOi, totalCallOi + totalPutOi);

    const spot = effectiveSpot || rows[Math.floor(rows.length / 2)].strike;
    const nearest = rows.reduce((best, r) =>
      Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best, rows[0]);
    const atmIv = ((nearest.callIv + nearest.putIv) / 2) / 100;
    const expectedMove = spot * Math.max(0.01, atmIv) * Math.sqrt(Math.max(1, daysToExpiry) / 365);
    const expectedMovePct = safeRatio(expectedMove, spot) * 100;

    const gammaProxy = rows.reduce((sum, r) => {
      const distance = Math.abs(r.strike - spot) / Math.max(spot, 1);
      const distanceWeight = Math.max(0.1, 1 - distance * 2);
      return sum + ((r.callOi * (r.callIv / 100)) - (r.putOi * (r.putIv / 100))) * distanceWeight;
    }, 0);

    const score = (volBias * 0.45) + (oiBias * 0.35) + Math.tanh(gammaProxy / 1_000_000) * 0.2;
    const direction = score > 0.08 ? 'Up' : score < -0.08 ? 'Down' : 'Neutral';
    const confidence = Math.min(95, Math.max(50, 50 + Math.abs(score) * 140));
    const targetUp = spot + expectedMove;
    const targetDown = Math.max(0, spot - expectedMove);
    const suggestion = direction === 'Up'
      ? `Higher-probability bias: UP toward ~$${targetUp.toFixed(2)} (+${expectedMovePct.toFixed(2)}%). Prefer bullish structures near ${spot.toFixed(2)} with call-wall at ${callWall}.`
      : direction === 'Down'
        ? `Higher-probability bias: DOWN toward ~$${targetDown.toFixed(2)} (-${expectedMovePct.toFixed(2)}%). Prefer bearish structures with put-wall at ${putWall}.`
        : `Neutral / range likely. Expected move ±$${expectedMove.toFixed(2)} (${expectedMovePct.toFixed(2)}%). Trade around ${putWall}-${callWall}.`;

    return { callWall, putWall, expectedMove, expectedMovePct, direction, confidence, suggestion };
  }, [daysToExpiry, effectiveSpot, parsed.rows]);

  const visibleRows = useMemo(() => {
    if (parsed.rows.length <= 30) return parsed.rows;
    const spot = effectiveSpot ?? parsed.rows[Math.floor(parsed.rows.length / 2)].strike;
    return [...parsed.rows]
      .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
      .slice(0, 30)
      .sort((a, b) => a.strike - b.strike);
  }, [parsed.rows, effectiveSpot]);

  const maxOi = Math.max(1, ...visibleRows.map((r) => Math.max(r.callOi, r.putOi)));
  const maxVol = Math.max(1, ...visibleRows.map((r) => Math.max(r.callVolume, r.putVolume)));

  const moveBarMax = useMemo(() => Math.max(1, stats.expectedMove), [stats.expectedMove]);
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

    if (stats.direction === 'Up' || stats.direction === 'Down') {
      const side: 'CALL' | 'PUT' = stats.direction === 'Up' ? 'CALL' : 'PUT';
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

  const [butterflySide, setButterflySide] = useState<'BOTH' | 'CALL' | 'PUT'>('BOTH');
  const butterflyWidths = [5, 10, 15, 20, 25, 30];
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
    const windowRows = parsed.rows.slice(Math.max(0, centerIndex - 12), Math.min(parsed.rows.length, centerIndex + 13));

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

  const loadChain = async () => {
    const ticker = symbol.trim().toUpperCase();
    if (!ticker) {
      setError('Enter a symbol first.');
      return;
    }
    setLoadingChain(true);
    setError('');
    try {
      const [chainResult, mostActiveResult] = await Promise.allSettled([
        fetchYahooOptionChain(ticker, selectedExpiry || undefined),
        fetchYahooMostActiveOptions(ticker)
      ]);
      if (chainResult.status !== 'fulfilled') {
        throw chainResult.reason;
      }
      const chain = chainResult.value;
      const detectedSpot = chain.underlyingPrice ?? estimateSpotFromContracts(chain.contracts);
      const normalized = buildChainFromYahoo(chain.contracts, detectedSpot);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Yahoo chain.');
    } finally {
      setLoadingChain(false);
    }
  };

  const handleSymbolChange = (nextRawSymbol: string) => {
    const nextSymbol = nextRawSymbol.toUpperCase();
    setSymbol(nextSymbol);
    setAvailableExpiries([]);
    setSelectedExpiry(null);
    setParsed({ rows: [], spotPrice: null });
    setMostActiveRows([]);
    setSpotOverride('');
    setDaysToExpiry(7);
    setSelectedButterflyCell(null);
    setError('');
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
              <button className="refresh-button-compact" onClick={loadChain} disabled={loadingChain}>
                <RefreshCw className={`refresh-icon ${loadingChain ? 'spinning' : ''}`} />
                {loadingChain ? 'Loading chain...' : 'Build From Yahoo'}
              </button>
            </div>
          </div>
        </div>
        <div className="yahoo-filter-panel chain-decision-panel">
          <h4>Decision Snapshot</h4>
          <p className="yahoo-muted">Detected spot from Yahoo: <strong>{parsed.spotPrice ? `$${parsed.spotPrice.toFixed(2)}` : '-'}</strong></p>
          <p className="yahoo-muted">Expected Move: <strong>±${stats.expectedMove.toFixed(2)}</strong> ({stats.expectedMovePct.toFixed(2)}%)</p>
          <p className="yahoo-muted">Bias: <strong>{stats.direction}</strong> | Confidence: <strong>{stats.confidence.toFixed(0)}%</strong></p>
          <p className="yahoo-muted">Call Wall: <strong>{stats.callWall || '-'}</strong> | Put Wall: <strong>{stats.putWall || '-'}</strong></p>
          <p className="yahoo-muted">{stats.suggestion}</p>
          {error && <p className="chain-inline-error">{error}</p>}
        </div>
      </section>

      <section className="yahoo-chart-grid chain-structure-grid">
        <div className="yahoo-chart-card">
          <h4>Expected Move Bands</h4>
          <p className="yahoo-muted">Expected Move: ±${stats.expectedMove.toFixed(2)} ({stats.expectedMovePct.toFixed(2)}%)</p>
          {effectiveSpot && (
            <p className="yahoo-muted">
              Down: ${(effectiveSpot - stats.expectedMove).toFixed(2)} | Spot: ${effectiveSpot.toFixed(2)} | Up: ${(effectiveSpot + stats.expectedMove).toFixed(2)}
            </p>
          )}
          <p className="yahoo-muted">Call Wall: {stats.callWall || '-'} | Put Wall: {stats.putWall || '-'}</p>
          {effectiveSpot ? (
            <>
              <div className="chain-move-bar-chart">
                <div className="chain-move-bar-row">
                  <span className="chain-move-label">Downside Move</span>
                  <div className="chain-move-track">
                    <div className="chain-move-fill downside" style={{ width: `${(stats.expectedMove / moveBarMax) * 100}%` }} />
                  </div>
                  <span className="chain-move-value">-${stats.expectedMove.toFixed(2)}</span>
                </div>
                <div className="chain-move-bar-row">
                  <span className="chain-move-label">Upside Move</span>
                  <div className="chain-move-track">
                    <div className="chain-move-fill upside" style={{ width: `${(stats.expectedMove / moveBarMax) * 100}%` }} />
                  </div>
                  <span className="chain-move-value">+{stats.expectedMove.toFixed(2)}</span>
                </div>
              </div>

              <div className="chain-candle-chart">
                <div className="chain-candle-title">Expected Move Candle</div>
                <div className="chain-candle-range">
                  <div className="chain-candle-line" />
                  <div className="chain-candle-marker downside" style={{ left: '10%' }}>
                    <span>${downTarget.toFixed(2)}</span>
                  </div>
                  <div className="chain-candle-marker spot" style={{ left: '50%' }}>
                    <span>${effectiveSpot.toFixed(2)}</span>
                  </div>
                  <div className="chain-candle-marker upside" style={{ left: '90%' }}>
                    <span>${upTarget.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="yahoo-chart-card">
          <h4>Volume/OI Heatmap (by strike)</h4>
          <div className="yahoo-table-wrapper">
            <table className="yahoo-table">
              <thead>
                <tr>
                  <th>Strike</th>
                  <th>Call Vol</th>
                  <th>Call OI</th>
                  <th>Put Vol</th>
                  <th>Put OI</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const cv = r.callVolume / maxVol;
                  const co = r.callOi / maxOi;
                  const pv = r.putVolume / maxVol;
                  const po = r.putOi / maxOi;
                  return (
                    <tr key={`hm-${r.strike}`}>
                      <td>{r.strike}</td>
                      <td style={{ background: `rgba(34,197,94,${0.1 + cv * 0.7})` }}>{r.callVolume.toLocaleString()}</td>
                      <td style={{ background: `rgba(34,197,94,${0.1 + co * 0.7})` }}>{r.callOi.toLocaleString()}</td>
                      <td style={{ background: `rgba(239,68,68,${0.1 + pv * 0.7})` }}>{r.putVolume.toLocaleString()}</td>
                      <td style={{ background: `rgba(239,68,68,${0.1 + po * 0.7})` }}>{r.putOi.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="yahoo-table-section">
        <div className="yahoo-table-title">
          <BarChart3 size={18} />
          <h3>Delta-based Trade Tuning</h3>
        </div>
        <p className="yahoo-muted chain-delta-note">
          Estimated deltas use spot, IV, and DTE as a guide. Use these presets to tune strike aggressiveness.
        </p>
        <div className="yahoo-table-wrapper">
          <table className="yahoo-table">
            <thead>
              <tr>
                <th>Preset</th>
                <th>Side</th>
                <th>Suggested Strike</th>
                <th>Estimated Delta</th>
                <th>Rationale</th>
              </tr>
            </thead>
            <tbody>
              {deltaPresets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="chain-delta-empty">Load Yahoo chain data and set spot to generate delta presets.</td>
                </tr>
              ) : (
                deltaPresets.map((row) => (
                  <tr key={`${row.preset}-${row.side}`}>
                    <td>{row.preset}</td>
                    <td>{row.side}</td>
                    <td>{row.strike}</td>
                    <td>{row.estDelta}</td>
                    <td>{row.note}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
                butterflyModel.heatmapRows.map((row) => (
                  <div key={`hm-row-${row.middleStrike}`} className="butterfly-heatmap-row">
                    <span className="butterfly-strike">{row.middleStrike.toFixed(0)}</span>
                    {butterflyWidths.map((width) => {
                      const val = row.values[width];
                      const isSelected = selectedButterflyCell?.middleStrike === row.middleStrike && selectedButterflyCell?.width === width;
                      const heatScore = row.heatScores[width];
                      const intensity = heatScore != null && butterflyModel.maxCellValue > 0
                        ? Math.min(1, heatScore / butterflyModel.maxCellValue)
                        : 0;
                      const r = Math.round(5 + (34 - 5) * intensity);
                      const g = Math.round(8 + (197 - 8) * intensity);
                      const b = Math.round(15 + (94 - 15) * intensity);
                      const bg = val == null
                        ? 'rgba(30,41,59,0.45)'
                        : `rgb(${r}, ${g}, ${b})`;
                      return (
                        <button
                          key={`hm-cell-${row.middleStrike}-${width}`}
                          className={`butterfly-cell ${isSelected ? 'selected' : ''}`}
                          style={{ background: bg }}
                          disabled={val == null}
                          onClick={() => setSelectedButterflyCell({ middleStrike: row.middleStrike, width })}
                        >
                          {val == null ? '-' : val.toFixed(2)}
                        </button>
                      );
                    })}
                  </div>
                ))
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

      <section className="yahoo-table-section">
        <div className="yahoo-table-title">
          <BarChart3 size={18} />
          <h3>OI by Strike (Call vs Put)</h3>
        </div>
        <div className="yahoo-table-wrapper">
          <table className="yahoo-table">
            <thead>
              <tr>
                <th>Strike</th>
                <th>Call OI</th>
                <th>Put OI</th>
                <th>Call Volume</th>
                <th>Put Volume</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={`row-${r.strike}`}>
                  <td>{r.strike.toFixed(2)}</td>
                  <td className={r.strike === stats.callWall ? 'yahoo-call' : ''}>{r.callOi.toLocaleString()}</td>
                  <td className={r.strike === stats.putWall ? 'yahoo-put' : ''}>{r.putOi.toLocaleString()}</td>
                  <td>{r.callVolume.toLocaleString()}</td>
                  <td>{r.putVolume.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="yahoo-chart-grid">
        <InsightBarList title="Most Active Contracts by Volume" items={mostActiveVolumeItems} />
        <InsightBarList title="Most Active Contracts by Open Interest" items={mostActiveOiItems} />
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
                mostActiveTopByVolume.map((row) => (
                  <tr key={row.contractSymbol}>
                    <td>{row.contractSymbol}</td>
                    <td className={String(row.optionType).toUpperCase() === 'CALL' ? 'yahoo-call' : 'yahoo-put'}>
                      {String(row.optionType).toUpperCase()}
                    </td>
                    <td>{row.strike.toFixed(2)}</td>
                    <td>{new Date(row.expiration * 1000).toLocaleDateString()}</td>
                    <td>{row.volume.toLocaleString()}</td>
                    <td>{row.openInterest.toLocaleString()}</td>
                    <td>{(row.impliedVolatility > 3 ? row.impliedVolatility : row.impliedVolatility * 100).toFixed(2)}%</td>
                    <td>{row.price.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default YahooChainStructureDashboard;
