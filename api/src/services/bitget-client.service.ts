/**
 * Bitget API 客户端封装
 * 负责认证签名、请求发送、错误处理
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getBitgetConfig, BitgetConfig } from '../config/bitget';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('bitget-client');

/** 可重试的网络错误码 */
const RETRYABLE_CODES = new Set([
  'ECONNABORTED',  // 超时
  'ECONNRESET',    // 连接重置（SNI 阻断 / 代理不稳定）
  'ECONNREFUSED',  // 连接拒绝
  'ETIMEDOUT',     // 连接超时
  'EPIPE',         // 管道断开
  'ERR_SOCKET_CONNECTION_TIMEOUT',
  'EAI_AGAIN',     // DNS 临时失败
]);

const MAX_RETRIES = 3;
const RETRY_DELAYS = [500, 1000, 2000]; // ms

export interface BitgetResponse<T = unknown> {
  code: string;
  msg: string;
  requestTime: number;
  data: T;
}

export class BitgetClientService {
  private static instance: BitgetClientService | null = null;
  private client: AxiosInstance;
  private config: BitgetConfig;

  private constructor() {
    this.config = getBitgetConfig();
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    const axiosConfig: AxiosRequestConfig = {
      baseURL: this.config.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    if (proxyUrl) {
      const agent = new HttpsProxyAgent(proxyUrl);
      axiosConfig.httpAgent = agent;
      axiosConfig.httpsAgent = agent;
      axiosConfig.proxy = false; // 禁用 axios 内置代理，使用 agent
      logger.info('已配置 HTTPS 代理', { proxyUrl });
    }
    this.client = axios.create(axiosConfig);
  }

  static getInstance(): BitgetClientService {
    if (!BitgetClientService.instance) {
      BitgetClientService.instance = new BitgetClientService();
    }
    return BitgetClientService.instance;
  }

  static clearInstance(): void {
    BitgetClientService.instance = null;
  }

  /**
   * 生成 HMAC-SHA256 签名
   */
  private sign(timestamp: string, method: string, requestPath: string, body: string): string {
    const prehash = timestamp + method.toUpperCase() + requestPath + body;
    return crypto
      .createHmac('sha256', this.config.secretKey)
      .update(prehash)
      .digest('base64');
  }

  /**
   * 构建认证请求头
   */
  private getAuthHeaders(method: string, requestPath: string, body: string): Record<string, string> {
    const timestamp = Date.now().toString();
    const signature = this.sign(timestamp, method, requestPath, body);

    const headers: Record<string, string> = {
      'ACCESS-KEY': this.config.apiKey,
      'ACCESS-SIGN': signature,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': this.config.passphrase,
      'Content-Type': 'application/json',
      'locale': 'zh-CN',
    };

    if (this.config.simulated) {
      headers['paptrading'] = '1';
    }

    return headers;
  }

  /**
   * 发送 GET 请求（私有接口）
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<BitgetResponse<T>> {
    const queryString = params
      ? '?' + new URLSearchParams(params).toString()
      : '';
    const requestPath = path + queryString;

    return this.withRetry('GET', path, async () => {
      // 每次重试重新签名（timestamp 不能过旧）
      const headers = this.getAuthHeaders('GET', requestPath, '');
      const response = await this.client.get<BitgetResponse<T>>(requestPath, { headers });
      this.checkResponse(response.data);
      return response.data;
    });
  }

  /**
   * 发送 POST 请求（私有接口）
   */
  async post<T>(path: string, data: Record<string, unknown>): Promise<BitgetResponse<T>> {
    const body = JSON.stringify(data);

    return this.withRetry('POST', path, async () => {
      const headers = this.getAuthHeaders('POST', path, body);
      const response = await this.client.post<BitgetResponse<T>>(path, data, { headers });
      this.checkResponse(response.data);
      return response.data;
    });
  }

  /**
   * 发送 GET 请求（公共接口，无需签名）
   */
  async publicGet<T>(path: string, params?: Record<string, string>): Promise<BitgetResponse<T>> {
    const config: AxiosRequestConfig = {};
    if (params) {
      config.params = params;
    }

    return this.withRetry('GET', path, async () => {
      const response = await this.client.get<BitgetResponse<T>>(path, config);
      this.checkResponse(response.data);
      return response.data;
    });
  }

  /**
   * 网络层自动重试：仅对网络错误（超时/RESET/REFUSED）重试
   * 业务错误（4xx 等）不重试，直接抛出
   */
  private async withRetry<T>(method: string, path: string, fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        // 只对网络错误重试
        if (!this.isRetryable(error) || attempt >= MAX_RETRIES) {
          throw this.handleError(error, method, path);
        }
        const delay = RETRY_DELAYS[attempt] ?? 2000;
        logger.warn(`网络错误，${delay}ms 后重试 (${attempt + 1}/${MAX_RETRIES})`, {
          method, path,
          error: axios.isAxiosError(error) ? error.code || error.message : String(error),
        });
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw this.handleError(lastError, method, path);
  }

  /**
   * 判断错误是否可重试（仅网络层错误）
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof AppError) return false; // 业务错误不重试
    if (axios.isAxiosError(error)) {
      // 有 HTTP 响应的不重试（4xx/5xx 等业务错误）
      if (error.response) return false;
      // 纯网络错误：超时、连接重置等
      if (error.code && RETRYABLE_CODES.has(error.code)) return true;
      // axios 超时
      if (error.message?.includes('timeout')) return true;
      // ECONNRESET 在 message 中
      if (error.message?.includes('ECONNRESET')) return true;
    }
    return false;
  }

  /**
   * 检查 Bitget API 响应
   */
  private checkResponse(response: BitgetResponse): void {
    if (response.code !== '00000') {
      logger.warn('Bitget API 返回错误', {
        code: response.code,
        msg: response.msg,
      });
      throw new AppError(
        ErrorCode.BITGET_API_ERROR,
        `Bitget API 错误: [${response.code}] ${response.msg}`,
        { bitgetCode: response.code, bitgetMsg: response.msg },
        400
      );
    }
  }

  /**
   * 统一错误处理
   */
  private handleError(error: unknown, method: string, path: string): AppError {
    if (error instanceof AppError) return error;

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;

      logger.error(`Bitget API 请求失败: ${method} ${path}`, {
        status,
        message: error.message,
        data,
      });

      if (status === 429) {
        return new AppError(
          ErrorCode.BITGET_RATE_LIMIT,
          'Bitget API 限频，请稍后再试',
          { method, path },
          429
        );
      }

      if (status === 401 || status === 403) {
        return new AppError(
          ErrorCode.BITGET_AUTH_ERROR,
          'Bitget API 认证失败，请检查 APIKey/SecretKey/Passphrase',
          { method, path, status },
          401
        );
      }

      if (error.code === 'ECONNABORTED') {
        return new AppError(
          ErrorCode.BITGET_TIMEOUT,
          'Bitget API 请求超时',
          { method, path },
          504
        );
      }

      return new AppError(
        ErrorCode.BITGET_API_ERROR,
        `Bitget API 请求失败: ${error.message}`,
        { method, path, status, data },
        status || 500
      );
    }

    return new AppError(
      ErrorCode.INTERNAL_ERROR,
      '未知错误',
      { method, path, error: String(error) }
    );
  }
}
