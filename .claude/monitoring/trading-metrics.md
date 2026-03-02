# 量化交易系统监控指标

量化交易系统必须持续监控关键指标，确保系统稳定运行和盈利能力。

## 核心监控指标

### 1. 资金安全指标 🔴 (最高优先级)

#### 1.1 账户余额异常
```typescript
// 监控项
- 总资产突然大幅下降（> 5%/小时）
- 可用余额为负数
- 冻结金额异常增长（> 50%）
- 本地记录与 Bitget 余额不一致（> 1%）

// 告警阈值
- 严重：总资产下降 > 10%/小时
- 高：总资产下降 > 5%/小时
- 中：余额不一致 > 1%
```

#### 1.2 资金流水异常
```typescript
// 监控项
- 资金事务失败率（> 1%）
- 资金锁定时间过长（> 1 小时）
- 单笔资金变动过大（> 总资产 20%）

// 告警阈值
- 严重：事务失败率 > 5%
- 高：事务失败率 > 1%
- 中：锁定时间 > 1 小时
```

### 2. 订单执行指标 🟡

#### 2.1 订单成功率
```typescript
// 监控项
- 订单提交成功率（应 > 95%）
- 订单成交率（应 > 90%）
- post_only 订单撤销率（应 < 50%）

// 告警阈值
- 严重：提交成功率 < 80%
- 高：提交成功率 < 95%
- 中：post_only 撤销率 > 70%
```

#### 2.2 订单延迟
```typescript
// 监控项
- 下单响应时间（P50/P95/P99）
- 撤单响应时间（P50/P95/P99）
- 订单状态同步延迟

// 告警阈值
- 严重：P95 > 5 秒
- 高：P95 > 3 秒
- 中：P95 > 1 秒
```

#### 2.3 订单状态一致性
```typescript
// 监控项
- 本地订单状态与 Bitget 不一致的数量
- 订单状态同步失败次数

// 告警阈值
- 严重：不一致订单 > 10 个
- 高：不一致订单 > 5 个
- 中：同步失败 > 10 次/小时
```

### 3. 策略盈利指标 🟢

#### 3.1 盈亏统计
```typescript
// 监控项
- 今日盈亏（绝对值 + 百分比）
- 周盈亏（绝对值 + 百分比）
- 月盈亏（绝对值 + 百分比）
- 最大回撤（当前回撤 / 历史最大回撤）

// 告警阈值
- 严重：今日亏损 > 总资产 5%
- 高：今日亏损 > 总资产 3%
- 中：当前回撤 > 历史最大回撤 80%
```

#### 3.2 策略表现
```typescript
// 监控项
- 胜率（盈利订单 / 总订单）
- 盈亏比（平均盈利 / 平均亏损）
- 交易次数（每小时/每天）
- 持仓时间（平均持仓时长）

// 告警阈值
- 严重：胜率 < 40%（连续 24 小时）
- 高：盈亏比 < 1:1（连续 24 小时）
- 中：交易次数异常（0 次/小时 或 > 100 次/小时）
```

#### 3.3 风控触发
```typescript
// 监控项
- 止损触发次数（每天）
- 止盈触发次数（每天）
- 最大回撤触发次数
- 日亏损限制触发次数

// 告警阈值
- 严重：日亏损限制触发
- 高：最大回撤触发
- 中：止损触发 > 10 次/天
```

### 4. API 健康指标 🟠

#### 4.1 Bitget API 调用
```typescript
// 监控项
- API 调用成功率（应 > 99%）
- API 响应时间（P50/P95/P99）
- API 限频触发次数（429 错误）
- API 认证失败次数（401 错误）

// 告警阈值
- 严重：成功率 < 95% 或认证失败 > 0
- 高：成功率 < 99% 或限频触发 > 10 次/小时
- 中：P95 响应时间 > 2 秒
```

#### 4.2 数据库性能
```typescript
// 监控项
- 查询响应时间（P50/P95/P99）
- 慢查询次数（> 1 秒）
- 连接池使用率
- 死锁次数

// 告警阈值
- 严重：死锁 > 0 或连接池满
- 高：慢查询 > 10 次/分钟
- 中：P95 > 500ms
```

#### 4.3 WebSocket 连接（如有）
```typescript
// 监控项
- 连接状态（已连接/断开）
- 断线重连次数
- 消息延迟（服务端时间戳 vs 本地时间）
- 消息丢失率

// 告警阈值
- 严重：连接断开 > 5 分钟
- 高：重连次数 > 10 次/小时
- 中：消息延迟 > 500ms
```

### 5. 系统资源指标 🔵

#### 5.1 服务可用性
```typescript
// 监控项
- API 服务健康检查（/api/health）
- 前端服务可用性
- PostgreSQL 可用性
- Nginx 可用性

// 告警阈值
- 严重：任何服务不可用
```

#### 5.2 系统负载
```typescript
// 监控项
- CPU 使用率
- 内存使用率
- 磁盘使用率
- 网络流量

// 告警阈值
- 严重：CPU > 90% 或内存 > 95%
- 高：CPU > 80% 或内存 > 90%
- 中：磁盘 > 85%
```

#### 5.3 应用日志
```typescript
// 监控项
- ERROR 级别日志数量
- WARN 级别日志数量
- 异常堆栈出现频率

// 告警阈值
- 严重：ERROR > 10 条/分钟
- 高：ERROR > 5 条/分钟
- 中：WARN > 50 条/分钟
```

## 监控实现方案

### 方案 1：简单日志监控（当前可用）

```typescript
// api/src/services/monitoring.service.ts
export class MonitoringService {
  // 每 5 分钟记录一次关键指标
  public async recordMetrics(): Promise<void> {
    const metrics = await this.collectMetrics();

    // 检查告警阈值
    const alerts = this.checkThresholds(metrics);

    if (alerts.length > 0) {
      LogService.error('监控告警', { alerts });
      // TODO: 发送钉钉/邮件通知
    }

    // 记录到数据库
    await this.saveMetrics(metrics);
  }

  private async collectMetrics() {
    return {
      // 资金指标
      totalAssets: await this.getAccountBalance(),
      availableBalance: await this.getAvailableBalance(),
      frozenBalance: await this.getFrozenBalance(),

      // 订单指标
      orderSuccessRate: await this.getOrderSuccessRate(),
      orderAvgDelay: await this.getOrderAvgDelay(),

      // 策略指标
      todayPnL: await this.getTodayPnL(),
      winRate: await this.getWinRate(),

      // API 指标
      apiSuccessRate: await this.getApiSuccessRate(),
      apiAvgDelay: await this.getApiAvgDelay(),

      timestamp: new Date(),
    };
  }
}
```

### 方案 2：Prometheus + Grafana（推荐生产环境）

```yaml
# docker-compose.yml 新增服务
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana-dashboards:/etc/grafana/provisioning/dashboards
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

```typescript
// api/src/services/prometheus-metrics.service.ts
import { Counter, Gauge, Histogram, register } from 'prom-client';

export class PrometheusMetrics {
  // 资金指标
  private totalAssetsGauge = new Gauge({
    name: 'bitget_total_assets',
    help: '总资产（USDT）'
  });

  // 订单指标
  private orderCounter = new Counter({
    name: 'bitget_orders_total',
    help: '订单总数',
    labelNames: ['status', 'side', 'symbol']
  });

  private orderDelayHistogram = new Histogram({
    name: 'bitget_order_delay_seconds',
    help: '订单延迟分布',
    buckets: [0.1, 0.5, 1, 2, 5]
  });

  // 策略指标
  private pnlGauge = new Gauge({
    name: 'bitget_pnl_usdt',
    help: '盈亏（USDT）',
    labelNames: ['period', 'strategy_id']
  });

  // API 指标
  private apiCallCounter = new Counter({
    name: 'bitget_api_calls_total',
    help: 'API 调用次数',
    labelNames: ['endpoint', 'status']
  });

  // 暴露 /metrics 端点
  public getMetrics(): string {
    return register.metrics();
  }
}
```

```typescript
// api/src/routes/metrics.ts
import { Router } from 'express';
import { PrometheusMetrics } from '../services/prometheus-metrics.service';

const router = Router();
const metrics = new PrometheusMetrics();

// Prometheus 采集端点
router.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(metrics.getMetrics());
});

export default router;
```

### 方案 3：自定义监控面板（Next.js）

```typescript
// frontend/app/monitoring/page.tsx
export default function MonitoringPage() {
  const { data: metrics } = useSWR('/api/monitoring/metrics', fetcher, {
    refreshInterval: 5000 // 5 秒刷新
  });

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* 资金安全 */}
      <MetricCard
        title="总资产"
        value={metrics?.totalAssets}
        change={metrics?.totalAssetsChange}
        status={getStatus(metrics?.totalAssetsChange)}
      />

      {/* 今日盈亏 */}
      <MetricCard
        title="今日盈亏"
        value={metrics?.todayPnL}
        change={metrics?.todayPnLPercent}
        status={metrics?.todayPnL >= 0 ? 'success' : 'danger'}
      />

      {/* 订单成功率 */}
      <MetricCard
        title="订单成功率"
        value={`${metrics?.orderSuccessRate}%`}
        status={metrics?.orderSuccessRate >= 95 ? 'success' : 'warning'}
      />

      {/* 策略胜率 */}
      <MetricCard
        title="策略胜率"
        value={`${metrics?.winRate}%`}
        status={metrics?.winRate >= 50 ? 'success' : 'warning'}
      />
    </div>
  );
}
```

## 告警通知实现

### 钉钉机器人通知

```typescript
// api/src/services/alert.service.ts
import axios from 'axios';

export class AlertService {
  private dingTalkWebhook = process.env.DINGTALK_WEBHOOK;

  public async sendAlert(alert: Alert): Promise<void> {
    if (!this.dingTalkWebhook) {
      LogService.warn('钉钉 Webhook 未配置，跳过告警通知');
      return;
    }

    const message = {
      msgtype: 'markdown',
      markdown: {
        title: `${this.getEmoji(alert.level)} 交易系统告警`,
        text: this.formatAlert(alert)
      }
    };

    await axios.post(this.dingTalkWebhook, message);
  }

  private formatAlert(alert: Alert): string {
    return `
### ${this.getEmoji(alert.level)} ${alert.title}

**告警等级**: ${alert.level}
**告警时间**: ${new Date(alert.timestamp).toLocaleString('zh-CN')}
**告警指标**: ${alert.metric}
**当前值**: ${alert.currentValue}
**阈值**: ${alert.threshold}

**详情**: ${alert.description}

${alert.level === 'critical' ? '⚠️ **请立即处理**' : ''}
    `.trim();
  }

  private getEmoji(level: string): string {
    const emojis = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵'
    };
    return emojis[level] || '⚪';
  }
}
```

## 监控最佳实践

1. **分级告警** — 不同等级的告警使用不同的通知渠道
   - 严重：钉钉 + 短信 + 电话
   - 高：钉钉 + 邮件
   - 中：钉钉
   - 低：仅记录日志

2. **告警聚合** — 避免告警风暴
   - 同一告警 5 分钟内只发送一次
   - 多个中等告警可聚合为一条消息

3. **告警趋势** — 关注指标变化趋势，而不仅仅是绝对值
   - 资产突然下降 5% → 严重
   - 资产缓慢下降 5% → 高

4. **定期回顾** — 每周回顾告警记录
   - 哪些告警是真实问题？
   - 哪些告警是误报？
   - 阈值是否需要调整？

5. **自动恢复检测** — 问题恢复后自动发送恢复通知
   - 避免用户不知道问题是否已修复

## 数据库 Schema

```sql
-- 监控指标历史表
CREATE TABLE monitoring_metrics (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 资金指标
  total_assets NUMERIC(20, 8),
  available_balance NUMERIC(20, 8),
  frozen_balance NUMERIC(20, 8),

  -- 订单指标
  order_success_rate NUMERIC(5, 2),
  order_avg_delay_ms INTEGER,

  -- 策略指标
  today_pnl NUMERIC(20, 8),
  today_pnl_percent NUMERIC(5, 2),
  win_rate NUMERIC(5, 2),

  -- API 指标
  api_success_rate NUMERIC(5, 2),
  api_avg_delay_ms INTEGER,

  -- 系统指标
  cpu_usage NUMERIC(5, 2),
  memory_usage NUMERIC(5, 2),

  INDEX idx_timestamp (timestamp)
);

-- 告警记录表
CREATE TABLE monitoring_alerts (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level VARCHAR(20) NOT NULL, -- critical/high/medium/low
  metric VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  current_value VARCHAR(100),
  threshold VARCHAR(100),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,

  INDEX idx_timestamp (timestamp),
  INDEX idx_level (level),
  INDEX idx_resolved (resolved)
);
```

## 下一步

1. **实现基础监控** (优先级：高)
   - 添加 MonitoringService
   - 定时收集指标
   - 记录到数据库

2. **实现告警通知** (优先级：高)
   - 配置钉钉 Webhook
   - 实现 AlertService
   - 定义告警规则

3. **实现监控面板** (优先级：中)
   - 前端展示实时指标
   - 历史趋势图表
   - 告警记录查询

4. **接入 Prometheus** (优先级：低，生产环境推荐)
   - 配置 Prometheus 采集
   - 配置 Grafana 面板
   - 配置告警规则
