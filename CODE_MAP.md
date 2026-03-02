# 代码架构

**最后更新**: 2026-03-02

## 后端分层架构

```
路由层 (routes/)
  ↓
中间件层 (middleware/)       ← 认证、限流、日志
  ↓
服务层 (services/)          ← 核心业务逻辑
  ├── interfaces/           ← 统一服务接口
  ├── adapters/             ← 合约/现货适配器
  └── 具体实现服务
  ↓
策略层 (strategy/)          ← 策略引擎
  ├── interfaces/           ← 策略接口
  ├── presets/              ← 风险等级预设
  ├── indicators/           ← 技术指标
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

## 中间件层 (`middleware/`)

| 文件 | 职责 |
|------|------|
| `auth.middleware.ts` | JWT Bearer Token 校验 + 管理员权限检查，扩展 Express Request.user |
| `request-logger.ts` | 生成 correlationId（AsyncLocalStorage），记录 method/path/status/duration |
| `error-handler.ts` | 统一错误响应格式 |
| `rate-limiter.ts` | API 请求限流 |

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
| `futures-account.adapter.ts` | FuturesAccountService | 注入 productType，UTA 自动路由 |
| `spot-order.adapter.ts` | OrderExecutionService | 无 tradeSide/margin |
| `spot-market-data.adapter.ts` | MarketDataService | 直接映射 |
| `spot-account.adapter.ts` | CapitalManagerService | UTA 自动路由，equity=available |

## 服务层

| 服务文件 | 职责 | 依赖 |
|---------|------|------|
| `bitget-client.service.ts` | Bitget API 客户端封装（认证、签名） | axios, config/bitget |
| `trading-service.factory.ts` | **服务工厂** — 根据交易类型创建服务组合，支持 WebSocket 行情 | adapters/* |
| `auth.service.ts` | **认证服务** — bcrypt 密码、JWT 签发/验证、用户 CRUD | bcryptjs, jsonwebtoken |
| `system-config.service.ts` | **系统配置** — AES-256-GCM 加密、内存缓存→DB→env | crypto, database |
| `account-type-detector.service.ts` | **UTA 检测** — 自动识别 UTA/经典账户，会话级缓存 | bitget-client |
| `websocket-client.service.ts` | **WebSocket 客户端** — 公共/私有频道、自动重连、指数退避 | ws |
| `realtime-market-data.service.ts` | **实时行情** — WebSocket → REST 自动降级 | websocket-client |
| `candle-data.service.ts` | **K线数据** — REST + WebSocket 增量更新、多周期缓存、指标计算 | bitget-client, websocket-client |
| `log.service.ts` | **日志持久化** — 异步批量写入 DB、分页查询、自动清理 | database |
| `contract-spec.service.ts` | 合约规格（三层缓存：内存→DB→API） | bitget-client |
| `spot-spec.service.ts` | 现货规格（三层缓存） | bitget-client |
| `instrument-spec.service.ts` | **统一规格门面** — 根据 tradingType 分发 | contract-spec, spot-spec |
| `strategy-persistence.service.ts` | 策略/订单持久化 + 启动恢复 | database |
| `market-data.service.ts` | 现货行情数据 | bitget-client |
| `order-execution.service.ts` | 现货订单执行 | bitget-client |
| `capital-manager.service.ts` | 资金管理 | bitget-client |
| `futures-market-data.service.ts` | 合约行情（盘口深度、Ticker） | bitget-client |
| `futures-order.service.ts` | 合约订单（下单、撤单、批量撤单） | bitget-client |
| `futures-account.service.ts` | 合约账户（余额、权益、持仓模式、UTA 适配） | bitget-client |

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
| `scalping-strategy.engine.ts` | 剥头皮引擎（状态机 + Loop A 盘口追踪 + Loop B 成交检测 + 动态价差） |
| `grid-strategy.engine.ts` | 网格引擎（网格初始化 + 买卖循环 + PnL 计算 + 自动再平衡） |
| `grid-level-manager.ts` | 网格位管理（等差/等比计算 + 状态机 + 订单映射） |

### 技术指标 (`strategy/indicators/`)

| 文件 | 职责 |
|------|------|
| `technical-indicators.ts` | ATR、RSI、布林带、EMA、MACD 计算（calcAllIndicators） |
| `market-regime-detector.ts` | 市场状态检测（trending_up/down、ranging、volatile + 置信度） |

### 策略辅助组件

| 文件 | 职责 |
|------|------|
| `strategy-config.manager.ts` | 运行时配置管理（热更新 + 验证） |
| `order-state-tracker.ts` | 内存订单状态追踪 + 对账 |
| `risk-controller.ts` | 风控（回撤、止损、日亏限制 + 追踪止损） |
| `merge-engine.ts` | 挂单合并（加权平均价） |
| `auto-calc.service.ts` | 自动计算（4 参数 → 完整配置 + 推导说明 + 波动率参数） |
| `trailing-stop.ts` | 追踪止损（激活阈值 + 峰值跟踪 + 回撤触发） |

### 预设 (`strategy/presets/`)

| 文件 | 说明 |
|------|------|
| `risk-presets.ts` | 风险等级预设（conservative / balanced / aggressive + 波动率/再平衡/止损） |

## 路由层

| 路由文件 | 路径前缀 | 认证 | 说明 |
|---------|---------|------|------|
| `health.ts` | `/api/health` | 公开 | 健康检查 + 账户类型 |
| `auth.ts` | `/api/auth` | 公开/认证 | 登录/注册/改密/用户管理 |
| `system-config.ts` | `/api/system-config` | 认证 | 配置管理 + API 测试 + 导出 |
| `logs.ts` | `/api/logs` | 认证 | 日志查询/级别调整/清理 |
| `account.ts` | `/api/account` | 认证 | 账户资产 |
| `orders.ts` | `/api/orders` | 认证 | 订单管理 |
| `market.ts` | `/api/market` | 认证 | 行情数据 |
| `strategy.ts` | `/api/strategy` | 认证 | 策略控制 |
| `contracts.ts` | `/api/contracts` | 认证 | 合约规格查询 |
| `instruments.ts` | `/api/instruments` | 认证 | 交易对搜索/热门列表 |

## 前端架构

```
app/
  layout.tsx              → 根布局 (AuthProvider + Ant Design + SWR)
  page.tsx                → 策略仪表盘主页（ProtectedRoute + ConfigWizard）
  login/page.tsx          → 登录页（用户名/密码表单）
  settings/page.tsx       → 设置页（API 凭证 / 系统配置 / 日志 / 用户管理）

providers/
  AuthProvider.tsx        → 认证 Context（login/logout/user/token）

components/
  ProtectedRoute          → 路由保护（未登录跳转 /login）
  ConfigWizard            → 配置向导（简单/高级模式切换）
  SimpleConfigForm        → 简单模式（4 参数 + 风险等级 → 一键启动）
  StrategyTypeSelector    → 策略选择器（剥头皮 vs 网格 卡片）
  TradingPairSelector     → 交易对选择器（搜索 + 热门 + 分类）
  GridConfigEditor        → 网格配置表单（价格区间 + 预览）
  ConfigEditor            → 高级配置编辑器（全参数 + 动态边界）
  StrategyControlPanel    → 策略控制（启动/停止/紧急停止 + 账户类型 Tag）
  MetricsCards            → 指标卡片（PnL、胜率、持仓、余额）
  OrderTable              → 订单追踪表格（筛选/分页）
  EventLog                → 事件日志（实时滚动）
  StatusBadge             → 状态徽标
  SystemConfigPanel       → API 凭证 + 系统配置表单
  UserManagement          → 用户管理表格（CRUD）
  LogViewer               → 日志查看器（筛选 + 自动刷新 + 清理）

hooks/
  useStrategyStatus       → 策略状态轮询 (2s)
  usePnl                  → PnL 轮询 (2s)
  useOrders               → 订单轮询 (3s)
  useEvents               → 事件轮询 (3s)
  useContractSpec         → 合约规格查询
  useInstruments          → 交易对搜索（SWR + 防抖）
  useAutoCalc             → 自动计算（500ms 防抖）
  useParameterBounds      → 参数动态边界
  useLogs                 → 日志查询（SWR + 可选自动刷新）

lib/
  api.ts                  → HTTP 客户端 + SWR fetcher + JWT 注入 + 401 处理
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
| `005_*.sql` | 认证 + 配置（users, system_configs） |
| `006_*.sql` | 系统日志（system_logs — level, module, message, data JSONB, correlation_id） |

## Docker 部署架构

```
docker-compose.yml
├── nginx (port 8847→80)     → 反向代理入口
├── api (port 3001 内部)      → Express 后端
│   └── ENCRYPTION_KEY        → AES-256-GCM 密钥
├── frontend (port 3000 内部) → Next.js 前端
└── postgres (port 5432 内部) → PostgreSQL 数据库
    └── pg_data volume        → 数据持久化
```

## 配置层

| 配置文件 | 职责 |
|---------|------|
| `bitget.ts` | Bitget API 客户端初始化、密钥加载、DB 热加载（`loadBitgetConfigFromDB`） |
| `database.ts` | PostgreSQL 连接池 |
| `migration-runner.ts` | 数据库迁移执行器（启动时自动运行 + 校验和保护） |

## 工具层

| 工具文件 | 职责 |
|---------|------|
| `errors.ts` | AppError 类、错误码定义（含策略/网格/规格/认证错误码） |
| `logger.ts` | 结构化 JSON 日志、AsyncLocalStorage correlationId、动态级别 |
