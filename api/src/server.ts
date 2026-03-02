/**
 * Bitget Trading API 服务入口
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { createProxyMiddleware } from 'http-proxy-middleware';
import { errorHandler } from './middleware/error-handler';
import { apiRateLimiter } from './middleware/rate-limiter';
import { authRequired } from './middleware/auth.middleware';
import { requestLogger } from './middleware/request-logger';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import systemConfigRouter from './routes/system-config';
import logsRouter from './routes/logs';
import accountRouter from './routes/account';
import ordersRouter from './routes/orders';
import marketRouter from './routes/market';
import strategyRouter from './routes/strategy';
import contractsRouter from './routes/contracts';
import instrumentsRouter from './routes/instruments';
import { StrategyManager } from './strategy/strategy-manager';
import { createLogger } from './utils/logger';
import { getPool } from './config/database';
import { runMigrations } from './config/migration-runner';
import { SystemConfigService } from './services/system-config.service';
import { AuthService } from './services/auth.service';
import { LogService } from './services/log.service';
import { loadBitgetConfigFromDB } from './config/bitget';
import { AccountTypeDetectorService } from './services/account-type-detector.service';

const logger = createLogger('server');
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// 中间件
app.use(cors());
app.use(express.json());
app.use(requestLogger);
app.use('/api', apiRateLimiter);

// 公开路由（无需认证）
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);

// 认证保护的路由
app.use('/api/system-config', authRequired, systemConfigRouter);
app.use('/api/account', authRequired, accountRouter);
app.use('/api/orders', authRequired, ordersRouter);
app.use('/api/market', authRequired, marketRouter);
app.use('/api/strategy', authRequired, strategyRouter);
app.use('/api/contracts', authRequired, contractsRouter);
app.use('/api/instruments', authRequired, instrumentsRouter);
app.use('/api/logs', authRequired, logsRouter);

// === Frontend 代理（生产模式：将非 API 请求代理到 Next.js）===
if (process.env.NODE_ENV === 'production') {
  app.use(
    createProxyMiddleware({
      target: 'http://localhost:3000',
      changeOrigin: true,
      ws: true,
    })
  );
}

// 错误处理
app.use(errorHandler);

// 启动引导
let server: ReturnType<typeof app.listen>;

async function bootstrap(): Promise<void> {
  const pool = getPool();

  // 1. 数据库迁移
  try {
    await runMigrations(pool);
    logger.info('数据库迁移完成');
  } catch (error) {
    logger.error('数据库迁移失败，终止启动', { error: String(error) });
    process.exit(1);
  }

  // 2. 初始化 LogService（DB 持久化）
  LogService.getInstance().setPool(pool);

  // 3. 初始化 SystemConfigService
  try {
    const configService = SystemConfigService.init(pool);
    await configService.loadAll();
    logger.info('SystemConfigService 初始化完成');
  } catch (error) {
    logger.warn('SystemConfigService 初始化失败', { error: String(error) });
  }

  // 4. 从 DB 加载 Bitget API 配置
  try {
    await loadBitgetConfigFromDB();
    logger.info('Bitget 配置已从 DB 加载');
  } catch (error) {
    logger.warn('从 DB 加载 Bitget 配置失败，使用环境变量', { error: String(error) });
  }

  // 5. 初始化 AuthService + 种子默认管理员
  try {
    const authService = AuthService.init(pool);
    await authService.seedDefaultAdmin();
    logger.info('AuthService 初始化完成');
  } catch (error) {
    logger.warn('AuthService 初始化失败', { error: String(error) });
  }

  // 6. 账户类型检测（UTA/经典）
  try {
    const accountType = await AccountTypeDetectorService.getInstance().detect();
    logger.info('账户类型检测完成', { accountType });
  } catch (error) {
    logger.warn('账户类型检测失败', { error: String(error) });
  }

  server = app.listen(PORT, () => {
    logger.info(`Bitget Trading API 已启动`, { port: PORT });
    logger.info(`健康检查: http://localhost:${PORT}/api/health`);
  });
}

bootstrap();

// 优雅关闭
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`收到 ${signal} 信号，开始优雅关闭...`);

  // 停止策略管理器
  try {
    const manager = StrategyManager.getInstance();
    await manager.stopActive();
    logger.info('策略管理器已停止');
  } catch (error) {
    logger.warn('停止策略管理器出错', { error: String(error) });
  }

  server.close(() => {
    logger.info('HTTP 服务已关闭');
    process.exit(0);
  });

  // 10 秒后强制退出
  setTimeout(() => {
    logger.error('无法优雅关闭，强制退出');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
