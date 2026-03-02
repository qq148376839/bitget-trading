/**
 * 市场状态检测
 * 基于 ATR + 布林带宽度 + RSI 综合判断
 */

import { Candle, calcATR, calcRSI, calcBollingerBands, calcEMA } from './technical-indicators';
import { createLogger } from '../../utils/logger';

const logger = createLogger('market-regime');

export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile';

export interface MarketRegimeResult {
  regime: MarketRegime;
  confidence: number;  // 0-1
  atr: number;
  atrPercentage: number;
  rsi: number;
  bollingerWidth: number;
  trendStrength: number;
}

/**
 * 检测当前市场状态
 */
export function detectMarketRegime(candles: Candle[]): MarketRegimeResult {
  if (candles.length < 26) {
    return {
      regime: 'ranging',
      confidence: 0,
      atr: 0,
      atrPercentage: 0,
      rsi: 50,
      bollingerWidth: 0,
      trendStrength: 0,
    };
  }

  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];

  // ATR and volatility
  const atr = calcATR(candles);
  const atrPercentage = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;

  // RSI
  const rsi = calcRSI(closes);

  // Bollinger Bands width
  const bb = calcBollingerBands(closes);

  // Trend strength: EMA crossover
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const lastEma12 = ema12[ema12.length - 1];
  const lastEma26 = ema26[ema26.length - 1];
  const trendStrength = currentPrice > 0 ? ((lastEma12 - lastEma26) / currentPrice) * 100 : 0;

  // Determine regime
  let regime: MarketRegime;
  let confidence: number;

  const isHighVolatility = bb.width > 0.04; // BB width > 4%
  const isLowVolatility = bb.width < 0.015;

  if (isHighVolatility && atrPercentage > 2) {
    // High volatility environment
    regime = 'volatile';
    confidence = Math.min(bb.width / 0.06, 1);
  } else if (rsi > 60 && trendStrength > 0.1) {
    // Trending up
    regime = 'trending_up';
    confidence = Math.min((rsi - 50) / 30, 1) * Math.min(Math.abs(trendStrength) / 0.5, 1);
  } else if (rsi < 40 && trendStrength < -0.1) {
    // Trending down
    regime = 'trending_down';
    confidence = Math.min((50 - rsi) / 30, 1) * Math.min(Math.abs(trendStrength) / 0.5, 1);
  } else {
    // Range bound
    regime = 'ranging';
    confidence = isLowVolatility ? 0.8 : 0.5;
  }

  logger.debug('市场状态检测', {
    regime,
    confidence: confidence.toFixed(3),
    atrPercentage: atrPercentage.toFixed(3),
    rsi: rsi.toFixed(1),
    bbWidth: bb.width.toFixed(4),
    trendStrength: trendStrength.toFixed(4),
  });

  return {
    regime,
    confidence,
    atr,
    atrPercentage,
    rsi,
    bollingerWidth: bb.width,
    trendStrength,
  };
}
