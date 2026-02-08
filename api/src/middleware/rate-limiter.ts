/**
 * API 限流中间件
 */

import rateLimit from 'express-rate-limit';

/**
 * 通用 API 限流
 * 每分钟最多 100 次请求
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: '请求频率过高，请稍后再试',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
