import React, { useEffect, useMemo, useState } from 'react';
import {
  placeRobinhoodTrade,
  previewRobinhoodTrade,
  RobinhoodOrderResult,
  RobinhoodTradeDraft,
  RobinhoodTradePreview,
} from '../utils/robinhoodTrading';

interface RobinhoodTradeConfirmModalProps {
  draft: RobinhoodTradeDraft;
  tradingEnabled: boolean;
  onClose: () => void;
  onPlaced?: (result: RobinhoodOrderResult) => void;
}

function formatExpiry(iso: string): string {
  const parsed = Date.parse(`${iso}T12:00:00`);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const RobinhoodTradeConfirmModal: React.FC<RobinhoodTradeConfirmModalProps> = ({
  draft,
  tradingEnabled,
  onClose,
  onPlaced,
}) => {
  const [preview, setPreview] = useState<RobinhoodTradePreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
  const [limitPrice, setLimitPrice] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadingPreview(true);
    setPreviewError('');
    setPreview(null);

    previewRobinhoodTrade(draft)
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
        const suggested =
          draft.premium > 0
            ? draft.premium
            : result.ask > 0
              ? result.ask
              : result.mark > 0
                ? result.mark
                : result.lastTrade;
        setLimitPrice(suggested > 0 ? suggested.toFixed(2) : '');
      })
      .catch((error) => {
        if (cancelled) return;
        setPreviewError(error instanceof Error ? error.message : 'Failed to load contract preview');
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [draft]);

  const sourceLabel = useMemo(
    () => (draft.source === 'heatmap' ? 'Volume/OI Heatmap premium' : 'Volume Added Flow side'),
    [draft.source]
  );

  const canSubmit =
    tradingEnabled &&
    confirmChecked &&
    !loadingPreview &&
    !previewError &&
    preview &&
    quantity >= 1 &&
    (orderType === 'market' || Number(limitPrice) > 0) &&
    !submitting;

  const handleSubmit = async () => {
    if (!preview || !canSubmit) return;
    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      const result = await placeRobinhoodTrade({
        symbol: draft.symbol,
        expirationUnix: draft.expirationUnix,
        strike: draft.strike,
        optionType: draft.optionType,
        quantity,
        orderType,
        limitPrice: orderType === 'limit' ? Number(limitPrice) : undefined,
        side: 'buy',
      });
      setSubmitSuccess(`Order submitted to Robinhood (${result.state || 'queued'}).`);
      onPlaced?.(result);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rh-trade-modal-overlay" onClick={onClose}>
      <div className="rh-trade-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="rh-trade-modal-header">
          <h3>Confirm Robinhood Trade</h3>
          <button type="button" className="rh-trade-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="rh-trade-modal-warning">
          This will send a <strong>LIVE</strong> order to your Robinhood account.
        </div>

        <div className="rh-trade-modal-body">
          <div className="rh-trade-detail-grid">
            <span>Source</span><strong>{sourceLabel}</strong>
            <span>Symbol</span><strong>{draft.symbol}</strong>
            <span>Side</span><strong>{draft.optionType}</strong>
            <span>Strike</span><strong>${draft.strike}</strong>
            <span>Expiry</span>
            <strong>{preview ? formatExpiry(preview.expirationIso) : 'Loading...'}</strong>
            <span>Selected premium</span><strong>${draft.premium > 0 ? draft.premium.toFixed(2) : '-'}</strong>
            {preview && (
              <>
                <span>Contract</span><strong>{preview.contractSymbol}</strong>
                <span>Bid / Ask</span>
                <strong>
                  ${preview.bid.toFixed(2)} / ${preview.ask.toFixed(2)}
                </strong>
              </>
            )}
          </div>

          {loadingPreview && <p className="rh-trade-muted">Loading Robinhood contract...</p>}
          {previewError && <p className="rh-trade-error">{previewError}</p>}

          {!loadingPreview && !previewError && (
            <>
              <label className="rh-trade-field">
                <span>Quantity (contracts)</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                />
              </label>

              <label className="rh-trade-field">
                <span>Order type</span>
                <select value={orderType} onChange={(event) => setOrderType(event.target.value as 'limit' | 'market')}>
                  <option value="limit">Limit</option>
                  <option value="market">Market</option>
                </select>
              </label>

              {orderType === 'limit' && (
                <label className="rh-trade-field">
                  <span>Limit price</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={limitPrice}
                    onChange={(event) => setLimitPrice(event.target.value)}
                  />
                </label>
              )}

              {!tradingEnabled && (
                <p className="rh-trade-error">
                  Live trading is disabled. Set <code>ROBINHOOD_TRADING_ENABLED=true</code> in <code>.env.local</code> and restart the server.
                </p>
              )}

              <label className="rh-trade-confirm-check">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(event) => setConfirmChecked(event.target.checked)}
                />
                <span>I understand this sends a live order to my Robinhood account.</span>
              </label>
            </>
          )}

          {submitError && <p className="rh-trade-error">{submitError}</p>}
          {submitSuccess && <p className="rh-trade-success">{submitSuccess}</p>}
        </div>

        <div className="rh-trade-modal-actions">
          <button type="button" className="rh-trade-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="rh-trade-btn primary" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Sending...' : 'Send to Robinhood'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RobinhoodTradeConfirmModal;
