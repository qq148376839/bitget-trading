# Bitget 加密货币量化交易系统

基于 Bitget API 的加密货币量化交易系统，支持合约 Maker 剥头皮策略自动执行。

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
│   │   ├── config/         # 配置（Bitget SDK、数据库）
│   │   ├── middleware/      # 中间件（错误处理、限流）
│   │   ├── routes/         # API 路由
│   │   ├── services/       # 业务逻辑（现货 + 合约）
│   │   ├── strategy/       # 策略引擎（剥头皮）
│   │   ├── types/          # TypeScript 类型
│   │   └── utils/          # 工具模块
│   ├── migrations/         # 数据库迁移
│   ├── scripts/            # 启动脚本
│   └── Dockerfile
├── frontend/               # 前端策略面板
│   ├── app/                # Next.js App Router
│   ├── components/         # React 组件
│   ├── hooks/              # SWR 数据钩子
│   ├── lib/                # 工具库
│   └── Dockerfile
├── nginx/                  # 反向代理
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml      # 服务编排
├── docs/                   # 项目文档
└── .claude/agents/         # Claude Code agents
```

## 核心功能

### 策略引擎
- 合约 Maker 剥头皮策略（双循环架构）
- 盘口 bid1 追踪，post_only 限价挂单
- 买单成交自动挂卖单（买价 + 价差）
- 挂单合并（加权平均价）
- 风控系统（回撤限制、日亏限制、仓位限制）

### 前端面板
- 策略控制（启动/停止/紧急停止）
- 实时指标（PnL、胜率、持仓）
- 订单追踪表格
- 事件日志
- 运行时配置编辑

### 基础功能
- 现货 + 合约账户查询
- 订单管理（下单、撤单、批量撤单）
- 市场行情（Ticker、K线、深度）

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/account/assets` | 账户资产 |
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

最后更新：2026-02-08
