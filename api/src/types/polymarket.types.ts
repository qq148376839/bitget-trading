/**
 * Polymarket 预测市场信号类型定义
 */

/** 市场分类枚举 */
export type PolymarketCategory =
  | 'fed_rate'
  | 'btc_milestone'
  | 'eth_milestone'
  | 'geopolitical'
  | 'regulation'
  | 'macro_economic'
  | 'custom';

/** 信号方向 */
export type SignalDirection = 'bullish' | 'bearish' | 'neutral';

/** 监控项配置 */
export interface PolymarketWatchItem {
  conditionId: string;
  label: string;
  category: PolymarketCategory;
  /** 该市场概率上升对加密市场的影响方向 */
  impactDirection: 'bullish' | 'bearish';
  /** 信号权重 (0-1) */
  weight: number;
  /** 触发告警的 delta 百分比阈值 */
  deltaThresholdPercent: number;
}

/** Gamma API 市场数据响应映射 */
export interface PolymarketMarketData {
  condition_id: string;
  question: string;
  description: string;
  outcomes: string;
  outcome_prices: string;
  volume_num: number;
  liquidity_num: number;
  end_date_iso: string;
  active: boolean;
  closed: boolean;
  image: string;
}

/** 单市场信号快照 */
export interface MarketSignalSnapshot {
  conditionId: string;
  label: string;
  category: PolymarketCategory;
  currentProb: number;
  delta1h: number;
  delta24h: number;
  volume: number;
  alertTriggered: boolean;
  lastUpdated: number;
}

/** 综合宏观信号快照 */
export interface MacroSignalSnapshot {
  riskScore: number;       // 0-100
  direction: SignalDirection;
  confidence: number;      // 0-1
  hasAlert: boolean;
  markets: MarketSignalSnapshot[];
  lastPollAt: number;
  enabled: boolean;
}

/** 服务配置 */
export interface PolymarketSignalConfig {
  enabled: boolean;
  pollIntervalMs: number;
  proxyUrl: string;
  watchList: PolymarketWatchItem[];
  sensitivityMultiplier: number;
  maxRiskMultiplier: number;
}

/** 风控调整乘数 */
export interface RiskAdjustment {
  dailyLossMultiplier: number;
  drawdownMultiplier: number;
  positionMultiplier: number;
  cooldownMultiplier: number;
}

/** 价差调整 */
export interface SpreadAdjustment {
  multiplier: number;
  direction: SignalDirection;
  riskScore: number;
}

/** 网格调整 */
export interface GridAdjustment {
  widthMultiplier: number;
  rebalanceSensitivity: number;
  riskScore: number;
}

/** 禁用时返回的中性默认值 */
export const NEUTRAL_SIGNAL: MacroSignalSnapshot = {
  riskScore: 50,
  direction: 'neutral',
  confidence: 0,
  hasAlert: false,
  markets: [],
  lastPollAt: 0,
  enabled: false,
};

export const NEUTRAL_RISK_ADJUSTMENT: RiskAdjustment = {
  dailyLossMultiplier: 1.0,
  drawdownMultiplier: 1.0,
  positionMultiplier: 1.0,
  cooldownMultiplier: 1.0,
};

export const NEUTRAL_SPREAD_ADJUSTMENT: SpreadAdjustment = {
  multiplier: 1.0,
  direction: 'neutral',
  riskScore: 50,
};

export const NEUTRAL_GRID_ADJUSTMENT: GridAdjustment = {
  widthMultiplier: 1.0,
  rebalanceSensitivity: 1.0,
  riskScore: 50,
};

/** 默认配置（disabled） */
export const DEFAULT_POLYMARKET_CONFIG: PolymarketSignalConfig = {
  enabled: false,
  pollIntervalMs: 120000,
  proxyUrl: '',
  watchList: [],
  sensitivityMultiplier: 1.0,
  maxRiskMultiplier: 2.0,
};

/** 预设监控市场模板 */
export const PRESET_WATCH_ITEMS: PolymarketWatchItem[] = [
  {
    conditionId: '',
    label: 'Fed 利率决议',
    category: 'fed_rate',
    impactDirection: 'bearish',
    weight: 0.4,
    deltaThresholdPercent: 5,
  },
  {
    conditionId: '',
    label: 'BTC 价格里程碑',
    category: 'btc_milestone',
    impactDirection: 'bullish',
    weight: 0.3,
    deltaThresholdPercent: 10,
  },
  {
    conditionId: '',
    label: 'ETH 价格里程碑',
    category: 'eth_milestone',
    impactDirection: 'bullish',
    weight: 0.2,
    deltaThresholdPercent: 10,
  },
];
