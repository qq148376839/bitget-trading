/**
 * 技术指标计算
 * ATR, RSI, Bollinger Bands, EMA, MACD
 */

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorResult {
  atr: number;
  rsi: number;
  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;
  bollingerWidth: number;
  ema12: number;
  ema26: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
}

/**
 * EMA（指数移动平均）
 */
export function calcEMA(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const multiplier = 2 / (period + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * multiplier + result[i - 1] * (1 - multiplier));
  }
  return result;
}

/**
 * SMA（简单移动平均）
 */
export function calcSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j];
    }
    result.push(sum / period);
  }
  return result;
}

/**
 * ATR（平均真实波幅）
 * 衡量市场波动率
 */
export function calcATR(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  // Use EMA for ATR
  const atrValues = calcEMA(trueRanges, period);
  return atrValues[atrValues.length - 1] || 0;
}

/**
 * RSI（相对强弱指标）
 * 0-100，>70 超买，<30 超卖
 */
export function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50; // neutral

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // Smoothed
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * 布林带
 * 中轨 = SMA(close, period)
 * 上轨 = 中轨 + stddev * multiplier
 * 下轨 = 中轨 - stddev * multiplier
 */
export function calcBollingerBands(
  closes: number[],
  period = 20,
  multiplier = 2
): { upper: number; middle: number; lower: number; width: number } {
  if (closes.length < period) {
    const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
    return { upper: avg, middle: avg, lower: avg, width: 0 };
  }

  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + (v - middle) ** 2, 0) / period;
  const stddev = Math.sqrt(variance);

  const upper = middle + stddev * multiplier;
  const lower = middle - stddev * multiplier;
  const width = middle > 0 ? (upper - lower) / middle : 0;

  return { upper, middle, lower, width };
}

/**
 * MACD
 * MACD Line = EMA(12) - EMA(26)
 * Signal Line = EMA(9) of MACD Line
 * Histogram = MACD - Signal
 */
export function calcMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { line: number; signal: number; histogram: number } {
  if (closes.length < slowPeriod) {
    return { line: 0, signal: 0, histogram: 0 };
  }

  const emaFast = calcEMA(closes, fastPeriod);
  const emaSlow = calcEMA(closes, slowPeriod);

  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(emaFast[i] - emaSlow[i]);
  }

  const signalLine = calcEMA(macdLine, signalPeriod);

  const line = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];

  return { line, signal, histogram: line - signal };
}

/**
 * 计算所有指标
 */
export function calcAllIndicators(candles: Candle[]): IndicatorResult {
  const closes = candles.map(c => c.close);

  const atr = calcATR(candles);
  const rsi = calcRSI(closes);
  const bb = calcBollingerBands(closes);
  const ema12Values = calcEMA(closes, 12);
  const ema26Values = calcEMA(closes, 26);
  const macd = calcMACD(closes);

  return {
    atr,
    rsi,
    bollingerUpper: bb.upper,
    bollingerMiddle: bb.middle,
    bollingerLower: bb.lower,
    bollingerWidth: bb.width,
    ema12: ema12Values[ema12Values.length - 1] || 0,
    ema26: ema26Values[ema26Values.length - 1] || 0,
    macdLine: macd.line,
    macdSignal: macd.signal,
    macdHistogram: macd.histogram,
  };
}
