# 更新日志

## 2026-03-02
### v3.0 系统全面升级 — 认证 + 日志 + 智能策略 + UTA 兼容
**feat**: 4 大 Phase 全面升级，NAS 稳定运行优化

**Phase 1 — 基础设施 & 认证系统**:
1. Docker 端口优化 — nginx 映射 `80:80` → `8847:80`（冷门端口避免冲突）
2. 数据库迁移 005 — `users` 表 + `system_configs` 表（支持 AES-256-GCM 加密）
3. SystemConfigService — DB 配置管理（内存缓存 → DB → env fallback），加密字段支持
4. AuthService — bcrypt 密码哈希 + JWT 认证（7 天有效期）+ 种子默认管理员
5. 认证中间件 — Bearer Token 校验 + 管理员权限检查
6. 认证路由 — 登录/注册/改密/用户管理（7 个端点）
7. 系统配置路由 — 配置 CRUD + API 连接测试 + 配置导出
8. Bitget 配置从 DB 加载 — `loadBitgetConfigFromDB()` 优先读取 DB，env 作 fallback
9. 前端认证 — AuthProvider + ProtectedRoute + 登录页
10. 前端设置页 — API 凭证管理 + 系统配置 + 用户管理（管理员）
11. 前端 API 客户端 — JWT Header 注入 + 401 自动跳转登录

**Phase 2 — 日志系统升级**:
1. 结构化日志 — JSON 输出（timestamp, level, module, message, correlationId, data）
2. AsyncLocalStorage — 请求级 correlationId 全链路传播
3. 日志 DB 持久化 — INFO+ 级别入库（批量写入），DEBUG 仅控制台
4. 数据库迁移 006 — `system_logs` 表（level, module, message, data JSONB, correlation_id）
5. 请求日志中间件 — 每个请求自动记录 method/path/status/duration + correlationId
6. 日志查询 API — 分页 + level/module/时间范围/关键词/correlationId 筛选
7. 运行时日志级别调整 — `PUT /api/logs/level`
8. 前端日志查看器 — LogViewer 组件 + 自动刷新 + 清理功能
9. 策略引擎日志增强 — 心跳日志包含仓位/PnL/动态价差等上下文

**Phase 3 — 智能算法优化**:
1. WebSocket 客户端 — 公共/私有频道 + 自动重连 + 指数退避 + HMAC-SHA256 认证
2. 实时行情服务 — WebSocket → REST 自动降级，10 秒新鲜度检查
3. 技术指标计算 — ATR、RSI、布林带、EMA、MACD（calcAllIndicators）
4. 市场状态检测 — trending_up/down、ranging、volatile（基于 BB+RSI+ATR 综合判断）
5. K 线数据服务 — REST 初始加载 + WebSocket 增量更新 + 多时间周期缓存
6. **剥头皮动态价差** — ATR×乘数基础 + RSI 极端值调整 + 布林带宽度自适应
7. **网格自动再平衡** — 价格突破范围后撤销挂单 → 以当前价为中心重建网格
8. 追踪止损 — 盈利激活 + 峰值跟踪 + 回撤触发
9. 风控集成 — TrailingStop 嵌入 RiskController
10. 预设参数升级 — 新增 volatilityMultiplier、maxDynamicSpread、autoRebalance、trailingStop
11. 自动计算升级 — 波动率参数 + 再平衡参数 + 追踪止损参数纳入推导

**Phase 4 — UTA 账户兼容**:
1. 账户类型检测 — 尝试 UTA 端点自动识别，会话级缓存
2. 合约账户适配 — UTA 路由到 funding-assets 端点 + 经典回退
3. 现货账户适配 — 同上
4. 持仓模式适配 — UTA 默认单向持仓
5. 健康检查 — 返回账户类型（uta/classic）
6. 前端展示 — StrategyControlPanel 显示账户类型 Tag

**文件统计**: 24 新建 + 24 修改 = 48 文件

---

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

### 合约策略引擎
**feat**: 新增 USDT 合约 Maker 剥头皮策略

### 项目初始化
**feat**: 创建 Bitget 加密货币量化交易系统项目骨架
