/**
 * 认证路由
 * POST /api/auth/login — 登录
 * POST /api/auth/register — 注册（首个用户自动为管理员，之后需管理员权限）
 * GET /api/auth/me — 当前用户信息
 * PUT /api/auth/password — 修改密码
 * GET /api/auth/users — 用户列表（管理员）
 * DELETE /api/auth/users/:id — 删除用户（管理员）
 * PUT /api/auth/users/:id/toggle — 启用/禁用用户（管理员）
 */

import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { authRequired, adminRequired } from '../middleware/auth.middleware';
import { AppError, ErrorCode } from '../utils/errors';

const router = Router();

// 登录 — 无需认证
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '用户名和密码不能为空', undefined, 400);
    }
    const authService = AuthService.getInstance();
    const result = await authService.login(username, password);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// 注册 — 首个用户无需认证，之后需要管理员
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authService = AuthService.getInstance();
    const { username, password, displayName, role } = req.body;

    if (!username || !password) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '用户名和密码不能为空', undefined, 400);
    }

    // Check if there are existing users — if so, require admin auth
    const users = await authService.listUsers();
    if (users.length > 0) {
      // Must be authenticated admin
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AppError(ErrorCode.AUTH_TOKEN_MISSING, '需要管理员权限', undefined, 401);
      }
      const token = authHeader.substring(7);
      const payload = authService.verifyToken(token);
      if (payload.role !== 'admin') {
        throw new AppError(ErrorCode.AUTH_FORBIDDEN, '需要管理员权限', undefined, 403);
      }
    }

    const user = await authService.register(username, password, displayName, role);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// 当前用户信息
router.get('/me', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authService = AuthService.getInstance();
    const user = await authService.getUserById(req.user!.userId);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// 修改密码
router.put('/password', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '原密码和新密码不能为空', undefined, 400);
    }
    if (newPassword.length < 6) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, '密码长度至少 6 位', undefined, 400);
    }
    const authService = AuthService.getInstance();
    await authService.changePassword(req.user!.userId, oldPassword, newPassword);
    res.json({ success: true, data: { message: '密码修改成功' } });
  } catch (error) {
    next(error);
  }
});

// 用户列表（管理员）
router.get('/users', authRequired, adminRequired, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const authService = AuthService.getInstance();
    const users = await authService.listUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

// 删除用户（管理员）
router.delete('/users/:id', authRequired, adminRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authService = AuthService.getInstance();
    await authService.deleteUser(parseInt(req.params.id));
    res.json({ success: true, data: { message: '用户已删除' } });
  } catch (error) {
    next(error);
  }
});

// 启用/禁用用户（管理员）
router.put('/users/:id/toggle', authRequired, adminRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authService = AuthService.getInstance();
    await authService.toggleUserActive(parseInt(req.params.id));
    res.json({ success: true, data: { message: '用户状态已切换' } });
  } catch (error) {
    next(error);
  }
});

export default router;
