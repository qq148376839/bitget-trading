/**
 * 策略接口定义
 * 所有策略类型（剥头皮、网格等）必须实现此接口
 */

import { StrategyType, TradingType } from '../../types/trading.types';
import {
  StrategyStatus,
  StrategyState,
  StrategyEvent,
  TrackedOrder,
  PnlSummary,
  BaseStrategyConfig,
} from '../../types/strategy.types';

export interface IStrategy {
  readonly strategyType: StrategyType;
  readonly instanceId: string;

  start(config: BaseStrategyConfig): Promise<void>;
  stop(): Promise<void>;
  emergencyStop(): Promise<void>;
  getStatus(): StrategyStatus;
  getState(): StrategyState;
  updateConfig(changes: Record<string, unknown>): BaseStrategyConfig;
  getTrackedOrders(): TrackedOrder[];
  getPnlSummary(): PnlSummary;
  getEvents(limit?: number): StrategyEvent[];
}
