# 更新日志

## 2026-02-09
### v2.0 策略傻瓜化重构（4 阶段完成）
**feat**: 多策略架构 + 网格策略 + 现货支持 + 配置向导

**Phase 1 — 核心抽象层**:
1. 统一交易类型抽象（`trading.types.ts`）— 屏蔽合约/现货差异
2. 服务接口层（`IOrderService`, `IMarketDataService`, `IAccountService`）
3. 适配器层（合约 6 个 + 现货 3 个适配器）
4. 服务工厂（`TradingServiceFactory` — 根据交易类型创建服务组合）
5. 策略接口（`IStrategy`）+ 策略管理器（`StrategyManager` Singleton）
6. 重构剥头皮引擎 — 依赖注入替代直接 new，移除 Singleton
7. 数据库迁移 003 — `strategy_type` + `trading_type` 字段

**Phase 2 — 网格策略 + 现货 + 交易对选择**:
1. 网格策略引擎（`GridStrategyEngine` — 等差/等比网格）
2. 网格位管理器（`GridLevelManager` — 状态机 + 订单映射）
3. 现货/合约规格服务（`InstrumentSpecService` 门面 + 三层缓存）
4. 交易对 API（搜索/热门列表/规格查询）
5. 前端：交易对选择器（搜索 + 热门快选 + 分类浏览）
6. 前端：策略选择器（卡片式 — 剥头皮 vs 网格）
7. 前端：网格配置表单（价格区间 + 网格预览 + 费用估算）
8. 数据库迁移 004 — `spot_specs` + `grid_levels` 表

**Phase 3 — 配置傻瓜化 + 动态参数**:
1. 风险等级预设（保守/均衡/激进 3 档）
2. 自动计算引擎（`AutoCalcService` — 4 参数 → 完整配置 + 推导过程）
3. 配置向导（`ConfigWizard` — 简单/高级模式切换）
4. 简单模式表单（步骤式：策略→交易类型→交易对→金额+风险等级）
5. 参数动态边界（`useParameterBounds` — 实时 min/max）
6. 新增 API：`POST /api/strategy/auto-calc`, `GET /api/strategy/bounds`

**文件统计**: 32 新建 + 19 修改 = 51 文件

### tradeSide 参数修复 + post_only 自适应
**fix**: 修复合约下单 tradeSide 参数导致的系列错误
1. 持仓模式检测
   - 修正 API 端点从 `/api/v2/mix/account/account` 改为 `/api/v2/mix/account/position-mode`
   - 解析 `posMode: 'hedge_mode' | 'one_way_mode'`
   - 模拟盘返回 404 时默认双向持仓（`double_hold`）— 确保 tradeSide 始终发送
2. tradeSide 参数修复
   - 买单：双向持仓始终发送 `tradeSide: 'open'`（已验证可用）
   - 卖单：7 次重试（递增等待 + 最后一次用 market 单强制平仓）
   - Bitget 错误码提取 — 从 `AppError.details.data.code` 读取（非 `String(error)`）
3. post_only 自适应机制
   - 自适应价格偏移（基础 2 tick，每连续被撤 +1 tick，最大 10 tick）
   - 连续 post_only 被撤 5 次后自动切换 GTC（normal）模式
   - 买单成交后重置计数器
   - 增加 ask1 诊断日志
4. 手续费公式修正
   - `minPriceSpread = price × (makerFeeRate + takerFeeRate)`（非 `2 × makerFeeRate`）
5. 请求体日志 — `futures-order.service.ts` 记录完整 JSON body

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
