import { RobinhoodOrderResult } from './robinhoodTrading';

export interface RobinhoodTradeLogEntry extends RobinhoodOrderResult {
  id: string;
  source: 'heatmap' | 'flow';
}

const STORAGE_KEY = 'optionAnalysis:robinhoodTradeLog';
const MAX_ENTRIES = 100;

function readEntries(): RobinhoodTradeLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: RobinhoodTradeLogEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function getRobinhoodTradeLog(): RobinhoodTradeLogEntry[] {
  return readEntries();
}

export function appendRobinhoodTradeLog(
  result: RobinhoodOrderResult,
  source: 'heatmap' | 'flow'
): RobinhoodTradeLogEntry {
  const entry: RobinhoodTradeLogEntry = {
    ...result,
    id: result.orderId || crypto.randomUUID(),
    source,
  };

  const next = [entry, ...readEntries()].slice(0, MAX_ENTRIES);
  writeEntries(next);
  return entry;
}

export function clearRobinhoodTradeLog() {
  localStorage.removeItem(STORAGE_KEY);
}
