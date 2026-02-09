/**
 * 网格位管理器
 * 管理网格价位计算、状态追踪
 */

import { createLogger } from '../utils/logger';

const logger = createLogger('grid-level-manager');

export type GridLevelState = 'empty' | 'buy_pending' | 'buy_filled' | 'sell_pending';

export interface GridLevel {
  index: number;
  price: string;
  state: GridLevelState;
  buyOrderId: string | null;
  sellOrderId: string | null;
  size: string;
}

export class GridLevelManager {
  private levels: GridLevel[] = [];
  private gridType: 'arithmetic' | 'geometric';
  private pricePrecision: number;
  private sizePrecision: number;

  constructor(config: {
    upperPrice: string;
    lowerPrice: string;
    gridCount: number;
    gridType: 'arithmetic' | 'geometric';
    orderAmountUsdt: string;
    pricePrecision: number;
    sizePrecision: number;
  }) {
    this.gridType = config.gridType;
    this.pricePrecision = config.pricePrecision;
    this.sizePrecision = config.sizePrecision;
    this.calculateLevels(config);
  }

  private calculateLevels(config: {
    upperPrice: string;
    lowerPrice: string;
    gridCount: number;
    orderAmountUsdt: string;
  }): void {
    const upper = parseFloat(config.upperPrice);
    const lower = parseFloat(config.lowerPrice);
    const count = config.gridCount;

    this.levels = [];

    for (let i = 0; i <= count; i++) {
      let price: number;
      if (this.gridType === 'arithmetic') {
        price = lower + i * (upper - lower) / count;
      } else {
        // geometric
        price = lower * Math.pow(upper / lower, i / count);
      }

      const priceStr = price.toFixed(this.pricePrecision);
      const size = (parseFloat(config.orderAmountUsdt) / price).toFixed(this.sizePrecision);

      this.levels.push({
        index: i,
        price: priceStr,
        state: 'empty',
        buyOrderId: null,
        sellOrderId: null,
        size,
      });
    }

    logger.info('网格位计算完成', {
      count: this.levels.length,
      lowerPrice: this.levels[0]?.price,
      upperPrice: this.levels[this.levels.length - 1]?.price,
      gridType: this.gridType,
    });
  }

  getLevels(): GridLevel[] {
    return [...this.levels];
  }

  getLevel(index: number): GridLevel | undefined {
    return this.levels[index];
  }

  getLevelCount(): number {
    return this.levels.length;
  }

  /**
   * Find the grid level closest to a price (within price precision tolerance)
   */
  findLevelByPrice(price: string): GridLevel | undefined {
    const priceNum = parseFloat(price);
    return this.levels.find(l => Math.abs(parseFloat(l.price) - priceNum) < Math.pow(10, -this.pricePrecision));
  }

  /**
   * Update level state
   */
  updateLevelState(index: number, state: GridLevelState, orderId?: string): void {
    const level = this.levels[index];
    if (!level) return;

    level.state = state;
    if (state === 'buy_pending' && orderId) {
      level.buyOrderId = orderId;
    } else if (state === 'sell_pending' && orderId) {
      level.sellOrderId = orderId;
    } else if (state === 'empty') {
      level.buyOrderId = null;
      level.sellOrderId = null;
    }
  }

  /**
   * Find level by order ID
   */
  findLevelByOrderId(orderId: string): GridLevel | undefined {
    return this.levels.find(l => l.buyOrderId === orderId || l.sellOrderId === orderId);
  }

  /**
   * Get levels that need buy orders (below current price, state=empty)
   */
  getLevelsNeedingBuy(currentPrice: number): GridLevel[] {
    return this.levels.filter(l =>
      l.state === 'empty' && parseFloat(l.price) < currentPrice
    );
  }

  /**
   * Get levels that need sell orders (above current price, state=buy_filled)
   */
  getLevelsNeedingSell(currentPrice: number): GridLevel[] {
    return this.levels.filter(l =>
      l.state === 'buy_filled' && parseFloat(l.price) <= currentPrice
    );
  }

  /**
   * Get grid spacing
   */
  getGridSpacing(): string {
    if (this.levels.length < 2) return '0';
    const first = parseFloat(this.levels[0].price);
    const second = parseFloat(this.levels[1].price);
    return (second - first).toFixed(this.pricePrecision);
  }

  /**
   * Get pending order IDs for reconciliation
   */
  getPendingOrderIds(): string[] {
    const ids: string[] = [];
    for (const level of this.levels) {
      if (level.state === 'buy_pending' && level.buyOrderId) {
        ids.push(level.buyOrderId);
      }
      if (level.state === 'sell_pending' && level.sellOrderId) {
        ids.push(level.sellOrderId);
      }
    }
    return ids;
  }
}
