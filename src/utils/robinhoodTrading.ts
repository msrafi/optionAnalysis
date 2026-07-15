const API_BASE: string = import.meta.env.VITE_YAHOO_API_BASE ?? '';

export interface RobinhoodTradeDraft {
  source: 'heatmap' | 'flow';
  symbol: string;
  expirationUnix: number;
  strike: number;
  optionType: 'Call' | 'Put';
  premium: number;
}

export interface RobinhoodTradePreview {
  symbol: string;
  expirationUnix: number;
  expirationIso: string;
  strike: number;
  optionType: 'Call' | 'Put';
  contractSymbol: string;
  instrumentUrl: string;
  bid: number;
  ask: number;
  mark: number;
  lastTrade: number;
  tradingEnabled: boolean;
}

export interface RobinhoodTradingStatus {
  configured: boolean;
  tradingEnabled: boolean;
  message: string;
}

export interface RobinhoodOrderResult {
  orderId: string | null;
  state: string | null;
  symbol: string;
  expirationUnix: number;
  expirationIso: string;
  strike: number;
  optionType: 'Call' | 'Put';
  contractSymbol: string;
  quantity: number;
  side: string;
  orderType: string;
  limitPrice: number | null;
  createdAt: string;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : `Robinhood request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export async function fetchRobinhoodTradingStatus(): Promise<RobinhoodTradingStatus> {
  const response = await fetch(`${API_BASE}/api/robinhood/trading/status`);
  return parseJsonResponse<RobinhoodTradingStatus>(response);
}

export async function previewRobinhoodTrade(
  draft: Pick<RobinhoodTradeDraft, 'symbol' | 'expirationUnix' | 'strike' | 'optionType'>
): Promise<RobinhoodTradePreview> {
  const response = await fetch(`${API_BASE}/api/robinhood/orders/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol: draft.symbol,
      expirationUnix: draft.expirationUnix,
      strike: draft.strike,
      optionType: draft.optionType,
    }),
  });
  return parseJsonResponse<RobinhoodTradePreview>(response);
}

export async function placeRobinhoodTrade(input: {
  symbol: string;
  expirationUnix: number;
  strike: number;
  optionType: 'Call' | 'Put';
  quantity: number;
  orderType: 'limit' | 'market';
  limitPrice?: number;
  side?: 'buy' | 'sell';
}): Promise<RobinhoodOrderResult> {
  const response = await fetch(`${API_BASE}/api/robinhood/orders/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonResponse<RobinhoodOrderResult>(response);
}
