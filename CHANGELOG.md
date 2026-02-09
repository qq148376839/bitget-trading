# 更新日志

## 2026-02-09
### 模拟盘适配 + 账户余额修复
**fix**: 修复模拟盘 API 调用和账户余额显示问题
**实现内容**:
1. 模拟盘 API 适配
   - Bitget 客户端支持模拟盘请求头 `paptrading: 1`
   - 新增 `BITGET_SIMULATED` 环境变量控制模拟盘/实盘切换
   - 修正默认 `productType` 从 `SUSDT-FUTURES` 改为 `USDT-FUTURES`（模拟盘通过请求头区分）
2. 账户余额分类展示
   - 策略状态 API 并行获取现货 + 合约余额
   - 现货余额调用 `GET /api/v2/spot/account/assets`
   - 合约余额调用 `GET /api/v2/mix/account/accounts`
   - 新增 `GET /api/account/all-balances` 调试端点
3. 前端仪表盘改版
   - 新增「现货余额」「合约余额」独立卡片
   - 8 个指标卡片重新布局

## 2026-02-08
### 前端策略面板 + Docker 部署
**feat**: 新增 Next.js 14 策略仪表盘前端和 Docker Compose 部署
**实现内容**:
1. Next.js 14 + Ant Design 5 策略仪表盘
   - 策略控制面板（启动/停止/紧急停止）
   - 6 个关键指标卡片（PnL、胜率、持仓等）
   - 订单追踪表格（状态筛选、分页）
   - 事件日志（实时滚动）
   - 运行时配置编辑器
   - SWR 轮询（2-3 秒间隔）
2. Docker Compose 部署
   - nginx 反向代理（端口 80）
   - API 容器（多阶段构建）
   - 前端容器（standalone 模式）
   - PostgreSQL 16 + 数据持久化
   - 自动运行数据库迁移

### 合约策略引擎
**feat**: 新增 USDT 合约 Maker 剥头皮策略
**实现内容**:
1. 合约 API 服务（行情、订单、账户）
2. 策略引擎（状态机 + 双循环架构）
3. 风控系统（回撤、止损、日亏限制、冷却）
4. 挂单合并引擎（加权平均价）
5. 策略控制 REST API（8 个端点）
6. 数据库迁移脚本（4 张表）

### 项目初始化
**feat**: 创建 Bitget 加密货币量化交易系统项目骨架
**实现内容**:
1. 项目目录结构搭建
2. 10 个 Claude Code agents 创建（从长桥交易系统改编）
3. 后端 API 基础代码骨架
4. Bitget API 客户端封装
5. 项目文档初始化
