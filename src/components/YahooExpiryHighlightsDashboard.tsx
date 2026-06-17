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

interface ScanRow extends YahooOptionContract {
  daysToExpiry: number;
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

const YahooExpiryHighlightsDashboard: React.FC<YahooExpiryHighlightsDashboardProps> = ({
  activeDashboard,
  setActiveDashboard
}) => {
  const [symbol, setSymbol] = useState('NVDA');
  const [allContracts, setAllContracts] = useState<ScanRow[]>([]);
  const [underlyingPrice, setUnderlyingPrice] = useState<number | null>(null);
  const [scannedExpiries, setScannedExpiries] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchProgress, setFetchProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [minVolume, setMinVolume] = useState(DEFAULT_MIN_VOLUME);
  const [minOi, setMinOi] = useState(DEFAULT_MIN_OI);

  const filteredRows = useMemo(
    () =>
      allContracts.filter(
        (row) =>
          row.bid > 0 && (row.volume >= minVolume || row.openInterest >= minOi)
      ),
    [allContracts, minVolume, minOi]
  );

  const runScan = async () => {
    const ticker = symbol.trim().toUpperCase();
    if (!ticker) {
      setError('Please enter a stock symbol.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setAllContracts([]);
      setScannedExpiries([]);
      setFetchProgress('Loading available expiries...');

      const initial = await fetchYahooOptionChain(ticker);
      const nextExpiries = initial.expirations.slice(0, EXPIRY_COUNT);

      if (nextExpiries.length === 0) {
        setError(`No expiries found for ${ticker}.`);
        return;
      }

      setUnderlyingPrice(initial.underlyingPrice);
      setScannedExpiries(nextExpiries);

      const collected: ScanRow[] = [];

      for (let index = 0; index < nextExpiries.length; index += 1) {
        const expiry = nextExpiries[index];
        const expiryLabel = new Date(expiry * 1000).toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          timeZone: 'UTC'
        });
        setFetchProgress(`Scanning expiry ${index + 1}/${nextExpiries.length}: ${expiryLabel}`);

        const chain = await fetchYahooOptionChain(ticker, expiry);
        collected.push(...toScanRows(chain.contracts));
      }

      setAllContracts(collected);
      setLastRunAt(new Date());
      setError(null);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Failed to scan expiries');
    } finally {
      setLoading(false);
      setFetchProgress('');
    }
  };

  return (
    <div className="options-dashboard yahoo-options-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>High Volume &amp; OI Strikes</h1>
          <div className="header-stats">
            <span className="header-stat">{symbol.trim().toUpperCase() || '—'}</span>
            {underlyingPrice !== null && (
              <>
                <span className="stat-separator">•</span>
                <span className="header-stat">Spot: ${underlyingPrice.toFixed(2)}</span>
              </>
            )}
            <span className="stat-separator">•</span>
            <span className="header-stat">{scannedExpiries.length} expiries scanned</span>
            <span className="stat-separator">•</span>
            <span className="header-stat">
              Vol ≥ {minVolume.toLocaleString()} or OI ≥ {minOi.toLocaleString()}
            </span>
            <span className="stat-separator">•</span>
            <span className="header-stat">{filteredRows.length.toLocaleString()} matches</span>
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
              className={`nav-button ${activeDashboard === 'chainStructureYahoo' ? 'active' : ''}`}
              onClick={() => setActiveDashboard('chainStructureYahoo')}
            >
              Chain Structure (Yahoo)
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

      <section className="yahoo-controls">
        <div className="yahoo-filter-panel">
          <label htmlFor="highlights-symbol">Stock Symbol</label>
          <input
            id="highlights-symbol"
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            className="search-input"
            style={{ maxWidth: 220 }}
            placeholder="e.g. NVDA"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !loading) {
                runScan();
              }
            }}
          />

          <label htmlFor="min-volume">Min Volume</label>
          <input
            id="min-volume"
            type="number"
            min={0}
            step={100}
            value={minVolume}
            onChange={(event) => setMinVolume(Math.max(0, Number(event.target.value) || 0))}
            className="search-input"
            style={{ maxWidth: 140 }}
          />

          <label htmlFor="min-oi">Min Open Interest</label>
          <input
            id="min-oi"
            type="number"
            min={0}
            step={100}
            value={minOi}
            onChange={(event) => setMinOi(Math.max(0, Number(event.target.value) || 0))}
            className="search-input"
            style={{ maxWidth: 140 }}
          />

          <button className="refresh-button-compact" onClick={runScan} disabled={loading}>
            {loading ? <Loader2 className="refresh-icon spinning" /> : <RefreshCw className="refresh-icon" />}
            Scan Next 10 Expiries
          </button>
        </div>

        <p className="yahoo-muted" style={{ margin: 0 }}>
          Shows contracts where <strong>either</strong> volume or open interest meets your minimum and bid is greater than 0.
          Adjust thresholds above — results update instantly after a scan without re-fetching.
        </p>
      </section>

      {loading && fetchProgress && <p className="yahoo-muted">{fetchProgress}</p>}
      {error && <p className="yahoo-error">{error}</p>}

      {filteredRows.length === 0 ? (
        <p className="yahoo-muted" style={{ margin: '0 1.5rem 1.5rem' }}>
          {allContracts.length > 0
            ? `No contracts match volume ≥ ${minVolume.toLocaleString()} or OI ≥ ${minOi.toLocaleString()} with bid > 0. Try lowering the thresholds.`
            : 'Enter a symbol, set minimum volume and OI (default 2500 each), then scan the next 10 expiries.'}
        </p>
      ) : (
        <OptionChainBoard
          symbol={symbol.trim().toUpperCase()}
          spot={underlyingPrice}
          contracts={filteredRows}
        />
      )}
    </div>
  );
};

export default YahooExpiryHighlightsDashboard;
