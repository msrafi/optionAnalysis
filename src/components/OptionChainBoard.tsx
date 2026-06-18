import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { YahooOptionContract } from '../utils/yahooOptions';

export interface ChainBoardRow extends YahooOptionContract {
  daysToExpiry: number;
}

interface StrikePivot {
  strike: number;
  call: ChainBoardRow | null;
  put: ChainBoardRow | null;
}

interface ExpiryGroup {
  expiration: number;
  expirationLabel: string;
  daysToExpiry: number;
  strikes: StrikePivot[];
}

interface OptionChainBoardProps {
  symbol: string;
  spot: number | null;
  contracts: ChainBoardRow[];
}

const SIDE_COLUMN_COUNT = 5;
const TOTAL_COLUMN_COUNT = SIDE_COLUMN_COUNT * 2 + 1;

function formatExpiryHeader(expiration: number, daysToExpiry: number): string {
  const date = new Date(expiration * 1000).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC'
  });
  return `${date}  ${daysToExpiry} D`;
}

function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(2);
}

function formatVolume(value: number | null | undefined): string {
  if (value == null || value <= 0) return '—';
  return value.toLocaleString();
}

function buildExpiryGroups(contracts: ChainBoardRow[]): ExpiryGroup[] {
  const byExpiry = new Map<number, ChainBoardRow[]>();

  contracts.forEach((contract) => {
    const bucket = byExpiry.get(contract.expiration) || [];
    bucket.push(contract);
    byExpiry.set(contract.expiration, bucket);
  });

  return Array.from(byExpiry.entries())
    .sort(([a], [b]) => a - b)
    .map(([expiration, expiryContracts]) => {
      const strikeMap = new Map<number, StrikePivot>();

      expiryContracts.forEach((contract) => {
        const existing = strikeMap.get(contract.strike) || {
          strike: contract.strike,
          call: null,
          put: null
        };
        if (contract.optionType === 'Call') {
          existing.call = contract;
        } else {
          existing.put = contract;
        }
        strikeMap.set(contract.strike, existing);
      });

      const strikes = Array.from(strikeMap.values()).sort((a, b) => b.strike - a.strike);
      const sample = expiryContracts[0];

      return {
        expiration,
        expirationLabel: sample.expirationLabel,
        daysToExpiry: sample.daysToExpiry,
        strikes
      };
    });
}

function findSpotInsertIndex(strikes: StrikePivot[], spot: number | null): number {
  if (!spot || strikes.length === 0) return -1;
  for (let index = 0; index < strikes.length; index += 1) {
    if (strikes[index].strike < spot) return index;
  }
  return strikes.length;
}

const ContractSideCells: React.FC<{
  contract: ChainBoardRow | null;
  side: 'call' | 'put';
  spot: number | null;
  strike: number;
  reverse?: boolean;
}> = ({ contract, side, spot, strike, reverse = false }) => {
  const isItm =
    spot != null &&
    (side === 'call' ? strike < spot : strike > spot);
  const itmClass = isItm ? (side === 'call' ? 'chain-call-itm' : 'chain-put-itm') : '';

  if (!contract) {
    const emptyCells = Array.from({ length: SIDE_COLUMN_COUNT }, (_, index) => (
      <td key={`empty-${side}-${index}`} className={`chain-cell chain-cell-empty ${itmClass}`}>
        —
      </td>
    ));
    return <>{reverse ? emptyCells.reverse() : emptyCells}</>;
  }

  const cells = [
    <td key="last" className={`chain-cell chain-cell-last ${itmClass}`}>
      {formatPrice(contract.lastPrice)}
    </td>,
    <td key="bid" className={`chain-cell chain-cell-bid ${itmClass}`}>
      {formatPrice(contract.bid)}
    </td>,
    <td key="ask" className={`chain-cell chain-cell-ask ${itmClass}`}>
      {formatPrice(contract.ask)}
    </td>,
    <td key="oi" className={`chain-cell chain-cell-oi ${itmClass}`}>
      {formatVolume(contract.openInterest)}
    </td>,
    <td key="vol" className={`chain-cell chain-cell-vol ${itmClass}`}>
      {formatVolume(contract.volume)}
    </td>
  ];

  return <>{reverse ? [...cells].reverse() : cells}</>;
};

const OptionChainBoard: React.FC<OptionChainBoardProps> = ({ symbol, spot, contracts }) => {
  const expiryGroups = useMemo(() => buildExpiryGroups(contracts), [contracts]);
  const [expandedExpiries, setExpandedExpiries] = useState<Set<number>>(() => new Set());

  const effectiveExpanded = useMemo(() => {
    if (expandedExpiries.size > 0) return expandedExpiries;
    return new Set(expiryGroups.map((group) => group.expiration));
  }, [expandedExpiries, expiryGroups]);

  const toggleExpiry = (expiration: number) => {
    setExpandedExpiries((prev) => {
      const base = prev.size > 0 ? new Set(prev) : new Set(expiryGroups.map((group) => group.expiration));
      if (base.has(expiration)) {
        base.delete(expiration);
      } else {
        base.add(expiration);
      }
      return base;
    });
  };

  if (expiryGroups.length === 0) {
    return null;
  }

  return (
    <div className="option-chain-board option-chain-board--compact">
      <div className="option-chain-scroll">
        <table className="option-chain-table">
          <thead>
            <tr className="option-chain-side-row">
              <th colSpan={SIDE_COLUMN_COUNT} className="chain-side-header chain-side-header-call">
                <span className="chain-side-arrow">↘</span> Calls
              </th>
              <th className="chain-strike-header">Strike</th>
              <th colSpan={SIDE_COLUMN_COUNT} className="chain-side-header chain-side-header-put">
                Puts <span className="chain-side-arrow">↙</span>
              </th>
            </tr>
            <tr className="option-chain-columns-row">
              <th>Last</th>
              <th>Bid</th>
              <th>Ask</th>
              <th>OI</th>
              <th>Vol</th>
              <th className="chain-strike-header">Strike</th>
              <th>Vol</th>
              <th>OI</th>
              <th>Ask</th>
              <th>Bid</th>
              <th>Last</th>
            </tr>
          </thead>

          {expiryGroups.map((group) => {
            const isExpanded = effectiveExpanded.has(group.expiration);
            const spotInsertIndex = findSpotInsertIndex(group.strikes, spot);

            return (
              <tbody key={group.expiration} className="option-chain-expiry-group">
                <tr
                  className={`chain-expiry-row ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}
                  onClick={() => toggleExpiry(group.expiration)}
                >
                  <td colSpan={TOTAL_COLUMN_COUNT}>
                    <span className="chain-expiry-toggle">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <span className="chain-expiry-label">{formatExpiryHeader(group.expiration, group.daysToExpiry)}</span>
                    <span className="chain-expiry-meta">
                      {group.strikes.length} strike{group.strikes.length === 1 ? '' : 's'}
                    </span>
                  </td>
                </tr>

                {isExpanded &&
                  group.strikes.flatMap((row, index) => {
                    const renderedRows: React.ReactNode[] = [];

                    if (spot != null && spotInsertIndex === index) {
                      renderedRows.push(
                        <tr key={`spot-${group.expiration}-${index}`} className="chain-spot-divider-row">
                          <td colSpan={TOTAL_COLUMN_COUNT}>
                            <span className="chain-spot-symbol">{symbol}</span>
                            <span className="chain-spot-price">{spot.toFixed(2)}</span>
                          </td>
                        </tr>
                      );
                    }

                    renderedRows.push(
                      <tr key={`${group.expiration}-${row.strike}`} className="chain-strike-row">
                        <ContractSideCells
                          contract={row.call}
                          side="call"
                          spot={spot}
                          strike={row.strike}
                        />
                        <td className="chain-strike-cell">
                          <span className="chain-strike-value">{row.strike.toFixed(2)}</span>
                          <span className="chain-strike-dte">{group.daysToExpiry}D</span>
                        </td>
                        <ContractSideCells
                          contract={row.put}
                          side="put"
                          spot={spot}
                          strike={row.strike}
                          reverse
                        />
                      </tr>
                    );

                    return renderedRows;
                  })}

                {isExpanded && spot != null && spotInsertIndex === group.strikes.length && (
                  <tr className="chain-spot-divider-row">
                    <td colSpan={TOTAL_COLUMN_COUNT}>
                      <span className="chain-spot-symbol">{symbol}</span>
                      <span className="chain-spot-price">{spot.toFixed(2)}</span>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>
    </div>
  );
};

export default OptionChainBoard;
