/**
 * Bitget Trading API 服务入口
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { errorHandler } from './middleware/error-handler';
import { apiRateLimiter } from './middleware/rate-limiter';
import healthRouter from './routes/health';
import accountRouter from './routes/account';
import ordersRouter from './routes/orders';
import marketRouter from './routes/market';
import strategyRouter from './routes/strategy';
import { ScalpingStrategyEngine } from './strategy/scalping-strategy.engine';
import { createLogger } from './utils/logger';

const logger = createLogger('server');
const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// 中间件
app.use(cors());
app.use(express.json());
app.use('/api', apiRateLimiter);

// 路由
app.use('/api/health', healthRouter);
app.use('/api/account', accountRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/market', marketRouter);
app.use('/api/strategy', strategyRouter);

// 错误处理
app.use(errorHandler);

// 启动服务
const server = app.listen(PORT, () => {
  logger.info(`Bitget Trading API 已启动`, { port: PORT });
  logger.info(`健康检查: http://localhost:${PORT}/api/health`);
});

// 优雅关闭
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`收到 ${signal} 信号，开始优雅关闭...`);

  // 停止策略引擎
  try {
    const engine = ScalpingStrategyEngine.getInstance();
    await engine.stop();
    logger.info('策略引擎已停止');
  } catch (error) {
    logger.warn('停止策略引擎出错', { error: String(error) });
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
