import type {
  StrategyState,
  PnlSummary,
  OrdersResponse,
  StrategyEvent,
  AnyStrategyConfig,
  ContractSpecInfo,
  InstrumentSpec,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error?.message || json.message || '请求失败');
  }
  return json.data;
}

export const api = {
  getStatus: () => request<StrategyState>('/api/strategy/status'),
  getPnl: () => request<PnlSummary>('/api/strategy/pnl'),
  getOrders: () => request<OrdersResponse>('/api/strategy/orders'),
  getEvents: (limit = 50) => request<StrategyEvent[]>(`/api/strategy/events?limit=${limit}`),

  startStrategy: (config?: Partial<AnyStrategyConfig>) =>
    request<StrategyState>('/api/strategy/start', {
      method: 'POST',
      body: JSON.stringify(config || {}),
    }),
  stopStrategy: () =>
    request<StrategyState>('/api/strategy/stop', { method: 'POST' }),
  emergencyStop: () =>
    request<StrategyState>('/api/strategy/emergency-stop', { method: 'POST' }),
  updateConfig: (changes: Partial<AnyStrategyConfig>) =>
    request<AnyStrategyConfig>('/api/strategy/config', {
      method: 'PUT',
      body: JSON.stringify(changes),
    }),

  getContractSpec: (symbol: string) =>
    request<ContractSpecInfo>(`/api/contracts/specs/${encodeURIComponent(symbol)}`),

  // Instrument endpoints (Phase 2)
  searchInstruments: (tradingType: string, search?: string) =>
    request<InstrumentSpec[]>(`/api/instruments?tradingType=${tradingType}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  getHotInstruments: (tradingType: string) =>
    request<InstrumentSpec[]>(`/api/instruments/hot?tradingType=${tradingType}`),
};

export const swrFetcher = <T>(url: string): Promise<T> => request<T>(url);
