/**
 * 请求日志中间件
 * 为每个请求生成 correlationId，记录 method/path/status/duration
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logContext, createLogger } from '../utils/logger';

const logger = createLogger('http');

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  const startTime = Date.now();

  // Set correlation ID in response header
  res.setHeader('x-correlation-id', correlationId);

  // Run the rest of the middleware chain with correlation context
  logContext.run({ correlationId }, () => {
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const level = res.statusCode >= 400 ? 'warn' : 'info';
      logger[level](`${req.method} ${req.path} ${res.statusCode}`, {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        correlationId,
      });
    });
    next();
  });
}
