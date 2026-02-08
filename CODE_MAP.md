# 代码架构

**最后更新**: 2026-02-08

## 分层架构

```
路由层 (routes/)
  ↓
服务层 (services/)    ← 核心业务逻辑
  ↓
工具层 (utils/)
  ↓
配置层 (config/)
```

## 服务层

| 服务文件 | 职责 | 依赖 |
|---------|------|------|
| `bitget-client.service.ts` | Bitget API 客户端封装（认证、签名、请求） | axios, config/bitget |
| `market-data.service.ts` | 行情数据获取（Ticker、K线） | bitget-client |
| `order-execution.service.ts` | 订单执行（下单、撤单、查询） | bitget-client, capital-manager |
| `capital-manager.service.ts` | 资金管理（余额查询、资金分配） | bitget-client, database |
| `log.service.ts` | 日志服务（异步队列、级别门控） | — |

## 路由层

| 路由文件 | 路径前缀 | 说明 |
|---------|---------|------|
| `health.ts` | `/api/health` | 健康检查 |
| `account.ts` | `/api/account` | 账户资产 |
| `orders.ts` | `/api/orders` | 订单管理 |
| `market.ts` | `/api/market` | 行情数据 |

## 配置层

| 配置文件 | 职责 |
|---------|------|
| `bitget.ts` | Bitget API 客户端初始化、密钥加载 |
| `database.ts` | PostgreSQL 连接池 |

## 工具层

| 工具文件 | 职责 |
|---------|------|
| `errors.ts` | AppError 类、错误码定义 |
| `logger.ts` | 日志格式化工具 |

## 最新变更

### 2026-02-08 项目初始化
- 新增全部基础文件
- 建立分层架构骨架
