/**
 * Bitget WebSocket 客户端
 * 公共频道（行情）+ 私有频道（订单推送）
 * 自动重连 + 指数退避 + 心跳 ping/pong
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { getBitgetConfig } from '../config/bitget';
import { createLogger } from '../utils/logger';

const logger = createLogger('ws-client');

const PUBLIC_WS_URL = 'wss://ws.bitget.com/v2/ws/public';
const PRIVATE_WS_URL = 'wss://ws.bitget.com/v2/ws/private';

interface WsSubscription {
  instType: string;
  channel: string;
  instId: string;
}

interface WsMessage {
  event?: string;
  arg?: WsSubscription;
  action?: string;
  data?: unknown[];
  code?: string;
  msg?: string;
}

export class WebSocketClientService extends EventEmitter {
  private static instance: WebSocketClientService | null = null;
  private publicWs: WebSocket | null = null;
  private privateWs: WebSocket | null = null;
  private publicSubscriptions: WsSubscription[] = [];
  private privateSubscriptions: WsSubscription[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isConnected = { public: false, private: false };

  private constructor() {
    super();
  }

  static getInstance(): WebSocketClientService {
    if (!WebSocketClientService.instance) {
      WebSocketClientService.instance = new WebSocketClientService();
    }
    return WebSocketClientService.instance;
  }

  /**
   * 连接公共频道
   */
  connectPublic(): void {
    if (this.publicWs && this.publicWs.readyState === WebSocket.OPEN) return;

    try {
      this.publicWs = new WebSocket(PUBLIC_WS_URL);

      this.publicWs.on('open', () => {
        logger.info('公共 WebSocket 已连接');
        this.isConnected.public = true;
        this.reconnectAttempts = 0;
        this.startPing(this.publicWs!);
        // Re-subscribe
        for (const sub of this.publicSubscriptions) {
          this.sendSubscribe(this.publicWs!, sub);
        }
        this.emit('public:connected');
      });

      this.publicWs.on('message', (data: WebSocket.RawData) => {
        this.handleMessage(data, 'public');
      });

      this.publicWs.on('close', () => {
        logger.warn('公共 WebSocket 断开');
        this.isConnected.public = false;
        this.emit('public:disconnected');
        this.scheduleReconnect('public');
      });

      this.publicWs.on('error', (err) => {
        logger.error('公共 WebSocket 错误', { error: err.message });
      });
    } catch (error) {
      logger.error('公共 WebSocket 连接失败', { error: String(error) });
      this.scheduleReconnect('public');
    }
  }

  /**
   * 连接私有频道
   */
  connectPrivate(): void {
    if (this.privateWs && this.privateWs.readyState === WebSocket.OPEN) return;

    try {
      this.privateWs = new WebSocket(PRIVATE_WS_URL);

      this.privateWs.on('open', () => {
        logger.info('私有 WebSocket 已连接');
        this.authenticatePrivate();
      });

      this.privateWs.on('message', (data: WebSocket.RawData) => {
        this.handleMessage(data, 'private');
      });

      this.privateWs.on('close', () => {
        logger.warn('私有 WebSocket 断开');
        this.isConnected.private = false;
        this.emit('private:disconnected');
        this.scheduleReconnect('private');
      });

      this.privateWs.on('error', (err) => {
        logger.error('私有 WebSocket 错误', { error: err.message });
      });
    } catch (error) {
      logger.error('私有 WebSocket 连接失败', { error: String(error) });
      this.scheduleReconnect('private');
    }
  }

  /**
   * 订阅公共频道
   */
  subscribeTicker(instType: string, instId: string): void {
    const sub: WsSubscription = { instType, channel: 'ticker', instId };
    this.publicSubscriptions.push(sub);
    if (this.publicWs && this.publicWs.readyState === WebSocket.OPEN) {
      this.sendSubscribe(this.publicWs, sub);
    }
  }

  /**
   * 订阅 K线
   */
  subscribeCandles(instType: string, instId: string, interval = '1m'): void {
    const sub: WsSubscription = { instType, channel: `candle${interval}`, instId };
    this.publicSubscriptions.push(sub);
    if (this.publicWs && this.publicWs.readyState === WebSocket.OPEN) {
      this.sendSubscribe(this.publicWs, sub);
    }
  }

  /**
   * 订阅私有订单推送
   */
  subscribeOrders(instType: string, instId: string): void {
    const sub: WsSubscription = { instType, channel: 'orders', instId };
    this.privateSubscriptions.push(sub);
    if (this.privateWs && this.privateWs.readyState === WebSocket.OPEN && this.isConnected.private) {
      this.sendSubscribe(this.privateWs, sub);
    }
  }

  /**
   * 是否已连接
   */
  isPublicConnected(): boolean {
    return this.isConnected.public;
  }

  isPrivateConnected(): boolean {
    return this.isConnected.private;
  }

  /**
   * 关闭所有连接
   */
  disconnect(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.publicWs) {
      this.publicWs.close();
      this.publicWs = null;
    }
    if (this.privateWs) {
      this.privateWs.close();
      this.privateWs = null;
    }
    this.isConnected = { public: false, private: false };
    this.publicSubscriptions = [];
    this.privateSubscriptions = [];
    logger.info('WebSocket 连接已关闭');
  }

  private authenticatePrivate(): void {
    try {
      const config = getBitgetConfig();
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const sign = crypto
        .createHmac('sha256', config.secretKey)
        .update(timestamp + 'GET' + '/user/verify')
        .digest('base64');

      const loginMsg = {
        op: 'login',
        args: [{
          apiKey: config.apiKey,
          passphrase: config.passphrase,
          timestamp,
          sign,
        }],
      };

      this.privateWs!.send(JSON.stringify(loginMsg));
    } catch (error) {
      logger.error('私有 WebSocket 认证失败', { error: String(error) });
    }
  }

  private handleMessage(rawData: WebSocket.RawData, channel: 'public' | 'private'): void {
    try {
      const text = rawData.toString();
      if (text === 'pong') return; // heartbeat response

      const msg: WsMessage = JSON.parse(text);

      // Login response
      if (msg.event === 'login') {
        if (msg.code === '0') {
          logger.info('私有 WebSocket 认证成功');
          this.isConnected.private = true;
          // Re-subscribe private channels
          for (const sub of this.privateSubscriptions) {
            this.sendSubscribe(this.privateWs!, sub);
          }
          this.emit('private:connected');
        } else {
          logger.error('私有 WebSocket 认证失败', { code: msg.code, msg: msg.msg });
        }
        return;
      }

      // Subscription confirmation
      if (msg.event === 'subscribe') {
        logger.debug('订阅确认', { arg: msg.arg });
        return;
      }

      // Data message
      if (msg.arg && msg.data) {
        const eventName = `${channel}:${msg.arg.channel}:${msg.arg.instId}`;
        this.emit(eventName, msg.data, msg.action);
        // Also emit a generic channel event
        this.emit(`${channel}:${msg.arg.channel}`, msg.data, msg.arg.instId, msg.action);
      }
    } catch (error) {
      logger.debug('WebSocket 消息解析失败', { error: String(error) });
    }
  }

  private sendSubscribe(ws: WebSocket, sub: WsSubscription): void {
    const msg = { op: 'subscribe', args: [sub] };
    ws.send(JSON.stringify(msg));
  }

  private startPing(ws: WebSocket): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 25000);
  }

  private scheduleReconnect(channel: 'public' | 'private'): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('WebSocket 重连次数已达上限', { channel });
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
    this.reconnectAttempts++;
    logger.info(`WebSocket ${channel} 将在 ${delay}ms 后重连`, { attempt: this.reconnectAttempts });
    setTimeout(() => {
      if (channel === 'public') this.connectPublic();
      else this.connectPrivate();
    }, delay);
  }
}
