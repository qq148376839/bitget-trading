/**
 * 认证服务
 * 密码 bcrypt hash、JWT 签发/验证、用户 CRUD
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { AppError, ErrorCode } from '../utils/errors';
import { createLogger } from '../utils/logger';

const logger = createLogger('auth-service');

const JWT_SECRET = process.env.JWT_SECRET || 'bitget-trading-jwt-secret-change-me';
const JWT_EXPIRES_IN_SECONDS = parseInt(process.env.JWT_EXPIRES_IN_SECONDS || '604800', 10); // 7 days
const BCRYPT_ROUNDS = 10;

export interface UserRecord {
  id: number;
  username: string;
  display_name: string | null;
  role: 'admin' | 'user';
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface JwtPayload {
  userId: number;
  username: string;
  role: 'admin' | 'user';
}

export class AuthService {
  private static instance: AuthService | null = null;
  private pool: Pool;

  private constructor(pool: Pool) {
    this.pool = pool;
  }

  static init(pool: Pool): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService(pool);
    }
    return AuthService.instance;
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      throw new Error('AuthService not initialized. Call init(pool) first.');
    }
    return AuthService.instance;
  }

  /**
   * 登录
   */
  async login(username: string, password: string): Promise<{ token: string; user: UserRecord }> {
    const result = await this.pool.query(
      'SELECT id, username, password_hash, display_name, role, is_active, last_login_at, created_at FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS, '用户名或密码错误', undefined, 401);
    }

    const row = result.rows[0];
    if (!row.is_active) {
      throw new AppError(ErrorCode.AUTH_ACCOUNT_DISABLED, '账户已禁用', undefined, 403);
    }

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS, '用户名或密码错误', undefined, 401);
    }

    // Update last login
    await this.pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [row.id]
    );

    const payload: JwtPayload = {
      userId: row.id,
      username: row.username,
      role: row.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN_SECONDS });

    const user: UserRecord = {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      role: row.role,
      is_active: row.is_active,
      last_login_at: new Date().toISOString(),
      created_at: row.created_at,
    };

    logger.info('用户登录成功', { username });
    return { token, user };
  }

  /**
   * 验证 JWT token
   */
  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
      throw new AppError(ErrorCode.AUTH_TOKEN_INVALID, 'Token 无效或已过期', undefined, 401);
    }
  }

  /**
   * 注册用户（首个用户自动为管理员）
   */
  async register(
    username: string,
    password: string,
    displayName?: string,
    role?: 'admin' | 'user'
  ): Promise<UserRecord> {
    // Check if first user
    const countResult = await this.pool.query('SELECT COUNT(*) FROM users');
    const isFirst = parseInt(countResult.rows[0].count) === 0;
    const finalRole = isFirst ? 'admin' : (role || 'user');

    // Check duplicate
    const existing = await this.pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      throw new AppError(ErrorCode.AUTH_USER_EXISTS, '用户名已存在', undefined, 409);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await this.pool.query(
      `INSERT INTO users (username, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, display_name, role, is_active, last_login_at, created_at`,
      [username, passwordHash, displayName || username, finalRole]
    );

    logger.info('用户注册成功', { username, role: finalRole, isFirst });
    return result.rows[0];
  }

  /**
   * 修改密码
   */
  async changePassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
    const result = await this.pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, '用户不存在', undefined, 404);
    }

    const valid = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
    if (!valid) {
      throw new AppError(ErrorCode.AUTH_INVALID_CREDENTIALS, '原密码错误', undefined, 401);
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, userId]
    );

    logger.info('密码已修改', { userId });
  }

  /**
   * 获取用户列表
   */
  async listUsers(): Promise<UserRecord[]> {
    const result = await this.pool.query(
      'SELECT id, username, display_name, role, is_active, last_login_at, created_at FROM users ORDER BY id'
    );
    return result.rows;
  }

  /**
   * 删除用户
   */
  async deleteUser(userId: number): Promise<void> {
    await this.pool.query('DELETE FROM users WHERE id = $1', [userId]);
    logger.info('用户已删除', { userId });
  }

  /**
   * 切换用户状态
   */
  async toggleUserActive(userId: number): Promise<void> {
    await this.pool.query(
      'UPDATE users SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1',
      [userId]
    );
  }

  /**
   * 种子默认管理员（首次启动时）
   */
  async seedDefaultAdmin(): Promise<void> {
    const countResult = await this.pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(countResult.rows[0].count) > 0) return;

    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    await this.register('admin', defaultPassword, '管理员', 'admin');
    logger.info('已创建默认管理员 admin');
  }

  /**
   * 获取当前用户信息
   */
  async getUserById(userId: number): Promise<UserRecord | null> {
    const result = await this.pool.query(
      'SELECT id, username, display_name, role, is_active, last_login_at, created_at FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }
}
