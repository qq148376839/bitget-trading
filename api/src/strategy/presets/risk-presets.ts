/**
 * 风险等级预设
 * 为简单模式提供三档预设参数
 */

export type RiskLevel = 'conservative' | 'balanced' | 'aggressive';

export interface ScalpingPreset {
  spreadMultiplier: number;       // 价差乘数（基于手续费计算的最低价差 x 此乘数）
  maxPositionPercent: number;     // 最大仓位占余额百分比
  maxDrawdownPercent: number;
  stopLossPercent: number;
  dailyLossPercent: number;       // 每日亏损限制占余额百分比
  maxPendingOrders: number;
  mergeThreshold: number;
  pollIntervalMs: number;
  orderCheckIntervalMs: number;
  cooldownMs: number;
}

export interface GridPreset {
  rangePercent: number;           // 网格范围（当前价上下百分比）
  gridCount: number;
  maxPositionPercent: number;
  maxDrawdownPercent: number;
  stopLossPercent: number;
  dailyLossPercent: number;
  pollIntervalMs: number;
  orderCheckIntervalMs: number;
  cooldownMs: number;
}

export const SCALPING_PRESETS: Record<RiskLevel, ScalpingPreset> = {
  conservative: {
    spreadMultiplier: 3.0,
    maxPositionPercent: 0.1,
    maxDrawdownPercent: 3,
    stopLossPercent: 2,
    dailyLossPercent: 0.02,
    maxPendingOrders: 100,
    mergeThreshold: 15,
    pollIntervalMs: 2000,
    orderCheckIntervalMs: 3000,
    cooldownMs: 120000,
  },
  balanced: {
    spreadMultiplier: 2.0,
    maxPositionPercent: 0.2,
    maxDrawdownPercent: 5,
    stopLossPercent: 3,
    dailyLossPercent: 0.05,
    maxPendingOrders: 200,
    mergeThreshold: 21,
    pollIntervalMs: 1000,
    orderCheckIntervalMs: 2000,
    cooldownMs: 60000,
  },
  aggressive: {
    spreadMultiplier: 1.5,
    maxPositionPercent: 0.4,
    maxDrawdownPercent: 10,
    stopLossPercent: 5,
    dailyLossPercent: 0.1,
    maxPendingOrders: 300,
    mergeThreshold: 30,
    pollIntervalMs: 500,
    orderCheckIntervalMs: 1000,
    cooldownMs: 30000,
  },
};

export const GRID_PRESETS: Record<RiskLevel, GridPreset> = {
  conservative: {
    rangePercent: 5,
    gridCount: 10,
    maxPositionPercent: 0.15,
    maxDrawdownPercent: 3,
    stopLossPercent: 2,
    dailyLossPercent: 0.02,
    pollIntervalMs: 5000,
    orderCheckIntervalMs: 5000,
    cooldownMs: 120000,
  },
  balanced: {
    rangePercent: 10,
    gridCount: 20,
    maxPositionPercent: 0.3,
    maxDrawdownPercent: 5,
    stopLossPercent: 3,
    dailyLossPercent: 0.05,
    pollIntervalMs: 3000,
    orderCheckIntervalMs: 3000,
    cooldownMs: 60000,
  },
  aggressive: {
    rangePercent: 20,
    gridCount: 50,
    maxPositionPercent: 0.5,
    maxDrawdownPercent: 10,
    stopLossPercent: 5,
    dailyLossPercent: 0.1,
    pollIntervalMs: 2000,
    orderCheckIntervalMs: 2000,
    cooldownMs: 30000,
  },
};
