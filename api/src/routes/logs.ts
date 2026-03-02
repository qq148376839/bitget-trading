/**
 * 日志查询路由
 * GET /api/logs — 分页查询日志
 * PUT /api/logs/level — 运行时修改日志级别
 * DELETE /api/logs/cleanup — 手动清理旧日志
 */

import { Router, Request, Response, NextFunction } from 'express';
import { LogService } from '../services/log.service';
import { setLogLevel, getLogLevel, LogLevel } from '../utils/logger';

const router = Router();

// 查询日志
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const logService = LogService.getInstance();
    const result = await logService.queryLogs({
      level: req.query.level as string | undefined,
      module: req.query.module as string | undefined,
      keyword: req.query.keyword as string | undefined,
      correlationId: req.query.correlationId as string | undefined,
      startTime: req.query.startTime as string | undefined,
      endTime: req.query.endTime as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// 修改日志级别
router.put('/level', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { level } = req.body;
    const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    if (!level || !validLevels.includes(level)) {
      res.status(400).json({ success: false, error: { message: `无效级别，可选: ${validLevels.join(', ')}` } });
      return;
    }
    setLogLevel(level as LogLevel);
    res.json({ success: true, data: { level, message: `日志级别已设为 ${level}` } });
  } catch (error) {
    next(error);
  }
});

// 获取当前日志级别
router.get('/level', (_req: Request, res: Response) => {
  res.json({ success: true, data: { level: getLogLevel() } });
});

// 清理旧日志
router.delete('/cleanup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 7;
    const logService = LogService.getInstance();
    const deleted = await logService.cleanup(days);
    res.json({ success: true, data: { deleted, message: `已清理 ${deleted} 条日志` } });
  } catch (error) {
    next(error);
  }
});

export default router;
