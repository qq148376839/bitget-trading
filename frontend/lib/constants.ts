import type { StrategyStatus, StrategyEventType } from './types';

export const POLL_INTERVAL_MS = 2000;
export const ORDERS_POLL_INTERVAL_MS = 3000;
export const EVENTS_POLL_INTERVAL_MS = 3000;
export const MAX_EVENTS_DISPLAY = 50;

export const STATUS_LABELS: Record<StrategyStatus, string> = {
  STOPPED: '已停止',
  STARTING: '启动中',
  RUNNING: '运行中',
  STOPPING: '停止中',
  ERROR: '错误',
};

export const STATUS_COLORS: Record<StrategyStatus, string> = {
  STOPPED: 'default',
  STARTING: 'processing',
  RUNNING: 'success',
  STOPPING: 'warning',
  ERROR: 'error',
};

export const EVENT_CONFIG: Record<StrategyEventType, { label: string; color: string }> = {
  STRATEGY_STARTED: { label: '策略启动', color: 'green' },
  STRATEGY_STOPPED: { label: '策略停止', color: 'default' },
  STRATEGY_ERROR: { label: '策略错误', color: 'red' },
  BUY_ORDER_PLACED: { label: '买单挂出', color: 'blue' },
  BUY_ORDER_CANCELLED: { label: '买单撤销', color: 'default' },
  BUY_ORDER_FILLED: { label: '买单成交', color: 'cyan' },
  SELL_ORDER_PLACED: { label: '卖单挂出', color: 'purple' },
  SELL_ORDER_FILLED: { label: '卖单成交', color: 'green' },
  ORDERS_MERGED: { label: '订单合并', color: 'orange' },
  RISK_LIMIT_HIT: { label: '风控触发', color: 'red' },
  CONFIG_UPDATED: { label: '配置更新', color: 'blue' },
  EMERGENCY_STOP: { label: '紧急停止', color: 'red' },
};

export const DIRECTION_LABELS: Record<string, string> = {
  long: '做多',
  short: '做空',
  both: '双向',
};

export const SIDE_LABELS: Record<string, string> = {
  buy: '买入',
  sell: '卖出',
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: '挂单中',
  filled: '已成交',
  cancelled: '已撤销',
  failed: '失败',
};
