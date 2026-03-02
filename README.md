# Bitget 加密货币量化交易系统

基于 Bitget API 的加密货币量化交易系统，支持多策略（剥头皮 + 网格）、多交易类型（合约 + 现货）自动执行，具备完整认证保护、数据库配置管理、智能策略和结构化日志。

## 技术栈

- **后端**: Node.js + TypeScript + Express
- **前端**: Next.js 14 + Ant Design 5
- **数据库**: PostgreSQL 16
- **交易 API**: Bitget REST API v2 + WebSocket API
- **认证**: JWT + bcrypt
- **实时数据**: WebSocket（公共/私有频道 + 自动降级 REST）
- **包管理**: pnpm
- **部署**: Docker Compose (nginx + API + Frontend + PostgreSQL)
- **测试**: Jest + ts-jest

## 快速开始

### 方式一：本地开发

```bash
# 1. 复制环境配置
cp .env.example .env
# 编辑 .env 填入 Bitget API 密钥 + ENCRYPTION_KEY

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

### 方式二：Docker 部署（推荐 NAS）

```bash
# 1. 复制并编辑环境配置
cp .env.example .env

# 2. 启动所有服务
docker compose up --build -d

# 3. 访问（端口 8847）
open http://localhost:8847
```

首次启动会自动创建默认管理员（admin/admin123），请立即修改密码。

## 项目结构

```
bitget-trading/
├── api/                    # 后端 API 服务
│   ├── src/
│   │   ├── config/         # 配置（Bitget SDK、数据库、迁移）
│   │   ├── middleware/      # 中间件（认证、限流、请求日志、错误处理）
│   │   ├── routes/         # API 路由（9 个：health/auth/config/logs/account/orders/market/strategy/instruments）
│   │   ├── services/       # 业务逻辑
│   │   │   ├── interfaces/ # 统一服务接口
│   │   │   └── adapters/   # 合约/现货适配器（支持 UTA 自动路由）
│   │   ├── strategy/       # 策略引擎
│   │   │   ├── interfaces/ # 策略接口
│   │   │   ├── presets/    # 风险等级预设
│   │   │   └── indicators/ # 技术指标（ATR/RSI/BB/EMA/MACD）
│   │   ├── types/          # TypeScript 类型
│   │   └── utils/          # 工具模块（结构化日志、错误处理）
│   ├── migrations/         # 数据库迁移（6 个）
│   ├── scripts/            # 启动脚本
│   └── Dockerfile
├── frontend/               # 前端策略面板
│   ├── app/                # Next.js App Router（dashboard/login/settings）
│   ├── providers/          # AuthProvider（JWT 认证 Context）
│   ├── components/         # React 组件（15 个）
│   ├── hooks/              # SWR 数据钩子（9 个）
│   ├── lib/                # 工具库
│   └── Dockerfile
├── nginx/                  # 反向代理
├── docker-compose.yml      # 服务编排（nginx:8847 + api + frontend + postgres）
└── docs/                   # 项目文档
```

## 核心功能

### 认证 & 配置管理
- **JWT 认证** — 登录/注册/用户管理/权限控制
- **系统配置** — API 凭证通过 Web 界面管理（AES-256-GCM 加密存储）
- **热加载** — Bitget 配置从 DB 读取，无需重启即可更新

### 多策略支持
- **剥头皮策略** — 盘口 bid1 追踪，post_only 限价挂单，动态价差（ATR+RSI+BB 自适应）
- **网格策略** — 等差/等比网格，买卖循环自动轮转，价格突破自动再平衡
- 统一策略接口（`IStrategy`）+ 策略管理器
- 风控系统（回撤限制、日亏限制、仓位限制、追踪止损）

### 智能算法
- **WebSocket 实时行情** — 公共/私有频道，自动重连 + 指数退避
- **技术指标** — ATR、RSI、布林带、EMA、MACD
- **市场状态检测** — trending/ranging/volatile
- **动态价差** — 基于 ATR×乘数 + RSI 极端值调整 + 布林带宽度自适应
- **追踪止损** — 盈利激活阈值 + 峰值跟踪 + 回撤触发

### 多交易类型
- **合约交易** — USDT 合约，支持单向/双向持仓模式
- **现货交易** — 现货买卖，无杠杆
- **UTA 兼容** — 自动检测 UTA/经典账户类型，适配器自动路由

### 日志系统
- **结构化 JSON 日志** — 全链路 correlationId 传播
- **DB 持久化** — INFO+ 级别入库，支持分页查询和筛选
- **前端查看器** — 实时日志流 + 级别/模块/关键词筛选

### 傻瓜化配置
- **简单模式** — 仅需 4 个参数（策略类型 + 交易对 + 金额 + 风险等级）
- **高级模式** — 全参数配置 + 动态 min/max 边界
- 3 档风险等级预设（保守/均衡/激进）

## API 端点

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/api/health` | 公开 | 健康检查 + 账户类型 |
| POST | `/api/auth/login` | 公开 | 登录 |
| POST | `/api/auth/register` | 管理员 | 注册用户 |
| GET | `/api/auth/me` | 认证 | 当前用户信息 |
| PUT | `/api/auth/password` | 认证 | 修改密码 |
| GET | `/api/system-config` | 认证 | 系统配置列表 |
| PUT | `/api/system-config/:key` | 认证 | 更新配置 |
| POST | `/api/system-config/test-connection` | 认证 | 测试 API 连接 |
| GET | `/api/logs` | 认证 | 日志查询（分页+筛选） |
| PUT | `/api/logs/level` | 认证 | 调整日志级别 |
| GET | `/api/account/assets` | 认证 | 账户资产 |
| POST | `/api/orders/place` | 认证 | 下单 |
| POST | `/api/orders/cancel` | 认证 | 撤单 |
| GET | `/api/market/tickers` | 认证 | 行情数据 |
| POST | `/api/strategy/start` | 认证 | 启动策略 |
| POST | `/api/strategy/stop` | 认证 | 停止策略 |
| GET | `/api/strategy/status` | 认证 | 策略状态 |
| PUT | `/api/strategy/config` | 认证 | 更新配置 |
| POST | `/api/strategy/emergency-stop` | 认证 | 紧急停止 |
| POST | `/api/strategy/auto-calc` | 认证 | 自动计算配置 |
| GET | `/api/instruments` | 认证 | 交易对搜索 |

## Docker 架构

```
用户 → :8847 nginx → /api/*    → api:3001 (Express + JWT 认证)
                   → /api/auth → api:3001 (公开)
                   → /*        → frontend:3000 (Next.js)

postgres:5432 ← api (DATABASE_URL)
pg_data volume ← postgres (数据持久化)
ENCRYPTION_KEY → api (AES-256-GCM 配置加密)
```

## 文档

- [CHANGELOG](./CHANGELOG.md) — 更新日志
- [PROJECT_STATUS](./PROJECT_STATUS.md) — 项目状态
- [CODE_MAP](./CODE_MAP.md) — 代码架构

---

最后更新：2026-03-02
