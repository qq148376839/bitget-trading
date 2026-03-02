/**
 * JWT 认证中间件
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService, JwtPayload } from '../services/auth.service';
import { AppError, ErrorCode } from '../utils/errors';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * 要求认证的中间件
 * 从 Authorization: Bearer <token> 提取 JWT，验证后挂载到 req.user
 */
export function authRequired(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(ErrorCode.AUTH_TOKEN_MISSING, '未提供认证 Token', undefined, 401);
  }

  const token = authHeader.substring(7);
  const authService = AuthService.getInstance();
  req.user = authService.verifyToken(token);
  next();
}

/**
 * 要求管理员权限
 */
export function adminRequired(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    throw new AppError(ErrorCode.AUTH_FORBIDDEN, '需要管理员权限', undefined, 403);
  }
  next();
}
