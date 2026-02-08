-- 策略相关数据表

-- 策略配置持久化
CREATE TABLE IF NOT EXISTS strategy_configs (
  id SERIAL PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 策略事件审计日志
CREATE TABLE IF NOT EXISTS strategy_events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_events_type ON strategy_events(event_type);
CREATE INDEX IF NOT EXISTS idx_strategy_events_created ON strategy_events(created_at);

-- 订单追踪（用于重启恢复）
CREATE TABLE IF NOT EXISTS strategy_orders (
  id BIGSERIAL PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL UNIQUE,
  client_oid VARCHAR(128),
  side VARCHAR(8) NOT NULL,
  price DECIMAL(20, 8) NOT NULL,
  size DECIMAL(20, 8) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  linked_order_id VARCHAR(64),
  direction VARCHAR(8),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  filled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_strategy_orders_status ON strategy_orders(status);

-- 每日盈亏统计
CREATE TABLE IF NOT EXISTS strategy_daily_pnl (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  realized_pnl DECIMAL(20, 8) DEFAULT 0,
  unrealized_pnl DECIMAL(20, 8) DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  win_trades INTEGER DEFAULT 0,
  loss_trades INTEGER DEFAULT 0,
  fees DECIMAL(20, 8) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
