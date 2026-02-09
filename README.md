# Bitget 加密货币量化交易系统

基于 Bitget API 的加密货币量化交易系统，支持多策略（剥头皮 + 网格）、多交易类型（合约 + 现货）自动执行。

## 技术栈

- **后端**: Node.js + TypeScript + Express
- **前端**: Next.js 14 + Ant Design 5
- **数据库**: PostgreSQL 16
- **交易 API**: Bitget REST API v2
- **包管理**: pnpm
- **部署**: Docker Compose (nginx + API + Frontend + PostgreSQL)
- **测试**: Jest + ts-jest

## 快速开始

### 方式一：本地开发

```bash
# 1. 复制环境配置
cp .env.example .env
# 编辑 .env 填入 Bitget API 密钥

# 2. 安装后端依赖
cd api && pnpm install

# 3. 启动后端
pnpm run dev

# 4. 安装前端依赖（另一个终端）
cd frontend && pnpm install

# 5. 启动前端
pnpm run dev
```

- 后端: `http://localhost:3001`
- 前端: `http://localhost:3000`

### 方式二：Docker 部署

```bash
# 1. 复制并编辑环境配置
cp .env.example .env

# 2. 启动所有服务
docker compose up --build -d

# 3. 访问
open http://localhost
```

## 项目结构

```
bitget-trading/
├── api/                    # 后端 API 服务
│   ├── src/
│   │   ├── config/         # 配置（Bitget SDK、数据库、迁移）
│   │   ├── middleware/      # 中间件（错误处理、限流）
│   │   ├── routes/         # API 路由
│   │   ├── services/       # 业务逻辑
│   │   │   ├── interfaces/ # 统一服务接口
│   │   │   └── adapters/   # 合约/现货适配器
│   │   ├── strategy/       # 策略引擎
│   │   │   ├── interfaces/ # 策略接口
│   │   │   └── presets/    # 风险等级预设
│   │   ├── types/          # TypeScript 类型
│   │   └── utils/          # 工具模块
│   ├── migrations/         # 数据库迁移（4 个）
│   ├── scripts/            # 启动脚本
│   └── Dockerfile
├── frontend/               # 前端策略面板
│   ├── app/                # Next.js App Router
│   ├── components/         # React 组件（11 个）
│   ├── hooks/              # SWR 数据钩子（8 个）
│   ├── lib/                # 工具库
│   └── Dockerfile
├── nginx/                  # 反向代理
├── docker-compose.yml      # 服务编排
└── docs/                   # 项目文档
```

## 核心功能

### 多策略支持
- **剥头皮策略** — 盘口 bid1 追踪，post_only 限价挂单，买卖价差套利
- **网格策略** — 等差/等比网格，买卖循环自动轮转
- 统一策略接口（`IStrategy`）+ 策略管理器
- 风控系统（回撤限制、日亏限制、仓位限制）

### 多交易类型
- **合约交易** — USDT 合约，支持单向/双向持仓模式
- **现货交易** — 现货买卖，无杠杆
- 统一服务接口 + 适配器模式屏蔽差异

### 傻瓜化配置
- **简单模式** — 仅需 4 个参数（策略类型 + 交易对 + 金额 + 风险等级）
- **高级模式** — 全参数配置 + 动态 min/max 边界
- 自动计算引擎（根据实时行情 + 手续费 + 波动率推导最优参数）
- 3 档风险等级预设（保守/均衡/激进）

### 前端面板
- 配置向导（简单/高级模式切换）
- 交易对选择器（搜索 + 热门快选 + 分类浏览）
- 策略控制（启动/停止/紧急停止）
- 实时指标（PnL、胜率、持仓、余额）
- 订单追踪表格 + 事件日志

### 基础功能
- 现货 + 合约账户查询
- 订单管理（下单、撤单、批量撤单）
- 市场行情（Ticker、K线、深度）
- 合约/现货规格自动获取（三层缓存）

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/account/assets` | 账户资产 |
| GET | `/api/account/all-balances` | 全部余额（现货+合约） |
| POST | `/api/orders/place` | 下单 |
| POST | `/api/orders/cancel` | 撤单 |
| GET | `/api/orders/:orderId` | 订单详情 |
| GET | `/api/market/tickers` | 行情数据 |
| GET | `/api/market/candles` | K 线数据 |
| POST | `/api/strategy/start` | 启动策略 |
| POST | `/api/strategy/stop` | 停止策略 |
| GET | `/api/strategy/status` | 策略状态 |
| PUT | `/api/strategy/config` | 更新配置 |
| GET | `/api/strategy/orders` | 追踪订单 |
| POST | `/api/strategy/emergency-stop` | 紧急停止 |
| GET | `/api/strategy/pnl` | 盈亏汇总 |
| GET | `/api/strategy/events` | 事件日志 |
| POST | `/api/strategy/auto-calc` | 自动计算配置 |
| GET | `/api/strategy/bounds` | 参数动态边界 |
| GET | `/api/contracts/spec/:symbol` | 合约规格 |
| GET | `/api/instruments` | 交易对搜索 |
| GET | `/api/instruments/hot` | 热门交易对 |
| GET | `/api/instruments/:symbol` | 交易对规格 |

## Docker 架构

```
用户 → :80 nginx → /api/* → api:3001 (Express)
                 → /*     → frontend:3000 (Next.js)

postgres:5432 ← api (DATABASE_URL)
pg_data volume ← postgres (数据持久化)
```

## 文档

- [CHANGELOG](./CHANGELOG.md) — 更新日志
- [PROJECT_STATUS](./PROJECT_STATUS.md) — 项目状态
- [CODE_MAP](./CODE_MAP.md) — 代码架构

---

最后更新：2026-02-09
