import React, { useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  fetchYahooOptionChain,
  YahooOptionContract
} from '../utils/yahooOptions';
import OptionChainBoard from './OptionChainBoard';

type DashboardType =
  | 'options'
  | 'darkpool'
  | 'psychology'
  | 'chainStructure'
  | 'chainStructureYahoo'
  | 'yahooExpiryHighlights';

interface YahooExpiryHighlightsDashboardProps {
  activeDashboard: DashboardType;
  setActiveDashboard: (dashboard: DashboardType) => void;
}

const EXPIRY_COUNT = 10;
const DEFAULT_MIN_VOLUME = 2500;
const DEFAULT_MIN_OI = 2500;
const COLUMN_COUNT = 3;

type FilterMode = 'either' | 'volume' | 'oi';

interface ScanRow extends YahooOptionContract {
  daysToExpiry: number;
}

interface ColumnConfig {
  id: string;
  defaultSymbol: string;
}

interface ColumnState {
  symbol: string;
  allContracts: ScanRow[];
  underlyingPrice: number | null;
  scannedExpiries: number[];
  loading: boolean;
  fetchProgress: string;
  error: string | null;
  lastRunAt: Date | null;
  minVolume: number;
  minOi: number;
  filterMode: FilterMode;
}

const COLUMN_CONFIGS: ColumnConfig[] = [
  { id: 'col-1', defaultSymbol: 'NVDA' },
  { id: 'col-2', defaultSymbol: 'AMD' },
  { id: 'col-3', defaultSymbol: 'PLTR' }
];

function createInitialColumnState(defaultSymbol: string): ColumnState {
  return {
    symbol: defaultSymbol,
    allContracts: [],
    underlyingPrice: null,
    scannedExpiries: [],
    loading: false,
    fetchProgress: '',
    error: null,
    lastRunAt: null,
    minVolume: DEFAULT_MIN_VOLUME,
    minOi: DEFAULT_MIN_OI,
    filterMode: 'either'
  };
}

function getFilterSummary(mode: FilterMode, minVolume: number, minOi: number): string {
  if (mode === 'volume') return `Vol ≥ ${minVolume.toLocaleString()}`;
  if (mode === 'oi') return `OI ≥ ${minOi.toLocaleString()}`;
  return `Vol ≥ ${minVolume.toLocaleString()} or OI ≥ ${minOi.toLocaleString()}`;
}

function matchesFilter(
  row: ScanRow,
  mode: FilterMode,
  minVolume: number,
  minOi: number
): boolean {
  if (row.bid <= 0) return false;
  if (mode === 'volume') return row.volume >= minVolume;
  if (mode === 'oi') return row.openInterest >= minOi;
  return row.volume >= minVolume || row.openInterest >= minOi;
}

function daysUntilExpiry(expiration: number): number {
  const nowSec = Math.floor(Date.now() / 1000);
  return Math.max(0, Math.ceil((expiration - nowSec) / 86400));
}

function toScanRows(contracts: YahooOptionContract[]): ScanRow[] {
  return contracts.map((contract) => ({
    ...contract,
    daysToExpiry: daysUntilExpiry(contract.expiration)
  }));
}

interface HighlightsSearchColumnProps {
  columnId: string;
  columnIndex: number;
  state: ColumnState;
  onUpdate: (patch: Partial<ColumnState>) => void;
}

const HighlightsSearchColumn: React.FC<HighlightsSearchColumnProps> = ({
  columnId,
  columnIndex,
  state,
  onUpdate
}) => {
  const filterSummary = useMemo(
    () => getFilterSummary(state.filterMode, state.minVolume, state.minOi),
    [state.filterMode, state.minVolume, state.minOi]
  );

  const filteredRows = useMemo(
    () =>
      state.allContracts.filter((row) =>
        matchesFilter(row, state.filterMode, state.minVolume, state.minOi)
      ),
    [state.allContracts, state.filterMode, state.minVolume, state.minOi]
  );

  const runScan = async () => {
    const ticker = state.symbol.trim().toUpperCase();
    if (!ticker) {
      onUpdate({ error: 'Please enter a stock symbol.' });
      return;
    }

    try {
      onUpdate({
        loading: true,
        error: null,
        allContracts: [],
        scannedExpiries: [],
        fetchProgress: 'Loading available expiries...'
      });

      const initial = await fetchYahooOptionChain(ticker);
      const nextExpiries = initial.expirations.slice(0, EXPIRY_COUNT);

      if (nextExpiries.length === 0) {
        onUpdate({
          loading: false,
          fetchProgress: '',
          error: `No expiries found for ${ticker}.`
        });
        return;
      }

      onUpdate({
        underlyingPrice: initial.underlyingPrice,
        scannedExpiries: nextExpiries
      });

      const collected: ScanRow[] = [];

      for (let index = 0; index < nextExpiries.length; index += 1) {
        const expiry = nextExpiries[index];
        const expiryLabel = new Date(expiry * 1000).toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          timeZone: 'UTC'
        });
        onUpdate({
          fetchProgress: `Scanning expiry ${index + 1}/${nextExpiries.length}: ${expiryLabel}`
        });

        const chain = await fetchYahooOptionChain(ticker, expiry);
        collected.push(...toScanRows(chain.contracts));
      }

      onUpdate({
        allContracts: collected,
        lastRunAt: new Date(),
        error: null,
        loading: false,
        fetchProgress: ''
      });
    } catch (scanError) {
      onUpdate({
        error: scanError instanceof Error ? scanError.message : 'Failed to scan expiries',
        loading: false,
        fetchProgress: ''
      });
    }
  };

  const displaySymbol = state.symbol.trim().toUpperCase() || '—';

  return (
    <section className="highlights-column">
      <div className="highlights-column-header">
        <h3>Search {columnIndex + 1}</h3>
        <div className="highlights-column-stats">
          <span>{displaySymbol}</span>
          {state.underlyingPrice !== null && (
            <>
              <span className="stat-separator">•</span>
              <span>${state.underlyingPrice.toFixed(2)}</span>
            </>
          )}
          <span className="stat-separator">•</span>
          <span>{filteredRows.length} matches</span>
        </div>
      </div>

      <div className="yahoo-filter-panel yahoo-filter-toolbar highlights-column-toolbar">
        <div className="yahoo-filter-field yahoo-filter-field--symbol">
          <label htmlFor={`${columnId}-symbol`}>Symbol</label>
          <input
            id={`${columnId}-symbol`}
            value={state.symbol}
            onChange={(event) => onUpdate({ symbol: event.target.value.toUpperCase() })}
            className="search-input"
            placeholder="NVDA"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !state.loading) {
                runScan();
              }
            }}
          />
        </div>

        <div className="yahoo-filter-field yahoo-filter-field--number">
          <label htmlFor={`${columnId}-min-volume`}>Min Vol</label>
          <input
            id={`${columnId}-min-volume`}
            type="number"
            min={0}
            step={100}
            value={state.minVolume}
            onChange={(event) =>
              onUpdate({ minVolume: Math.max(0, Number(event.target.value) || 0) })
            }
            className="search-input"
          />
        </div>

        <div className="yahoo-filter-field yahoo-filter-field--number">
          <label htmlFor={`${columnId}-min-oi`}>Min OI</label>
          <input
            id={`${columnId}-min-oi`}
            type="number"
            min={0}
            step={100}
            value={state.minOi}
            onChange={(event) => onUpdate({ minOi: Math.max(0, Number(event.target.value) || 0) })}
            className="search-input"
          />
        </div>

        <div className="yahoo-filter-field yahoo-filter-field--mode">
          <label htmlFor={`${columnId}-filter-mode`}>Match</label>
          <select
            id={`${columnId}-filter-mode`}
            className="yahoo-filter-select"
            value={state.filterMode}
            onChange={(event) => onUpdate({ filterMode: event.target.value as FilterMode })}
          >
            <option value="either">Vol or OI</option>
            <option value="volume">Volume only</option>
            <option value="oi">OI only</option>
          </select>
        </div>

        <button
          className="refresh-button-compact yahoo-filter-action"
          onClick={runScan}
          disabled={state.loading}
        >
          {state.loading ? <Loader2 className="refresh-icon spinning" /> : <RefreshCw className="refresh-icon" />}
          Scan
        </button>
      </div>

      <p className="yahoo-muted highlights-column-hint">{filterSummary} • bid &gt; 0</p>

      {state.loading && state.fetchProgress && (
        <p className="yahoo-muted highlights-column-status">{state.fetchProgress}</p>
      )}
      {state.error && <p className="yahoo-error highlights-column-status">{state.error}</p>}

      <div className="highlights-column-results">
        {filteredRows.length === 0 ? (
          <p className="yahoo-muted highlights-column-empty">
            {state.allContracts.length > 0
              ? `No contracts match ${filterSummary} with bid > 0.`
              : 'Set filters and scan the next 10 expiries.'}
          </p>
        ) : (
          <OptionChainBoard
            symbol={displaySymbol}
            spot={state.underlyingPrice}
            contracts={filteredRows}
          />
        )}
      </div>

      {state.lastRunAt && (
        <p className="yahoo-muted highlights-column-footer">
          Updated {state.lastRunAt.toLocaleTimeString()} • {state.scannedExpiries.length} expiries
        </p>
      )}
    </section>
  );
};

const YahooExpiryHighlightsDashboard: React.FC<YahooExpiryHighlightsDashboardProps> = ({
  activeDashboard,
  setActiveDashboard
}) => {
  const [columns, setColumns] = useState<ColumnState[]>(() =>
    COLUMN_CONFIGS.map((config) => createInitialColumnState(config.defaultSymbol))
  );

  const updateColumn = (index: number, patch: Partial<ColumnState>) => {
    setColumns((prev) =>
      prev.map((column, columnIndex) =>
        columnIndex === index ? { ...column, ...patch } : column
      )
    );
  };

  return (
    <div className="options-dashboard yahoo-options-dashboard yahoo-expiry-highlights-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>High Volume &amp; OI Strikes</h1>
          <div className="header-stats">
            <span className="header-stat">{COLUMN_COUNT} symbol scanners</span>
            <span className="stat-separator">•</span>
            <span className="header-stat">Next {EXPIRY_COUNT} expiries each</span>
          </div>
        </div>
        <div className="header-right">
          <div className="nav-buttons">
            <button
              className={`nav-button ${activeDashboard === 'chainStructureYahoo' ? 'active' : ''}`}
              onClick={() => setActiveDashboard('chainStructureYahoo')}
            >
              Chain Structure
            </button>
            <button
              className={`nav-button ${activeDashboard === 'yahooExpiryHighlights' ? 'active' : ''}`}
              onClick={() => setActiveDashboard('yahooExpiryHighlights')}
            >
              High Vol &amp; OI
            </button>
          </div>
        </div>
      </header>

      <div className="highlights-3col-grid">
        {COLUMN_CONFIGS.map((config, index) => (
          <HighlightsSearchColumn
            key={config.id}
            columnId={config.id}
            columnIndex={index}
            state={columns[index]}
            onUpdate={(patch) => updateColumn(index, patch)}
          />
        ))}
      </div>
    </div>
  );
};

export default YahooExpiryHighlightsDashboard;
