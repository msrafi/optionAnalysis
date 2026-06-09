import React, { useMemo, useState } from 'react';
import { BarChart3, Loader2, RefreshCw, Search } from 'lucide-react';
import {
  fetchYahooOptionChain,
  parseSymbolsInput,
  YahooOptionContract
} from '../utils/yahooOptions';

type DashboardType = 'options' | 'darkpool' | 'psychology' | 'yahoo' | 'activeInsights' | 'chainStructure' | 'chainStructureYahoo';

interface YahooOptionsDashboardProps {
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

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx] || 0;
}

const BarList: React.FC<{
  title: string;
  items: Array<{ label: string; value: number; optionType: 'Call' | 'Put' }>;
}> = ({ title, items }) => {
  const max = Math.max(...items.map((item) => item.value), 0);
  return (
    <div className="yahoo-chart-card">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="yahoo-muted">No data for this chart.</p>
      ) : (
        <div className="yahoo-bar-list">
          {items.map((item) => {
            const width = max > 0 ? (item.value / max) * 100 : 0;
            return (
              <div key={item.label} className="yahoo-bar-row">
                <div className="yahoo-bar-label">{item.label}</div>
                <div className="yahoo-bar-track">
                  <div
                    className={`yahoo-bar-fill ${item.optionType === 'Call' ? 'call' : 'put'}`}
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

const YahooOptionsDashboard: React.FC<YahooOptionsDashboardProps> = ({ activeDashboard, setActiveDashboard }) => {
  const [symbolsInput, setSymbolsInput] = useState('ASTS\nNVDA\nPLTR');
  const [availableExpiries, setAvailableExpiries] = useState<number[]>([]);
  const [symbolExpiriesMap, setSymbolExpiriesMap] = useState<Record<string, number[]>>({});
  const [selectedWeekKey, setSelectedWeekKey] = useState<string>('');
  const [visibleExpiryMonths, setVisibleExpiryMonths] = useState(1);
  const [contracts, setContracts] = useState<YahooOptionContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingExpiries, setLoadingExpiries] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highVolumeOnly, setHighVolumeOnly] = useState(false);
  const [highOpenInterestOnly, setHighOpenInterestOnly] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);

  const symbols = useMemo(() => parseSymbolsInput(symbolsInput), [symbolsInput]);

  const getUtcDayDate = (epochSeconds: number) => {
    const d = new Date(epochSeconds * 1000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  };

  const getWeekStart = (date: Date) => {
    const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = normalized.getUTCDay(); // Sunday = 0
    const offset = day === 0 ? -6 : 1 - day; // Monday-based week
    normalized.setUTCDate(normalized.getUTCDate() + offset);
    return normalized;
  };

  const formatWeekKey = (date: Date) => {
    const start = getWeekStart(date);
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  };

  const addUtcMonths = (date: Date, months: number) => {
    const cloned = new Date(date.getTime());
    cloned.setUTCMonth(cloned.getUTCMonth() + months);
    return cloned;
  };

  const formatUtcExpiry = (epochSeconds: number) =>
    new Date(epochSeconds * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC' });

  const weeklyExpiryOptions = useMemo(() => {
    const bucket = new Map<string, {
      key: string;
      start: number;
      end: number;
      label: string;
      expiries: number[];
      tickerDetails: string[];
      tickersWithExpiry: string[];
    }>();

    availableExpiries.forEach((expiry) => {
      const date = getUtcDayDate(expiry);
      const key = formatWeekKey(date);
      const weekStart = getWeekStart(date);
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

      if (!bucket.has(key)) {
        const label = `${weekStart.toLocaleDateString('en-GB', { timeZone: 'UTC' })} - ${weekEnd.toLocaleDateString('en-GB', { timeZone: 'UTC' })}`;
        bucket.set(key, {
          key,
          start: Math.floor(weekStart.getTime() / 1000),
          end: Math.floor(weekEnd.getTime() / 1000),
          label,
          expiries: [],
          tickerDetails: [],
          tickersWithExpiry: []
        });
      }

      bucket.get(key)!.expiries.push(expiry);
    });

    const options = Array.from(bucket.values()).sort((a, b) => a.start - b.start);
    options.forEach((option) => {
      const details: string[] = [];
      const presentTickers: string[] = [];
      symbols.forEach((symbol) => {
        const symbolExpiries = (symbolExpiriesMap[symbol] || []).filter(
          (expiry) => expiry >= option.start && expiry <= option.end
        );
        if (symbolExpiries.length > 0) {
          presentTickers.push(symbol);
          details.push(`${symbol}: ${symbolExpiries.map((expiry) => formatUtcExpiry(expiry)).join(', ')}`);
        } else {
          details.push(`${symbol}: -`);
        }
      });
      option.tickerDetails = details;
      option.tickersWithExpiry = presentTickers;
    });

    return options;
  }, [availableExpiries, symbolExpiriesMap, symbols]);

  const visibleWeeklyExpiryOptions = useMemo(() => {
    if (weeklyExpiryOptions.length === 0) return [];
    const baseStart = new Date(weeklyExpiryOptions[0].start * 1000);
    const windowEnd = addUtcMonths(baseStart, visibleExpiryMonths);
    const windowEndEpoch = Math.floor(windowEnd.getTime() / 1000);
    return weeklyExpiryOptions.filter((option) => option.start < windowEndEpoch);
  }, [weeklyExpiryOptions, visibleExpiryMonths]);

  const hasMoreExpiryWeeks = visibleWeeklyExpiryOptions.length < weeklyExpiryOptions.length;

  const selectedWeek = useMemo(
    () => weeklyExpiryOptions.find((option) => option.key === selectedWeekKey) || null,
    [weeklyExpiryOptions, selectedWeekKey]
  );

  const fetchSymbolChainForWeekSelection = async (
    symbol: string,
    weekSelection: { start: number; end: number } | null
  ) => {
    const base = await fetchYahooOptionChain(symbol);

    if (!weekSelection) {
      return base;
    }

    if (base.expirations.length === 0) {
      return base;
    }

    const inWeek = base.expirations.filter(
      (expiry) => expiry >= weekSelection.start && expiry <= weekSelection.end
    );

    if (inWeek.length > 0) {
      return fetchYahooOptionChain(symbol, inWeek[0]);
    }

    // Fallback: choose expiry closest to the selected week start so symbols remain comparable.
    const nearest = base.expirations.reduce((closest, current) =>
      Math.abs(current - weekSelection.start) < Math.abs(closest - weekSelection.start) ? current : closest,
      base.expirations[0]
    );

    return fetchYahooOptionChain(symbol, nearest);
  };

  const loadExpiries = async () => {
    try {
      setLoadingExpiries(true);
      setError(null);

      const responses = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const result = await fetchYahooOptionChain(symbol);
            return { symbol, result };
          } catch {
            return null;
          }
        })
      );

      const expirySet = new Set<number>();
      const nextSymbolExpiriesMap: Record<string, number[]> = {};
      responses.forEach((result) => {
        if (!result) return;
        result.result.expirations.forEach((expiry) => expirySet.add(expiry));
        nextSymbolExpiriesMap[result.symbol] = result.result.expirations;
      });

      const sortedExpiries = Array.from(expirySet).sort((a, b) => a - b);
      setAvailableExpiries(sortedExpiries);
      setSymbolExpiriesMap(nextSymbolExpiriesMap);
      setVisibleExpiryMonths(1);

    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load expiries');
    } finally {
      setLoadingExpiries(false);
    }
  };

  const runAnalysis = async () => {
    if (symbols.length === 0) {
      setError('Please provide at least one stock symbol.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const responses = await Promise.allSettled(
        symbols.map((symbol) => fetchSymbolChainForWeekSelection(symbol, selectedWeek))
      );

      const allContracts: YahooOptionContract[] = [];
      const failedSymbols: string[] = [];

      responses.forEach((response, index) => {
        if (response.status === 'fulfilled') {
          allContracts.push(...response.value.contracts);
        } else {
          failedSymbols.push(symbols[index]);
        }
      });

      setContracts(allContracts);
      setLastRunAt(new Date());

      if (failedSymbols.length > 0) {
        setError(`Failed to fetch some symbols: ${failedSymbols.join(', ')}`);
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Failed to run Yahoo options analysis');
    } finally {
      setLoading(false);
    }
  };

  const volumeThreshold = useMemo(
    () => percentile(contracts.map((contract) => contract.volume).filter((volume) => volume > 0), 0.75),
    [contracts]
  );
  const openInterestThreshold = useMemo(
    () => percentile(
      contracts.map((contract) => contract.openInterest).filter((openInterest) => openInterest > 0),
      0.75
    ),
    [contracts]
  );

  const filteredContracts = useMemo(() => {
    return contracts.filter((contract) => {
      if (highVolumeOnly && contract.volume < volumeThreshold) return false;
      if (highOpenInterestOnly && contract.openInterest < openInterestThreshold) return false;
      return true;
    });
  }, [contracts, highVolumeOnly, highOpenInterestOnly, volumeThreshold, openInterestThreshold]);

  const sortedContracts = useMemo(
    () => [...filteredContracts].sort((a, b) => b.volume - a.volume || b.openInterest - a.openInterest),
    [filteredContracts]
  );

  const topVolumeItems = useMemo(
    () =>
      sortedContracts.slice(0, 3).map((contract) => ({
        label: `${contract.symbol} ${contract.strike} ${contract.optionType[0]}`,
        value: contract.volume,
        optionType: contract.optionType
      })),
    [sortedContracts]
  );

  const topOpenInterestItems = useMemo(
    () =>
      [...sortedContracts]
        .sort((a, b) => b.openInterest - a.openInterest)
        .slice(0, 3)
        .map((contract) => ({
          label: `${contract.symbol} ${contract.strike} ${contract.optionType[0]}`,
          value: contract.openInterest,
          optionType: contract.optionType
        })),
    [sortedContracts]
  );

  return (
    <div className="options-dashboard yahoo-options-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Yahoo Options Comparison</h1>
          <div className="header-stats">
            <span className="header-stat">{symbols.length} symbols</span>
            <span className="stat-separator">•</span>
            <span className="header-stat">{sortedContracts.length.toLocaleString()} contracts</span>
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
            <button
              className={`nav-button ${activeDashboard === 'yahoo' ? 'active' : ''}`}
              onClick={() => setActiveDashboard('yahoo')}
            >
              Yahoo Options
            </button>
            <button
              className={`nav-button ${activeDashboard === 'activeInsights' ? 'active' : ''}`}
              onClick={() => setActiveDashboard('activeInsights')}
            >
              Most Active Options
            </button>
            <button
              className={`nav-button ${activeDashboard === 'chainStructureYahoo' ? 'active' : ''}`}
              onClick={() => setActiveDashboard('chainStructureYahoo')}
            >
              Chain Structure (Yahoo)
            </button>
          </div>
        </div>
      </header>

      <section className="yahoo-controls">
        <div className="yahoo-symbols-panel">
          <label htmlFor="yahoo-symbols">Stock Symbols (comma/newline separated)</label>
          <textarea
            id="yahoo-symbols"
            value={symbolsInput}
            onChange={(event) => setSymbolsInput(event.target.value)}
            placeholder="ASTS, NVDA, PLTR"
            rows={4}
          />
        </div>

        <div className="yahoo-filter-panel">
          <div className="yahoo-expiry-row">
            <label htmlFor="yahoo-expiry">Expiry Week</label>
            <select
              id="yahoo-expiry"
              value={selectedWeekKey}
              onChange={(event) => setSelectedWeekKey(event.target.value)}
            >
              <option value="">Nearest available expiry (per symbol)</option>
              {visibleWeeklyExpiryOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label} ({option.expiries.length} expiries) {option.tickersWithExpiry.length > 0 ? `• ${option.tickersWithExpiry.join(', ')}` : ''}
                </option>
              ))}
            </select>
            {selectedWeek && (
              <p className="yahoo-muted" style={{ margin: 0 }}>
                {selectedWeek.tickerDetails.join(' | ')}
              </p>
            )}
            {hasMoreExpiryWeeks && (
              <button
                className="refresh-button-compact"
                onClick={() => setVisibleExpiryMonths((months) => months + 1)}
                title="Load next one-month block of expiry weeks"
              >
                Load More (+1 month)
              </button>
            )}
            {weeklyExpiryOptions.length > 0 && (
              <p className="yahoo-muted" style={{ margin: 0 }}>
                Showing {visibleWeeklyExpiryOptions.length} of {weeklyExpiryOptions.length} expiry weeks
              </p>
            )}
            <button
              className="refresh-button-compact"
              onClick={loadExpiries}
              disabled={loadingExpiries || symbols.length === 0}
              title="Load available expiries from Yahoo"
            >
              {loadingExpiries ? <Loader2 className="refresh-icon spinning" /> : <Search className="refresh-icon" />}
              Load Expiries
            </button>
          </div>

          <div className="yahoo-checkboxes">
            <label>
              <input
                type="checkbox"
                checked={highVolumeOnly}
                onChange={(event) => setHighVolumeOnly(event.target.checked)}
              />
              High volume contracts only (top quartile)
            </label>
            <label>
              <input
                type="checkbox"
                checked={highOpenInterestOnly}
                onChange={(event) => setHighOpenInterestOnly(event.target.checked)}
              />
              High open interest contracts only (top quartile)
            </label>
          </div>

          <button className="refresh-button-compact" onClick={runAnalysis} disabled={loading || symbols.length === 0}>
            {loading ? <Loader2 className="refresh-icon spinning" /> : <RefreshCw className="refresh-icon" />}
            Run Comparison
          </button>
        </div>
      </section>

      {error && <p className="yahoo-error">{error}</p>}

      <section className="yahoo-chart-grid">
        <BarList title="Top Contracts by Volume" items={topVolumeItems} />
        <BarList title="Top Contracts by Open Interest" items={topOpenInterestItems} />
      </section>

      <section className="yahoo-table-section">
        <div className="yahoo-table-title">
          <BarChart3 size={18} />
          <h3>Option Contracts</h3>
        </div>
        <div className="yahoo-table-wrapper">
          <table className="yahoo-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Type</th>
                <th>Contract</th>
                <th>Expiry</th>
                <th>Strike</th>
                <th>Last</th>
                <th>Bid</th>
                <th>Ask</th>
                <th>Volume</th>
                <th>Open Interest</th>
                <th>IV</th>
              </tr>
            </thead>
            <tbody>
              {sortedContracts.slice(0, 300).map((contract) => (
                <tr key={contract.contractSymbol}>
                  <td>{contract.symbol}</td>
                  <td className={contract.optionType === 'Call' ? 'yahoo-call' : 'yahoo-put'}>
                    {contract.optionType}
                  </td>
                  <td>
                    <a
                      href={buildTradingViewOptionUrl(contract.contractSymbol)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="yahoo-contract-link"
                      title="Open option chart in TradingView (new tab)"
                    >
                      {contract.contractSymbol}
                    </a>
                  </td>
                  <td>{contract.expirationLabel}</td>
                  <td>{contract.strike.toFixed(2)}</td>
                  <td>{contract.lastPrice.toFixed(2)}</td>
                  <td>{contract.bid.toFixed(2)}</td>
                  <td>{contract.ask.toFixed(2)}</td>
                  <td>{contract.volume.toLocaleString()}</td>
                  <td>{contract.openInterest.toLocaleString()}</td>
                  <td>{(contract.impliedVolatility * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedContracts.length === 0 && (
            <p className="yahoo-muted">No contracts to display. Run comparison after loading symbols/expiry.</p>
          )}
        </div>
      </section>
    </div>
  );
};

export default YahooOptionsDashboard;
