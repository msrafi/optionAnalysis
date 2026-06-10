import React, { useMemo, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';

type DashboardType = 'options' | 'darkpool' | 'psychology' | 'yahoo' | 'chainStructure' | 'chainStructureYahoo';

interface OptionChainStructureDashboardProps {
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

function toNum(input: string): number {
  const clean = input
    .replace(/[$,%]/g, '')
    .replace(/,/g, '')
    .trim();
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') {
    return line.split('\t');
  }
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ',' && !inQuotes) {
      out.push(current);
      current = '';
    } else current += c;
  }
  out.push(current);
  return out;
}

function findClosestIndex(indices: number[], pivot: number, preferLeft: boolean): number {
  if (indices.length === 0) return -1;
  const filtered = preferLeft ? indices.filter((i) => i < pivot) : indices.filter((i) => i > pivot);
  if (filtered.length === 0) return -1;
  return preferLeft ? Math.max(...filtered) : Math.min(...filtered);
}

function parseChainCsv(rawInput: string): ParsedChainData {
  const text = rawInput.trim();
  if (!text) return { rows: [], spotPrice: null };

  const spotMatch = text.match(/([A-Z]{1,6})\s*:\s*([0-9]+(?:\.[0-9]+)?)/);
  const spotPrice = spotMatch ? toNum(spotMatch[2]) : null;

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return { rows: [], spotPrice };

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const header = splitLine(lines[0], delimiter).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));

  const strikeIndex = header.findIndex((h) => h.includes('strike'));
  if (strikeIndex === -1) return { rows: [], spotPrice };

  const volumeIdxs = header.map((h, i) => (h.includes('volume') ? i : -1)).filter((i) => i >= 0);
  const oiIdxs = header.map((h, i) => (h.includes('openint') || h.includes('openinterest') ? i : -1)).filter((i) => i >= 0);
  const ivIdxs = header.map((h, i) => (h.includes('implvol') || h.includes('impliedvolatility') || h === 'iv' ? i : -1)).filter((i) => i >= 0);
  const lastIdxs = header.map((h, i) => (h === 'last' || h.includes('lastprice') ? i : -1)).filter((i) => i >= 0);

  const callVolumeIndex = findClosestIndex(volumeIdxs, strikeIndex, true);
  const putVolumeIndex = findClosestIndex(volumeIdxs, strikeIndex, false);
  const callOiIndex = findClosestIndex(oiIdxs, strikeIndex, true);
  const putOiIndex = findClosestIndex(oiIdxs, strikeIndex, false);
  const callIvIndex = findClosestIndex(ivIdxs, strikeIndex, true);
  const putIvIndex = findClosestIndex(ivIdxs, strikeIndex, false);
  const callLastIndex = findClosestIndex(lastIdxs, strikeIndex, true);
  const putLastIndex = findClosestIndex(lastIdxs, strikeIndex, false);

  const rows: ChainRow[] = [];
  lines.slice(1).forEach((line) => {
    const cells = splitLine(line, delimiter);
    const strike = toNum(cells[strikeIndex] || '');
    if (strike <= 0) return;
    rows.push({
      strike,
      callVolume: callVolumeIndex >= 0 ? toNum(cells[callVolumeIndex] || '') : 0,
      callOi: callOiIndex >= 0 ? toNum(cells[callOiIndex] || '') : 0,
      callIv: callIvIndex >= 0 ? toNum(cells[callIvIndex] || '') : 0,
      putVolume: putVolumeIndex >= 0 ? toNum(cells[putVolumeIndex] || '') : 0,
      putOi: putOiIndex >= 0 ? toNum(cells[putOiIndex] || '') : 0,
      putIv: putIvIndex >= 0 ? toNum(cells[putIvIndex] || '') : 0,
      callLast: callLastIndex >= 0 ? toNum(cells[callLastIndex] || '') : 0,
      putLast: putLastIndex >= 0 ? toNum(cells[putLastIndex] || '') : 0
    });
  });

  rows.sort((a, b) => a.strike - b.strike);
  return { rows, spotPrice };
}

const OptionChainStructureDashboard: React.FC<OptionChainStructureDashboardProps> = ({
  activeDashboard,
  setActiveDashboard
}) => {
  const [csvInput, setCsvInput] = useState('');
  const [daysToExpiry, setDaysToExpiry] = useState(7);
  const [spotOverride, setSpotOverride] = useState('');
  const [parsed, setParsed] = useState<ParsedChainData>({ rows: [], spotPrice: null });

  const effectiveSpot = useMemo(() => {
    const overrideNum = toNum(spotOverride);
    if (overrideNum > 0) return overrideNum;
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
        suggestion: 'Paste chain CSV to generate signal.'
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

  const parseNow = () => setParsed(parseChainCsv(csvInput));
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
        callIv,
        putIv,
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
          return {
            preset,
            side,
            strike: '-',
            estDelta: '-',
            note: 'Not enough contracts to estimate a strike.'
          };
        }
        used.add(picked.row.strike);
        const confidenceNote = side === 'CALL' ? 'bullish participation' : 'bearish participation';
        return {
          preset,
          side,
          strike: picked.row.strike.toFixed(2),
          estDelta: Math.abs(picked.delta).toFixed(2),
          note: `Closest to ${target.toFixed(2)} delta with better liquidity for ${confidenceNote}.`
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

  return (
    <div className="options-dashboard yahoo-options-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Option Chain Structure Dashboard</h1>
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
        <div className="yahoo-symbols-panel">
          <label htmlFor="chain-csv">Paste Chain CSV / tabular values</label>
          <textarea
            id="chain-csv"
            rows={8}
            value={csvInput}
            onChange={(e) => setCsvInput(e.target.value)}
            placeholder="Paste copied option chain table here..."
          />
        </div>
        <div className="yahoo-filter-panel">
          <label htmlFor="spot-override">Spot Price (optional override)</label>
          <input id="spot-override" value={spotOverride} onChange={(e) => setSpotOverride(e.target.value)} className="search-input" />
          <label htmlFor="dte-input">Days to Expiry (for expected move)</label>
          <input id="dte-input" type="number" min={1} value={daysToExpiry} onChange={(e) => setDaysToExpiry(Number(e.target.value) || 7)} className="search-input" />
          <button className="refresh-button-compact" onClick={parseNow}>
            <RefreshCw className="refresh-icon" />
            Parse & Build Dashboard
          </button>
          <p className="yahoo-muted">{stats.suggestion}</p>
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
                    <div
                      className="chain-move-fill downside"
                      style={{ width: `${(stats.expectedMove / moveBarMax) * 100}%` }}
                    />
                  </div>
                  <span className="chain-move-value">-${stats.expectedMove.toFixed(2)}</span>
                </div>
                <div className="chain-move-bar-row">
                  <span className="chain-move-label">Upside Move</span>
                  <div className="chain-move-track">
                    <div
                      className="chain-move-fill upside"
                      style={{ width: `${(stats.expectedMove / moveBarMax) * 100}%` }}
                    />
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
                  <td colSpan={5} className="chain-delta-empty">Parse chain data and set spot to generate delta presets.</td>
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
    </div>
  );
};

export default OptionChainStructureDashboard;
