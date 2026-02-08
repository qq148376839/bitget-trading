/**
 * Bitget API 客户端封装
 * 负责认证签名、请求发送、错误处理
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import { getBitgetConfig, BitgetConfig } from '../config/bitget';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('bitget-client');

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
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
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

    return {
      'ACCESS-KEY': this.config.apiKey,
      'ACCESS-SIGN': signature,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': this.config.passphrase,
      'Content-Type': 'application/json',
      'locale': 'zh-CN',
    };
  }

  /**
   * 发送 GET 请求（私有接口）
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<BitgetResponse<T>> {
    const queryString = params
      ? '?' + new URLSearchParams(params).toString()
      : '';
    const requestPath = path + queryString;
    const headers = this.getAuthHeaders('GET', requestPath, '');

    try {
      const response = await this.client.get<BitgetResponse<T>>(requestPath, { headers });
      this.checkResponse(response.data);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'GET', path);
    }
  }

  /**
   * 发送 POST 请求（私有接口）
   */
  async post<T>(path: string, data: Record<string, unknown>): Promise<BitgetResponse<T>> {
    const body = JSON.stringify(data);
    const headers = this.getAuthHeaders('POST', path, body);

    try {
      const response = await this.client.post<BitgetResponse<T>>(path, data, { headers });
      this.checkResponse(response.data);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'POST', path);
    }
  }

  /**
   * 发送 GET 请求（公共接口，无需签名）
   */
  async publicGet<T>(path: string, params?: Record<string, string>): Promise<BitgetResponse<T>> {
    const config: AxiosRequestConfig = {};
    if (params) {
      config.params = params;
    }

    try {
      const response = await this.client.get<BitgetResponse<T>>(path, config);
      this.checkResponse(response.data);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'GET', path);
    }
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
