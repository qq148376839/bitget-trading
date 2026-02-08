import type {
  StrategyState,
  PnlSummary,
  OrdersResponse,
  StrategyEvent,
  ScalpingStrategyConfig,
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

  startStrategy: (config?: Partial<ScalpingStrategyConfig>) =>
    request<StrategyState>('/api/strategy/start', {
      method: 'POST',
      body: JSON.stringify(config || {}),
    }),
  stopStrategy: () =>
    request<StrategyState>('/api/strategy/stop', { method: 'POST' }),
  emergencyStop: () =>
    request<StrategyState>('/api/strategy/emergency-stop', { method: 'POST' }),
  updateConfig: (changes: Partial<ScalpingStrategyConfig>) =>
    request<ScalpingStrategyConfig>('/api/strategy/config', {
      method: 'PUT',
      body: JSON.stringify(changes),
    }),
};

export const swrFetcher = <T>(url: string): Promise<T> => request<T>(url);
