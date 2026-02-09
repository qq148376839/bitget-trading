-- 合约规格缓存表
CREATE TABLE IF NOT EXISTS contract_specs (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(32) NOT NULL,
  product_type VARCHAR(32) NOT NULL,
  base_coin VARCHAR(16),
  quote_coin VARCHAR(16),
  price_place INTEGER NOT NULL DEFAULT 2,
  volume_place INTEGER NOT NULL DEFAULT 4,
  min_trade_num DECIMAL(20, 8) NOT NULL DEFAULT 0.001,
  size_multiplier DECIMAL(20, 8) DEFAULT 1,
  maker_fee_rate DECIMAL(10, 6) DEFAULT 0.0002,
  taker_fee_rate DECIMAL(10, 6) DEFAULT 0.0006,
  raw_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, product_type)
);

CREATE INDEX IF NOT EXISTS idx_contract_specs_symbol ON contract_specs(symbol);

-- 资金费率历史表
CREATE TABLE IF NOT EXISTS funding_rate_history (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(32) NOT NULL,
  funding_rate DECIMAL(20, 10) NOT NULL,
  funding_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funding_rate_symbol_time ON funding_rate_history(symbol, funding_time);

-- 扩展 strategy_orders 表
ALTER TABLE strategy_orders ADD COLUMN IF NOT EXISTS symbol VARCHAR(32);
ALTER TABLE strategy_orders ADD COLUMN IF NOT EXISTS product_type VARCHAR(32);
ALTER TABLE strategy_orders ADD COLUMN IF NOT EXISTS margin_coin VARCHAR(16);
ALTER TABLE strategy_orders ADD COLUMN IF NOT EXISTS fee DECIMAL(20, 8) DEFAULT 0;
ALTER TABLE strategy_orders ADD COLUMN IF NOT EXISTS realized_pnl DECIMAL(20, 8) DEFAULT 0;
ALTER TABLE strategy_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
