import React, { useMemo, useState } from 'react';
import { Activity, BarChart3, Loader2, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { fetchYahooMostActiveOptions, fetchYahooOptionChain, YahooMostActiveOptionRow } from '../utils/yahooOptions';

type DashboardType = 'options' | 'darkpool' | 'psychology' | 'yahoo' | 'activeInsights' | 'chainStructure' | 'chainStructureYahoo';

interface MostActiveOptionsInsightDashboardProps {
  activeDashboard: DashboardType;
  setActiveDashboard: (dashboard: DashboardType) => void;
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

function summarizeDirectionScore(rows: YahooMostActiveOptionRow[]) {
  const callVolume = rows
    .filter((row) => String(row.optionType).toUpperCase() === 'CALL')
    .reduce((sum, row) => sum + row.volume, 0);
  const putVolume = rows
    .filter((row) => String(row.optionType).toUpperCase() === 'PUT')
    .reduce((sum, row) => sum + row.volume, 0);
  const callOi = rows
    .filter((row) => String(row.optionType).toUpperCase() === 'CALL')
    .reduce((sum, row) => sum + row.openInterest, 0);
  const putOi = rows
    .filter((row) => String(row.optionType).toUpperCase() === 'PUT')
    .reduce((sum, row) => sum + row.openInterest, 0);

  const volumeBias = safeRatio(callVolume - putVolume, callVolume + putVolume);
  const oiBias = safeRatio(callOi - putOi, callOi + putOi);
  const directionScore = (volumeBias * 0.6) + (oiBias * 0.4);

  return {
    callVolume,
    putVolume,
    callOi,
    putOi,
    volumeBias,
    oiBias,
    directionScore
  };
}

function getDirectionLabel(score: number): 'Bullish' | 'Bearish' | 'Neutral' {
  if (score > 0.08) return 'Bullish';
  if (score < -0.08) return 'Bearish';
  return 'Neutral';
}

const MostActiveOptionsInsightDashboard: React.FC<MostActiveOptionsInsightDashboardProps> = ({
  activeDashboard,
  setActiveDashboard
}) => {
  const [symbol, setSymbol] = useState('NVDA');
  const [rows, setRows] = useState<YahooMostActiveOptionRow[]>([]);
  const [underlyingPrice, setUnderlyingPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);

  const analysis = useMemo(() => {
    const sortedByVolume = [...rows].sort((a, b) => b.volume - a.volume);
    const topByVolume = sortedByVolume.slice(0, 15);
    const scoreSummary = summarizeDirectionScore(topByVolume);
    const direction = getDirectionLabel(scoreSummary.directionScore);

    let expectedMove = 0;
    let expectedMovePct = 0;
    let gammaProxy = 0;
    let expectedUpPrice: number | null = null;
    let expectedDownPrice: number | null = null;

    if (underlyingPrice && topByVolume.length > 0) {
      const nowSec = Math.floor(Date.now() / 1000);
      const topNear = topByVolume.slice(0, 8);

      const moves = topNear.map((row) => {
        const dte = Math.max(1, (row.expiration - nowSec) / 86400);
        const t = dte / 365;
        const iv = row.impliedVolatility > 3 ? row.impliedVolatility / 100 : row.impliedVolatility;
        const move = underlyingPrice * Math.max(iv, 0.01) * Math.sqrt(t);
        return { row, dte, t, iv, move };
      });

      const weightedMove = moves.reduce((sum, m) => sum + (m.move * (m.row.volume + 1)), 0);
      const weightTotal = moves.reduce((sum, m) => sum + (m.row.volume + 1), 0);
      expectedMove = safeRatio(weightedMove, weightTotal);
      expectedMovePct = safeRatio(expectedMove, underlyingPrice) * 100;
      expectedUpPrice = underlyingPrice + expectedMove;
      expectedDownPrice = Math.max(0, underlyingPrice - expectedMove);

      gammaProxy = moves.reduce((sum, m) => {
        const moneyness = Math.abs(m.row.strike - underlyingPrice) / Math.max(underlyingPrice, 1);
        const distanceWeight = Math.max(0.15, 1 - (moneyness * 2));
        const contractSize = (m.row.openInterest + m.row.volume) * 100;
        const gammaUnit = (contractSize * distanceWeight * Math.max(m.iv, 0.01)) / (Math.max(underlyingPrice, 1) * Math.sqrt(Math.max(m.t, 1 / 365)));
        const sign = String(m.row.optionType).toUpperCase() === 'CALL' ? 1 : -1;
        return sum + (gammaUnit * sign);
      }, 0);
    }

    const suggestion = direction === 'Bullish'
      ? 'Calls have stronger participation. Bias favors upside continuation.'
      : direction === 'Bearish'
        ? 'Puts dominate activity. Bias favors downside pressure or hedging demand.'
        : 'Mixed flow. Consider neutral structures or wait for clearer directional confirmation.';

    const confidence = Math.min(95, Math.max(50, 50 + Math.abs(scoreSummary.directionScore) * 100));
    const clearMoveSuggestion = !underlyingPrice || expectedMove <= 0
      ? 'Insufficient data to estimate expected move.'
      : direction === 'Bullish'
        ? `Bias: UP by about $${expectedMove.toFixed(2)} (${expectedMovePct.toFixed(2)}%) toward ~${expectedUpPrice?.toFixed(2)}`
        : direction === 'Bearish'
          ? `Bias: DOWN by about $${expectedMove.toFixed(2)} (${expectedMovePct.toFixed(2)}%) toward ~${expectedDownPrice?.toFixed(2)}`
          : `Bias: SIDEWAYS / mixed, with expected move around ±$${expectedMove.toFixed(2)} (${expectedMovePct.toFixed(2)}%)`;

    return {
      topByVolume,
      scoreSummary,
      direction,
      expectedMove,
      expectedMovePct,
      expectedUpPrice,
      expectedDownPrice,
      gammaProxy,
      suggestion,
      confidence,
      clearMoveSuggestion
    };
  }, [rows, underlyingPrice]);

  const topVolumeChartItems = useMemo(
    () =>
      analysis.topByVolume.slice(0, 8).map((row) => {
        const contractSymbol = row.contractSymbol || '';
        
        // Find the C or P indicator - match C or P followed by 8 digits
        const cpMatch = contractSymbol.match(/([CP])(\d{8})/);
        const optionType: 'CALL' | 'PUT' = cpMatch && cpMatch[1] === 'C' ? 'CALL' : 'PUT';
        
        // Debug logging to see what's happening
        console.log('[MostActive Volume]', {
          contract: contractSymbol,
          cpMatch: cpMatch ? cpMatch[0] : null,
          letter: cpMatch ? cpMatch[1] : null,
          optionType
        });
        
        return {
          label: contractSymbol, // Show full contract symbol
          value: row.volume,
          optionType,
          contractSymbol
        };
      }),
    [analysis.topByVolume]
  );

  const topOiChartItems = useMemo(
    () =>
      [...analysis.topByVolume]
        .sort((a, b) => b.openInterest - a.openInterest)
        .slice(0, 8)
        .map((row) => {
          const contractSymbol = row.contractSymbol || '';
          
          // Find the C or P indicator - match C or P followed by 8 digits
          const cpMatch = contractSymbol.match(/([CP])(\d{8})/);
          const optionType: 'CALL' | 'PUT' = cpMatch && cpMatch[1] === 'C' ? 'CALL' : 'PUT';
          
          console.log('[MostActive OI]', {
            contract: contractSymbol,
            cpMatch: cpMatch ? cpMatch[0] : null,
            letter: cpMatch ? cpMatch[1] : null,
            optionType
          });
          
          return {
            label: contractSymbol, // Show full contract symbol
            value: row.openInterest,
            optionType,
            contractSymbol
          };
        }),
    [analysis.topByVolume]
  );

  const runAnalysis = async () => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) {
      setError('Please enter a stock ticker.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [mostActiveRows, chain] = await Promise.all([
        fetchYahooMostActiveOptions(normalized),
        fetchYahooOptionChain(normalized)
      ]);

      setRows(mostActiveRows);
      setUnderlyingPrice(chain.underlyingPrice);
      setLastRunAt(new Date());

      if (mostActiveRows.length === 0) {
        setError(`No Yahoo most-active option rows found for ${normalized} right now.`);
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Failed to run most-active option analysis');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="options-dashboard yahoo-options-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Most Active Option Insight</h1>
          <div className="header-stats">
            <span className="header-stat">{rows.length.toLocaleString()} contracts</span>
            {underlyingPrice !== null && (
              <>
                <span className="stat-separator">•</span>
                <span className="header-stat">Spot: ${underlyingPrice.toFixed(2)}</span>
              </>
            )}
            {lastRunAt && (
              <>
                <span className="stat-separator">•</span>
                <span className="header-stat">Updated: {lastRunAt.toLocaleTimeString()}</span>
              </>
            )}
          </div>
        </div>
        <div className="header-right">
          <div className="nav-buttons">
            <button className={`nav-button ${activeDashboard === 'yahoo' ? 'active' : ''}`} onClick={() => setActiveDashboard('yahoo')}>Yahoo Options</button>
            <button className={`nav-button ${activeDashboard === 'activeInsights' ? 'active' : ''}`} onClick={() => setActiveDashboard('activeInsights')}>Most Active Options</button>
            <button className={`nav-button ${activeDashboard === 'chainStructureYahoo' ? 'active' : ''}`} onClick={() => setActiveDashboard('chainStructureYahoo')}>Chain Structure (Yahoo)</button>
          </div>
        </div>
      </header>

      <section className="yahoo-controls">
        <div className="yahoo-filter-panel">
          <label htmlFor="insight-symbol">Stock Symbol</label>
          <input
            id="insight-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="search-input"
            style={{ maxWidth: 220 }}
          />
          <button className="refresh-button-compact" onClick={runAnalysis} disabled={loading}>
            {loading ? <Loader2 className="refresh-icon spinning" /> : <RefreshCw className="refresh-icon" />}
            Analyze Most Active Flow
          </button>
        </div>
      </section>

      {error && <p className="yahoo-error">{error}</p>}

      <section className="yahoo-chart-grid">
        <div className="yahoo-chart-card">
          <h4>Directional Insight</h4>
          <p className="yahoo-muted" style={{ fontSize: '1rem', color: '#dbeafe' }}>
            <strong>{analysis.clearMoveSuggestion}</strong>
          </p>
          <p className="yahoo-muted">
            Confidence: <strong>{analysis.confidence.toFixed(0)}%</strong>
          </p>
          <p className="insight-direction">
            {analysis.direction === 'Bullish' ? <TrendingUp size={18} /> : analysis.direction === 'Bearish' ? <TrendingDown size={18} /> : <Activity size={18} />}
            <strong>{analysis.direction}</strong>
          </p>
          <p className="yahoo-muted">{analysis.suggestion}</p>
          <p className="yahoo-muted">Call Vol: {analysis.scoreSummary.callVolume.toLocaleString()} | Put Vol: {analysis.scoreSummary.putVolume.toLocaleString()}</p>
          <p className="yahoo-muted">Call OI: {analysis.scoreSummary.callOi.toLocaleString()} | Put OI: {analysis.scoreSummary.putOi.toLocaleString()}</p>
        </div>

        <div className="yahoo-chart-card">
          <h4>Expected Move & Gamma Proxy</h4>
          <p className="yahoo-muted">Expected Move (weighted): <strong>${analysis.expectedMove.toFixed(2)}</strong> ({analysis.expectedMovePct.toFixed(2)}%)</p>
          <p className="yahoo-muted">Net Gamma Exposure Proxy: <strong>{analysis.gammaProxy.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></p>
          <p className="yahoo-muted">
            {analysis.gammaProxy >= 0
              ? 'Positive gamma proxy: market likely stabilizes around high OI strikes.'
              : 'Negative gamma proxy: risk of amplified directional swings near key strikes.'}
          </p>
        </div>

        <InsightBarList title="Most Active Contracts by Volume" items={topVolumeChartItems} />
        <InsightBarList title="Most Active Contracts by Open Interest" items={topOiChartItems} />
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
              {analysis.topByVolume.map((row) => (
                <tr key={row.contractSymbol}>
                  <td>{row.contractSymbol}</td>
                  <td className={String(row.optionType).toUpperCase() === 'CALL' ? 'yahoo-call' : 'yahoo-put'}>
                    {String(row.optionType).toUpperCase()}
                  </td>
                  <td>{row.strike.toFixed(2)}</td>
                  <td>{new Date(row.expiration * 1000).toLocaleDateString()}</td>
                  <td>{row.volume.toLocaleString()}</td>
                  <td>{row.openInterest.toLocaleString()}</td>
                  <td>{(row.impliedVolatility * 100).toFixed(2)}%</td>
                  <td>{row.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default MostActiveOptionsInsightDashboard;
