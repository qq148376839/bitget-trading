# Bitget 加密货币量化交易系统

基于 Bitget API 的加密货币量化交易系统，支持现货交易策略自动执行。

## 技术栈

- **后端**: Node.js + TypeScript + Express
- **数据库**: PostgreSQL
- **前端**: Next.js 14 + Ant Design（后续开发）
- **交易 API**: Bitget REST API v2 + WebSocket
- **包管理**: pnpm
- **测试**: Jest + ts-jest

## 快速开始

### 1. 环境准备

```bash
# 复制环境配置
cp .env.example .env
# 编辑 .env 填入 Bitget API 密钥
```

### 2. 安装依赖

```bash
cd api
pnpm install
```

### 3. 启动开发服务

```bash
pnpm run dev
```

服务将在 `http://localhost:3001` 启动。

## 项目结构

```
bitget-trading/
├── api/                 # 后端 API 服务
│   ├── src/
│   │   ├── config/      # 配置（Bitget SDK、数据库）
│   │   ├── middleware/   # 中间件
│   │   ├── routes/      # API 路由
│   │   ├── services/    # 业务逻辑（核心）
│   │   └── utils/       # 工具模块
│   └── migrations/      # 数据库迁移
├── frontend/            # 前端（后续开发）
├── docs/                # 项目文档
└── .claude/agents/      # Claude Code agents
```

## 核心功能

- 账户资产查询
- 现货订单管理（下单、撤单、查询）
- 市场行情数据（Ticker、K 线）
- 资金管理与风控
- 量化策略执行（开发中）

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

## 文档

- [CHANGELOG](./CHANGELOG.md) — 更新日志
- [PROJECT_STATUS](./PROJECT_STATUS.md) — 项目状态
- [CODE_MAP](./CODE_MAP.md) — 代码架构

---

最后更新：2026-02-08
