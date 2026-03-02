/**
 * Polymarket 预测市场信号服务
 * Singleton，后台轮询 Gamma API，计算宏观情绪信号
 * 未启用时所有对外接口返回中性默认值
 */

import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createLogger } from '../utils/logger';
import {
  PolymarketSignalConfig,
  PolymarketWatchItem,
  PolymarketMarketData,
  MarketSignalSnapshot,
  MacroSignalSnapshot,
  RiskAdjustment,
  SpreadAdjustment,
  GridAdjustment,
  NEUTRAL_SIGNAL,
  NEUTRAL_RISK_ADJUSTMENT,
  NEUTRAL_SPREAD_ADJUSTMENT,
  NEUTRAL_GRID_ADJUSTMENT,
  DEFAULT_POLYMARKET_CONFIG,
} from '../types/polymarket.types';

const logger = createLogger('polymarket-signal');

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';
const MAX_HISTORY_ENTRIES = 720; // 24h at 120s interval
const ONE_HOUR_MS = 3600_000;
const ONE_DAY_MS = 86400_000;

interface ProbHistoryEntry {
  ts: number;
  prob: number;
}

export class PolymarketSignalService {
  private static instance: PolymarketSignalService | null = null;

  private config: PolymarketSignalConfig = { ...DEFAULT_POLYMARKET_CONFIG };
  private httpClient: AxiosInstance | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private probHistory: Map<string, ProbHistoryEntry[]> = new Map();
  private currentSignal: MacroSignalSnapshot = { ...NEUTRAL_SIGNAL };
  private isPolling = false;

  private constructor() {}

  static getInstance(): PolymarketSignalService {
    if (!PolymarketSignalService.instance) {
      PolymarketSignalService.instance = new PolymarketSignalService();
    }
    return PolymarketSignalService.instance;
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  start(): void {
    if (!this.config.enabled) {
      logger.info('Polymarket 信号服务未启用');
      return;
    }

    this.httpClient = this.createHttpClient();
    this.schedulePoll();
    logger.info('Polymarket 信号服务已启动', {
      pollIntervalMs: this.config.pollIntervalMs,
      watchListCount: this.config.watchList.length,
      proxyConfigured: !!this.config.proxyUrl,
    });
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.httpClient = null;
    this.isPolling = false;
    logger.info('Polymarket 信号服务已停止');
  }

  updateConfig(newConfig: Partial<PolymarketSignalConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...newConfig };

    // 如果 watchList 在新配置中提供，直接使用
    if (newConfig.watchList) {
      this.config.watchList = newConfig.watchList;
    }

    // 状态变更
    if (!wasEnabled && this.config.enabled) {
      this.start();
    } else if (wasEnabled && !this.config.enabled) {
      this.stop();
      this.currentSignal = { ...NEUTRAL_SIGNAL };
    } else if (this.config.enabled) {
      // 重新启动轮询（间隔可能变更）
      this.stop();
      this.start();
    }

    logger.info('Polymarket 配置已更新', {
      enabled: this.config.enabled,
      pollIntervalMs: this.config.pollIntervalMs,
      watchListCount: this.config.watchList.length,
    });
  }

  getConfig(): PolymarketSignalConfig {
    return { ...this.config };
  }

  // ============================================================
  // Public read API (synchronous, from cache)
  // ============================================================

  getSignal(): MacroSignalSnapshot {
    if (!this.config.enabled) {
      return { ...NEUTRAL_SIGNAL };
    }
    return { ...this.currentSignal };
  }

  getRiskAdjustment(): RiskAdjustment {
    if (!this.config.enabled) {
      return { ...NEUTRAL_RISK_ADJUSTMENT };
    }

    const score = this.currentSignal.riskScore;

    if (score < 30) {
      // 低风险 → 放松
      return {
        positionMultiplier: 1.2,
        dailyLossMultiplier: 0.8,
        drawdownMultiplier: 0.9,
        cooldownMultiplier: 0.8,
      };
    } else if (score <= 70) {
      // 中性
      return { ...NEUTRAL_RISK_ADJUSTMENT };
    } else if (score <= 85) {
      // 高风险 → 收紧
      return {
        positionMultiplier: 0.7,
        dailyLossMultiplier: 1.3,
        drawdownMultiplier: 1.2,
        cooldownMultiplier: 1.3,
      };
    } else {
      // 极高风险 → 防御
      return {
        positionMultiplier: 0.5,
        dailyLossMultiplier: 2.0,
        drawdownMultiplier: 1.5,
        cooldownMultiplier: 2.0,
      };
    }
  }

  getSpreadAdjustment(): SpreadAdjustment {
    if (!this.config.enabled) {
      return { ...NEUTRAL_SPREAD_ADJUSTMENT };
    }

    const score = this.currentSignal.riskScore;
    const direction = this.currentSignal.direction;

    let multiplier = 1.0;
    if (score > 70) {
      // 高风险：扩大价差（更保守）
      multiplier = 1.0 + (score - 70) / 100;
    } else if (score < 30) {
      // 低风险：可以稍微缩小价差
      multiplier = 0.9 + score / 300;
    }

    return {
      multiplier: Math.min(multiplier, this.config.maxRiskMultiplier),
      direction,
      riskScore: score,
    };
  }

  getGridAdjustment(): GridAdjustment {
    if (!this.config.enabled) {
      return { ...NEUTRAL_GRID_ADJUSTMENT };
    }

    const score = this.currentSignal.riskScore;

    let widthMultiplier = 1.0;
    let rebalanceSensitivity = 1.0;

    if (score > 70) {
      // 高风险：扩大网格宽度，降低再平衡灵敏度
      widthMultiplier = 1.0 + (score - 70) / 100;
      rebalanceSensitivity = 0.7;
    } else if (score < 30) {
      // 低风险：缩小网格宽度，提高再平衡灵敏度
      widthMultiplier = 0.9;
      rebalanceSensitivity = 1.3;
    }

    return {
      widthMultiplier: Math.min(widthMultiplier, this.config.maxRiskMultiplier),
      rebalanceSensitivity,
      riskScore: score,
    };
  }

  // ============================================================
  // Polling
  // ============================================================

  async pollNow(): Promise<MacroSignalSnapshot> {
    await this.pollAllMarkets();
    return this.getSignal();
  }

  private schedulePoll(): void {
    // 立即执行一次
    this.pollAllMarkets().catch(err => {
      logger.warn('首次轮询失败', { error: String(err) });
    });

    this.pollTimer = setInterval(() => {
      this.pollAllMarkets().catch(err => {
        logger.warn('定时轮询失败', { error: String(err) });
      });
    }, this.config.pollIntervalMs);
  }

  private async pollAllMarkets(): Promise<void> {
    if (this.isPolling || !this.config.enabled) return;
    this.isPolling = true;

    try {
      const snapshots: MarketSignalSnapshot[] = [];

      for (const item of this.config.watchList) {
        try {
          const snapshot = await this.fetchMarketData(item);
          if (snapshot) {
            snapshots.push(snapshot);
          }
        } catch (err) {
          logger.warn('获取单个市场数据失败', {
            conditionId: item.conditionId,
            label: item.label,
            error: String(err),
          });
        }
      }

      this.currentSignal = this.computeSignal(snapshots);
    } finally {
      this.isPolling = false;
    }
  }

  private async fetchMarketData(item: PolymarketWatchItem): Promise<MarketSignalSnapshot | null> {
    if (!this.httpClient || !item.conditionId) return null;

    const response = await this.httpClient.get('/markets', {
      params: { condition_id: item.conditionId },
      timeout: 15000,
    });

    const markets: PolymarketMarketData[] = Array.isArray(response.data)
      ? response.data
      : [response.data];

    if (markets.length === 0) {
      logger.debug('未找到市场数据', { conditionId: item.conditionId });
      return null;
    }

    const market = markets[0];
    if (!market || market.closed) {
      return null;
    }

    // 解析 outcome_prices: "[\"0.65\",\"0.35\"]"
    let currentProb = 0;
    try {
      const prices = JSON.parse(market.outcome_prices) as string[];
      currentProb = parseFloat(prices[0]) || 0;
    } catch {
      logger.warn('解析 outcome_prices 失败', {
        conditionId: item.conditionId,
        raw: market.outcome_prices,
      });
      return null;
    }

    // 记录历史
    const now = Date.now();
    this.recordProbHistory(item.conditionId, now, currentProb);

    // 计算 delta
    const delta1h = this.calculateDelta(item.conditionId, now, ONE_HOUR_MS);
    const delta24h = this.calculateDelta(item.conditionId, now, ONE_DAY_MS);

    // 告警检测
    const alertTriggered = Math.abs(delta1h * 100) >= item.deltaThresholdPercent;

    return {
      conditionId: item.conditionId,
      label: item.label,
      category: item.category,
      currentProb,
      delta1h,
      delta24h,
      volume: market.volume_num || 0,
      alertTriggered,
      lastUpdated: now,
    };
  }

  // ============================================================
  // Probability history tracking
  // ============================================================

  private recordProbHistory(conditionId: string, ts: number, prob: number): void {
    let history = this.probHistory.get(conditionId);
    if (!history) {
      history = [];
      this.probHistory.set(conditionId, history);
    }

    history.push({ ts, prob });

    // 保持滚动窗口
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.splice(0, history.length - MAX_HISTORY_ENTRIES);
    }
  }

  private calculateDelta(conditionId: string, now: number, windowMs: number): number {
    const history = this.probHistory.get(conditionId);
    if (!history || history.length < 2) return 0;

    const targetTs = now - windowMs;
    // 找到最接近 targetTs 的历史记录
    let closest: ProbHistoryEntry | null = null;
    let minDiff = Infinity;

    for (const entry of history) {
      const diff = Math.abs(entry.ts - targetTs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = entry;
      }
    }

    if (!closest) return 0;

    // 如果最近的记录距离目标时间超过窗口的 50%，数据不足
    if (minDiff > windowMs * 0.5) return 0;

    const current = history[history.length - 1];
    return current.prob - closest.prob;
  }

  // ============================================================
  // Signal computation
  // ============================================================

  private computeSignal(snapshots: MarketSignalSnapshot[]): MacroSignalSnapshot {
    const now = Date.now();

    if (snapshots.length === 0) {
      return {
        riskScore: 50,
        direction: 'neutral',
        confidence: 0,
        hasAlert: false,
        markets: [],
        lastPollAt: now,
        enabled: this.config.enabled,
      };
    }

    let riskScore = 50; // 基线
    const sensitivity = this.config.sensitivityMultiplier;

    for (const snapshot of snapshots) {
      const item = this.config.watchList.find(w => w.conditionId === snapshot.conditionId);
      if (!item) continue;

      const weightedDelta = snapshot.delta1h * item.weight * sensitivity * 100;

      if (item.impactDirection === 'bearish') {
        // 概率上升（如加息概率）→ 风险增加
        riskScore += weightedDelta;
      } else {
        // 概率上升（如 BTC 突破）→ 风险降低
        riskScore -= weightedDelta;
      }
    }

    // Clamp 0-100
    riskScore = Math.max(0, Math.min(100, riskScore));

    // 判定方向
    let direction: 'bullish' | 'bearish' | 'neutral';
    if (riskScore < 40) {
      direction = 'bullish';
    } else if (riskScore > 60) {
      direction = 'bearish';
    } else {
      direction = 'neutral';
    }

    // 信心度：基于监控市场数量和数据完整度
    const totalWeight = this.config.watchList.reduce((s, w) => s + w.weight, 0);
    const dataWeight = snapshots.reduce((s, snap) => {
      const item = this.config.watchList.find(w => w.conditionId === snap.conditionId);
      return s + (item?.weight || 0);
    }, 0);
    const confidence = totalWeight > 0 ? dataWeight / totalWeight : 0;

    const hasAlert = snapshots.some(s => s.alertTriggered);

    return {
      riskScore: Math.round(riskScore * 10) / 10,
      direction,
      confidence: Math.round(confidence * 100) / 100,
      hasAlert,
      markets: snapshots,
      lastPollAt: now,
      enabled: this.config.enabled,
    };
  }

  // ============================================================
  // Market search (proxy through to Gamma API)
  // ============================================================

  async searchMarkets(query: string): Promise<Array<{
    conditionId: string;
    question: string;
    volume: number;
    active: boolean;
    outcomePrices: string[];
  }>> {
    if (!this.httpClient) {
      this.httpClient = this.createHttpClient();
    }

    const response = await this.httpClient.get('/markets', {
      params: {
        _limit: 20,
        active: true,
        closed: false,
        ...(query ? { tag_slug: query } : {}),
      },
      timeout: 15000,
    });

    const markets: PolymarketMarketData[] = Array.isArray(response.data)
      ? response.data
      : [];

    // 如果 tag_slug 没结果，尝试用 question 搜索
    if (markets.length === 0 && query) {
      const fallbackResponse = await this.httpClient.get('/markets', {
        params: {
          _limit: 20,
          active: true,
          closed: false,
        },
        timeout: 15000,
      });
      const allMarkets: PolymarketMarketData[] = Array.isArray(fallbackResponse.data)
        ? fallbackResponse.data
        : [];
      const queryLower = query.toLowerCase();
      return allMarkets
        .filter(m => m.question.toLowerCase().includes(queryLower))
        .map(m => ({
          conditionId: m.condition_id,
          question: m.question,
          volume: m.volume_num || 0,
          active: m.active,
          outcomePrices: this.parseOutcomePrices(m.outcome_prices),
        }));
    }

    return markets.map(m => ({
      conditionId: m.condition_id,
      question: m.question,
      volume: m.volume_num || 0,
      active: m.active,
      outcomePrices: this.parseOutcomePrices(m.outcome_prices),
    }));
  }

  private parseOutcomePrices(raw: string): string[] {
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  // ============================================================
  // HTTP client
  // ============================================================

  private createHttpClient(): AxiosInstance {
    const clientConfig: Record<string, unknown> = {
      baseURL: GAMMA_API_BASE,
      timeout: 15000,
      headers: {
        'Accept': 'application/json',
      },
    };

    if (this.config.proxyUrl) {
      const agent = new HttpsProxyAgent(this.config.proxyUrl);
      clientConfig.httpAgent = agent;
      clientConfig.httpsAgent = agent;
    }

    return axios.create(clientConfig);
  }
}
