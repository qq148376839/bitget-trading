# Bitget 加密货币量化交易系统 — 项目上下文

## 项目概述
- 加密货币量化交易系统：Node.js + TypeScript + PostgreSQL + Next.js 14
- 交易 API：Bitget REST API v2 + Bitget WebSocket API
- SDK：bitget-api-node-sdk（通过 axios 封装调用）
- 包管理：pnpm | 测试：Jest + ts-jest | 部署：Docker
- 策略：剥头皮（Scalping）+ 网格（Grid）
- 交易类型：合约（Futures）+ 现货（Spot）

## 目录结构
```
api/src/routes/           → API 路由层
api/src/services/         → 业务逻辑层（现货 + 合约）
api/src/services/interfaces/ → 统一服务接口（IOrderService, IMarketDataService, IAccountService）
api/src/services/adapters/   → 合约/现货适配器（6 个适配器）
api/src/strategy/         → 策略引擎（剥头皮 + 网格）
api/src/strategy/interfaces/ → 策略接口（IStrategy）
api/src/strategy/presets/    → 风险等级预设
api/src/types/            → TypeScript 类型定义
api/src/utils/            → 工具模块
api/src/config/           → 配置层（Bitget SDK 初始化、数据库连接、迁移）
api/src/middleware/        → 中间件（错误处理、限流）
api/migrations/           → 数据库迁移脚本（4 个）
api/scripts/              → 启动脚本（迁移 + 启动）
frontend/app/             → Next.js 14 App Router
frontend/components/      → React 组件（11 个：向导、选择器、表单、面板）
frontend/hooks/           → SWR 数据钩子（8 个：状态、PnL、订单、事件、规格、搜索、计算、边界）
frontend/lib/             → 工具库（API 客户端、类型、常量、格式化）
nginx/                    → 反向代理配置
docker-compose.yml        → Docker 服务编排
docs/                     → 项目文档
.claude/agents/           → Claude Code agent 定义
```

## Bitget API 配置
- 基础 URL：https://api.bitget.com
- 认证方式：APIKey + SecretKey + Passphrase
- 请求头：ACCESS-KEY, ACCESS-SIGN, ACCESS-PASSPHRASE, ACCESS-TIMESTAMP
- 模拟盘：请求头添加 `paptrading: 1`，通过 `BITGET_SIMULATED=1` 环境变量控制
- 签名算法：HMAC-SHA256（timestamp + method + requestPath + body）
- API 限频：现货交易 10 次/秒/UID，行情查询 20 次/秒/IP
- 模拟盘注意事项：
  - productType 统一使用 `USDT-FUTURES`（非 `SUSDT-FUTURES`）
  - 模拟盘/实盘区分仅通过 `paptrading` 请求头
  - 部分接口模拟盘不支持（如统一账户余额、持仓模式查询返回 404）
  - post_only 订单在模拟盘可能更容易被撤销
- 持仓模式：
  - `one_way_mode`（单向持仓）— 不需要 tradeSide 参数
  - `hedge_mode`（双向持仓）— 需要 tradeSide: 'open'/'close'
  - 查询端点：`GET /api/v2/mix/account/position-mode`（模拟盘可能 404）
  - 默认策略：检测失败时按双向持仓处理（确保 tradeSide 始终发送）
- 常用端点：
  - `GET /api/v2/spot/account/assets` → 现货账户资产
  - `GET /api/v2/mix/account/accounts` → 合约账户资产（需 productType 参数）
  - `POST /api/v2/mix/order/place-order` → 合约下单
  - `POST /api/v2/spot/trade/place-order` → 现货下单
  - `POST /api/v2/spot/trade/cancel-order` → 撤单
  - `GET /api/v2/spot/trade/orderInfo` → 订单详情
  - `GET /api/v2/spot/market/tickers` → 现货行情
  - `GET /api/v2/mix/market/merge-depth` → 合约盘口深度
  - `GET /api/v2/mix/public/contracts` → 合约规格
  - `GET /api/v2/spot/public/symbols` → 现货交易对规格

## 核心服务
- `bitget-client.service.ts` → Bitget API 客户端封装（认证、签名、重试）
- `trading-service.factory.ts` → 服务工厂（根据交易类型创建服务组合）
- `contract-spec.service.ts` → 合约规格（三层缓存：内存→DB→API）
- `spot-spec.service.ts` → 现货规格（三层缓存）
- `instrument-spec.service.ts` → 统一规格门面
- `strategy-persistence.service.ts` → 策略/订单持久化 + 启动恢复
- `market-data.service.ts` → 现货行情（Ticker、K线、深度）
- `order-execution.service.ts` → 现货订单执行
- `capital-manager.service.ts` → 资金管理
- `futures-market-data.service.ts` → 合约行情（盘口深度、Ticker）
- `futures-order.service.ts` → 合约订单（下单、撤单、批量撤单、挂单查询）
- `futures-account.service.ts` → 合约账户（余额、权益、持仓模式检测）

## 策略引擎
- `strategy-manager.ts` → 策略管理器（Singleton — 创建、注册、管理策略实例）
- `scalping-strategy.engine.ts` → 剥头皮引擎（状态机 + 双循环 + post_only 自适应）
- `grid-strategy.engine.ts` → 网格引擎（等差/等比网格 + 买卖循环）
- `grid-level-manager.ts` → 网格位管理（状态机 + 订单映射）
- `strategy-config.manager.ts` → 运行时配置管理（热更新 + 验证）
- `order-state-tracker.ts` → 内存订单状态追踪 + 对账
- `risk-controller.ts` → 风控（回撤、止损、日亏限制）
- `merge-engine.ts` → 挂单合并（加权平均价）
- `auto-calc.service.ts` → 自动计算（4 参数 → 完整配置 + 推导过程）
- `presets/risk-presets.ts` → 风险等级预设（conservative/balanced/aggressive）

## 部署
- Docker Compose: nginx(80) + api(3001) + frontend(3000) + postgres(5432)
- PostgreSQL 数据持久化: pg_data named volume
- API 启动时自动运行数据库迁移（4 个迁移脚本）

## 编码标准
- TypeScript 严格类型，禁用 `any`
- 命名：文件 kebab-case / 类 PascalCase / 函数变量 camelCase / 常量 UPPER_SNAKE_CASE
- 错误处理统一使用 `AppError`（定义在 `utils/errors.ts`）
- 日志使用 `LogService`（级别门控 + 节流 + 聚合模式）
- 数据库多步操作必须使用事务，查询必须参数化
- 分层架构：routes → services → utils → config，禁止循环依赖
- 策略引擎依赖注入：通过 TradingServices 接口注入，不直接 new 具体服务

## 交易系统规则（资金安全最高优先级）
- 下单前必须验证资金充足（含 maker/taker 手续费 + 滑点预留）
- 订单状态必须同步到数据库
- 资金操作必须原子化（事务）
- 策略执行必须记录信号日志和执行摘要
- 敏感信息（APIKey / SecretKey / Passphrase）必须使用环境变量，禁止硬编码
- 加密货币市场 24/7 运行，无休市概念
- 价格和数量精度必须严格按交易对规则（不同币种精度不同）
- 资金计算使用字符串运算避免浮点误差
- 合约下单 tradeSide 参数：双向持仓发送 open/close，单向持仓不发送
- post_only 订单注意自适应偏移（模拟盘可能更容易被撤）

## 文档规范
- 中文命名：`YYMMDD-功能名称.md`
- 单一文档原则：一个功能一份文档，优先更新现有文档
- 导航文件：`CHANGELOG.md` / `PROJECT_STATUS.md` / `README.md` / `CODE_MAP.md`
- 文档目录：`docs/features/` `docs/fixes/` `docs/analysis/` `docs/guides/` `docs/technical/`

## 核心原则
- **先确认，再执行** — 不明确的需求必须先澄清
- **最小变更** — 只做必要改动，不过度工程
- **资金安全第一** — 涉及资金/订单的变更必须格外谨慎
