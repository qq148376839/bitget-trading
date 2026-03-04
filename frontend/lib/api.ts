import type {
  StrategyState,
  PnlSummary,
  OrdersResponse,
  StrategyEvent,
  AnyStrategyConfig,
  ContractSpecInfo,
  InstrumentSpec,
  MacroSignalSnapshot,
  PolymarketSignalConfig,
  PolymarketWatchItem,
  PolymarketSearchResult,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const TOKEN_KEY = 'bitget_auth_token';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  // Handle 401 — token expired or invalid
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
    throw new Error('认证已过期，请重新登录');
  }

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error?.message || json.message || '请求失败');
  }
  return json.data;
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ token: string; user: unknown }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  // Strategy
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
  restartStrategy: (config?: Partial<AnyStrategyConfig>) =>
    request<StrategyState>('/api/strategy/restart', {
      method: 'POST',
      body: JSON.stringify(config || {}),
    }),
  emergencyStop: () =>
    request<StrategyState>('/api/strategy/emergency-stop', { method: 'POST' }),
  updateConfig: (changes: Partial<AnyStrategyConfig>) =>
    request<AnyStrategyConfig>('/api/strategy/config', {
      method: 'PUT',
      body: JSON.stringify(changes),
    }),

  getContractSpec: (symbol: string) =>
    request<ContractSpecInfo>(`/api/contracts/specs/${encodeURIComponent(symbol)}`),

  // Instruments
  searchInstruments: (tradingType: string, search?: string) =>
    request<InstrumentSpec[]>(`/api/instruments?tradingType=${tradingType}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  getHotInstruments: (tradingType: string) =>
    request<InstrumentSpec[]>(`/api/instruments/hot?tradingType=${tradingType}`),

  // System Config
  getSystemConfigs: () =>
    request<Array<{ key: string; value: string; isEncrypted: boolean; description: string | null }>>('/api/system-config'),
  updateSystemConfig: (key: string, value: string, isEncrypted?: boolean, description?: string) =>
    request<{ message: string }>(`/api/system-config/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value, isEncrypted, description }),
    }),
  testBitgetConnection: (apiKey: string, secretKey: string, passphrase: string, simulated?: boolean) =>
    request<{ connected: boolean; message: string }>('/api/system-config/test-connection', {
      method: 'POST',
      body: JSON.stringify({ apiKey, secretKey, passphrase, simulated }),
    }),
  exportConfigs: () =>
    request<Array<{ key: string; value: string; description: string | null }>>('/api/system-config/export', {
      method: 'POST',
    }),

  // Auth management
  getUsers: () =>
    request<Array<{ id: number; username: string; display_name: string | null; role: string; is_active: boolean; last_login_at: string | null }>>('/api/auth/users'),
  registerUser: (username: string, password: string, displayName?: string, role?: string) =>
    request<unknown>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName, role }),
    }),
  deleteUser: (id: number) =>
    request<unknown>(`/api/auth/users/${id}`, { method: 'DELETE' }),
  toggleUser: (id: number) =>
    request<unknown>(`/api/auth/users/${id}/toggle`, { method: 'PUT' }),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<unknown>('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword, newPassword }),
    }),

  // Polymarket
  getPolymarketSignal: () =>
    request<MacroSignalSnapshot>('/api/polymarket/signal'),
  getPolymarketConfig: () =>
    request<PolymarketSignalConfig>('/api/polymarket/config'),
  updatePolymarketConfig: (config: Partial<PolymarketSignalConfig>) =>
    request<PolymarketSignalConfig>('/api/polymarket/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  pollPolymarket: () =>
    request<MacroSignalSnapshot>('/api/polymarket/poll', { method: 'POST' }),
  searchPolymarketMarkets: (query: string) =>
    request<PolymarketSearchResult[]>(`/api/polymarket/search?q=${encodeURIComponent(query)}`),
  addPolymarketWatch: (item: PolymarketWatchItem) =>
    request<PolymarketSignalConfig>('/api/polymarket/watchlist', {
      method: 'POST',
      body: JSON.stringify(item),
    }),
  removePolymarketWatch: (conditionId: string) =>
    request<PolymarketSignalConfig>(`/api/polymarket/watchlist/${encodeURIComponent(conditionId)}`, {
      method: 'DELETE',
    }),
};

export const swrFetcher = <T>(url: string): Promise<T> => request<T>(url);
