# 代码架构

**最后更新**: 2026-02-09

## 后端分层架构

```
路由层 (routes/)
  ↓
服务层 (services/)          ← 核心业务逻辑
  ├── interfaces/           ← 统一服务接口
  ├── adapters/             ← 合约/现货适配器
  └── 具体实现服务
  ↓
策略层 (strategy/)          ← 策略引擎
  ├── interfaces/           ← 策略接口
  ├── presets/              ← 风险等级预设
  └── 策略引擎 + 辅助组件
  ↓
类型层 (types/)
  ↓
工具层 (utils/)
  ↓
配置层 (config/)
```

## 类型层

| 类型文件 | 职责 |
|---------|------|
| `trading.types.ts` | **统一交易类型**（TradingType, StrategyType, UnifiedPlaceOrderParams 等） |
| `strategy.types.ts` | 策略配置（ScalpingStrategyConfig, GridStrategyConfig, TrackedOrder 等） |
| `futures.types.ts` | 合约 API 类型（ProductType, FuturesPlaceOrderParams, ContractSpecInfo 等） |

## 服务接口层 (`services/interfaces/`)

| 接口文件 | 核心方法 |
|---------|----------|
| `i-order.service.ts` | placeOrder, cancelOrder, batchCancelOrders, getPendingOrders, getOrderDetail |
| `i-market-data.service.ts` | getTicker, getBestBid, getBestAsk |
| `i-account.service.ts` | getAvailableBalance, getAccountEquity |

## 适配器层 (`services/adapters/`)

| 适配器 | 包装的服务 | 说明 |
|--------|-----------|------|
| `futures-order.adapter.ts` | FuturesOrderService | 注入 productType/marginMode/marginCoin |
| `futures-market-data.adapter.ts` | FuturesMarketDataService | 注入 productType |
| `futures-account.adapter.ts` | FuturesAccountService | 注入 productType |
| `spot-order.adapter.ts` | OrderExecutionService | 无 tradeSide/margin |
| `spot-market-data.adapter.ts` | MarketDataService | 直接映射 |
| `spot-account.adapter.ts` | CapitalManagerService | equity=available |

## 服务层

| 服务文件 | 职责 | 依赖 |
|---------|------|------|
| `bitget-client.service.ts` | Bitget API 客户端封装（认证、签名） | axios, config/bitget |
| `trading-service.factory.ts` | **服务工厂** — 根据交易类型创建服务组合 | adapters/* |
| `contract-spec.service.ts` | 合约规格（三层缓存：内存→DB→API） | bitget-client |
| `spot-spec.service.ts` | 现货规格（三层缓存） | bitget-client |
| `instrument-spec.service.ts` | **统一规格门面** — 根据 tradingType 分发 | contract-spec, spot-spec |
| `strategy-persistence.service.ts` | 策略/订单持久化 + 启动恢复 | database |
| `market-data.service.ts` | 现货行情数据 | bitget-client |
| `order-execution.service.ts` | 现货订单执行 | bitget-client |
| `capital-manager.service.ts` | 资金管理 | bitget-client |
| `futures-market-data.service.ts` | 合约行情（盘口深度、Ticker） | bitget-client |
| `futures-order.service.ts` | 合约订单（下单、撤单、批量撤单） | bitget-client |
| `futures-account.service.ts` | 合约账户（余额、权益、持仓模式） | bitget-client |
| `log.service.ts` | 日志服务（异步队列、级别门控） | — |

## 策略层

### 策略接口 (`strategy/interfaces/`)

| 文件 | 说明 |
|------|------|
| `i-strategy.ts` | IStrategy 接口（start, stop, emergencyStop, getStatus, updateConfig 等） |

### 策略管理器

| 文件 | 职责 |
|------|------|
| `strategy-manager.ts` | **Singleton** — 策略实例注册表、创建/启动/停止策略 |

### 策略引擎

| 文件 | 职责 |
|------|------|
| `scalping-strategy.engine.ts` | 剥头皮引擎（状态机 + Loop A 盘口追踪 + Loop B 成交检测） |
| `grid-strategy.engine.ts` | 网格引擎（网格初始化 + 买卖循环 + PnL 计算） |
| `grid-level-manager.ts` | 网格位管理（等差/等比计算 + 状态机 + 订单映射） |

### 策略辅助组件

| 文件 | 职责 |
|------|------|
| `strategy-config.manager.ts` | 运行时配置管理（热更新 + 验证） |
| `order-state-tracker.ts` | 内存订单状态追踪 + 对账 |
| `risk-controller.ts` | 风控（回撤、止损、日亏限制） |
| `merge-engine.ts` | 挂单合并（加权平均价） |
| `auto-calc.service.ts` | 自动计算（4 参数 → 完整配置 + 推导说明） |

### 预设 (`strategy/presets/`)

| 文件 | 说明 |
|------|------|
| `risk-presets.ts` | 风险等级预设（conservative / balanced / aggressive） |

## 路由层

| 路由文件 | 路径前缀 | 说明 |
|---------|---------|------|
| `health.ts` | `/api/health` | 健康检查 |
| `account.ts` | `/api/account` | 账户资产 |
| `orders.ts` | `/api/orders` | 订单管理 |
| `market.ts` | `/api/market` | 行情数据 |
| `strategy.ts` | `/api/strategy` | 策略控制（启动/停止/配置/状态/PnL/订单/事件/紧急停止/auto-calc/bounds） |
| `contracts.ts` | `/api/contracts` | 合约规格查询 |
| `instruments.ts` | `/api/instruments` | 交易对搜索/热门列表/规格查询 |

## 前端架构

```
app/
  layout.tsx              → 根布局 (Ant Design + SWR Providers)
  page.tsx                → 策略仪表盘主页（含 ConfigWizard）

components/
  ConfigWizard            → 配置向导（简单/高级模式切换）
  SimpleConfigForm        → 简单模式（4 参数 + 风险等级 → 一键启动）
  StrategyTypeSelector    → 策略选择器（剥头皮 vs 网格 卡片）
  TradingPairSelector     → 交易对选择器（搜索 + 热门 + 分类）
  GridConfigEditor        → 网格配置表单（价格区间 + 预览）
  ConfigEditor            → 高级配置编辑器（全参数 + 动态边界）
  StrategyControlPanel    → 策略控制（启动/停止/紧急停止）
  MetricsCards            → 指标卡片（PnL、胜率、持仓、余额）
  OrderTable              → 订单追踪表格（筛选/分页）
  EventLog                → 事件日志（实时滚动）
  StatusBadge             → 状态徽标

hooks/
  useStrategyStatus       → 策略状态轮询 (2s)
  usePnl                  → PnL 轮询 (2s)
  useOrders               → 订单轮询 (3s)
  useEvents               → 事件轮询 (3s)
  useContractSpec         → 合约规格查询
  useInstruments          → 交易对搜索（SWR + 防抖）
  useAutoCalc             → 自动计算（500ms 防抖）
  useParameterBounds      → 参数动态边界

lib/
  api.ts                  → HTTP 客户端 + SWR fetcher
  types.ts                → 前端类型定义
  constants.ts            → 状态映射、事件颜色、热门交易对
  formatters.ts           → 时间/金额格式化
```

## 数据库迁移

| 迁移文件 | 内容 |
|---------|------|
| `001_*.sql` | 基础表（strategy_configs, strategy_orders, strategy_events, strategy_daily_pnl） |
| `002_*.sql` | 合约规格 + 资金费率表（contract_specs, funding_rate_history） |
| `003_*.sql` | 多策略支持（strategy_type, trading_type 字段 + 索引） |
| `004_*.sql` | 现货规格 + 网格（spot_specs, grid_levels） |

## Docker 部署架构

```
docker-compose.yml
├── nginx (port 80)         → 反向代理入口
├── api (port 3001 内部)     → Express 后端
├── frontend (port 3000 内部) → Next.js 前端
└── postgres (port 5432 内部) → PostgreSQL 数据库
    └── pg_data volume       → 数据持久化
```

## 配置层

| 配置文件 | 职责 |
|---------|------|
| `bitget.ts` | Bitget API 客户端初始化、密钥加载 |
| `database.ts` | PostgreSQL 连接池 |
| `migration-runner.ts` | 数据库迁移执行器（启动时自动运行） |

## 工具层

| 工具文件 | 职责 |
|---------|------|
| `errors.ts` | AppError 类、错误码定义（含策略/网格/规格错误码） |
| `logger.ts` | 日志格式化工具 |
