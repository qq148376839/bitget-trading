# 代码架构

**最后更新**: 2026-02-08

## 后端分层架构

```
路由层 (routes/)
  ↓
服务层 (services/)    ← 核心业务逻辑
  ↓
策略层 (strategy/)    ← 策略引擎
  ↓
工具层 (utils/)
  ↓
配置层 (config/)
```

## 服务层

| 服务文件 | 职责 | 依赖 |
|---------|------|------|
| `bitget-client.service.ts` | Bitget API 客户端封装（认证、签名、请求） | axios, config/bitget |
| `market-data.service.ts` | 现货行情数据（Ticker、K线） | bitget-client |
| `order-execution.service.ts` | 现货订单执行（下单、撤单、查询） | bitget-client |
| `capital-manager.service.ts` | 资金管理（余额查询、资金分配） | bitget-client |
| `log.service.ts` | 日志服务（异步队列、级别门控） | — |
| `futures-market-data.service.ts` | 合约行情（盘口深度、Ticker） | bitget-client |
| `futures-order.service.ts` | 合约订单（下单、撤单、批量撤单、挂单查询） | bitget-client |
| `futures-account.service.ts` | 合约账户（余额、权益） | bitget-client |

## 策略层

| 文件 | 职责 |
|------|------|
| `scalping-strategy.engine.ts` | 主策略引擎（状态机 + 双循环） |
| `strategy-config.manager.ts` | 运行时配置管理（热更新） |
| `order-state-tracker.ts` | 内存订单状态追踪 + 对账 |
| `risk-controller.ts` | 风控（回撤、止损、日亏限制） |
| `merge-engine.ts` | 挂单合并（加权平均价） |

## 路由层

| 路由文件 | 路径前缀 | 说明 |
|---------|---------|------|
| `health.ts` | `/api/health` | 健康检查 |
| `account.ts` | `/api/account` | 账户资产 |
| `orders.ts` | `/api/orders` | 订单管理 |
| `market.ts` | `/api/market` | 行情数据 |
| `strategy.ts` | `/api/strategy` | 策略控制（8 个端点） |

## 前端架构

```
app/
  layout.tsx          → 根布局 (Ant Design + SWR Providers)
  page.tsx            → 策略仪表盘主页

components/
  StrategyControlPanel → 策略控制（启动/停止/紧急停止）
  MetricsCards        → 6 个关键指标卡片
  OrderTable          → 订单追踪表格（筛选/分页）
  EventLog            → 事件日志（实时滚动）
  ConfigEditor        → 配置编辑器（可折叠 Form）
  StatusBadge         → 状态徽标

hooks/
  useStrategyStatus   → 策略状态轮询 (2s)
  usePnl              → PnL 轮询 (2s)
  useOrders           → 订单轮询 (3s)
  useEvents           → 事件轮询 (3s)

lib/
  api.ts              → HTTP 客户端 + SWR fetcher
  types.ts            → 前端类型定义
  constants.ts        → 状态映射、事件颜色
  formatters.ts       → 时间/金额格式化
```

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

## 工具层

| 工具文件 | 职责 |
|---------|------|
| `errors.ts` | AppError 类、错误码定义（含策略错误码） |
| `logger.ts` | 日志格式化工具 |

## 最新变更

### 2026-02-08 前端 + Docker 部署
- 新增 Next.js 14 策略仪表盘前端
- 新增 Docker Compose 部署（nginx + api + frontend + postgres）

### 2026-02-08 策略引擎
- 新增合约 API 服务（行情、订单、账户）
- 新增剥头皮策略引擎（状态机 + 双循环）
- 新增风控系统、挂单合并

### 2026-02-08 项目初始化
- 新增全部基础文件
- 建立分层架构骨架
