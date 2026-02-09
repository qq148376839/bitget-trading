-- 现货交易对规格表 + 网格策略层级表

CREATE TABLE IF NOT EXISTS spot_specs (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(32) NOT NULL UNIQUE,
  base_coin VARCHAR(16),
  quote_coin VARCHAR(16),
  price_place INTEGER DEFAULT 2,
  volume_place INTEGER DEFAULT 4,
  min_trade_num DECIMAL(20,8) DEFAULT 0.001,
  maker_fee_rate DECIMAL(10,6),
  taker_fee_rate DECIMAL(10,6),
  raw_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grid_levels (
  id BIGSERIAL PRIMARY KEY,
  strategy_instance_id VARCHAR(64) NOT NULL,
  level_index INTEGER NOT NULL,
  price DECIMAL(20,8) NOT NULL,
  state VARCHAR(16) DEFAULT 'empty',
  buy_order_id VARCHAR(64),
  sell_order_id VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(strategy_instance_id, level_index)
);
