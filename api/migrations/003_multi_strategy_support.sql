-- 多策略支持迁移

-- 策略配置表增加策略类型和交易类型
ALTER TABLE strategy_configs ADD COLUMN IF NOT EXISTS strategy_type VARCHAR(32) DEFAULT 'scalping';
ALTER TABLE strategy_configs ADD COLUMN IF NOT EXISTS trading_type VARCHAR(32) DEFAULT 'futures';

-- 策略订单表增加策略类型和交易类型
ALTER TABLE strategy_orders ADD COLUMN IF NOT EXISTS strategy_type VARCHAR(32) DEFAULT 'scalping';
ALTER TABLE strategy_orders ADD COLUMN IF NOT EXISTS trading_type VARCHAR(32) DEFAULT 'futures';
CREATE INDEX IF NOT EXISTS idx_strategy_orders_type ON strategy_orders(strategy_type, trading_type);

-- 每日盈亏表增加策略类型，修改唯一约束
ALTER TABLE strategy_daily_pnl ADD COLUMN IF NOT EXISTS strategy_type VARCHAR(32) DEFAULT 'scalping';
ALTER TABLE strategy_daily_pnl DROP CONSTRAINT IF EXISTS strategy_daily_pnl_date_key;
ALTER TABLE strategy_daily_pnl ADD CONSTRAINT strategy_daily_pnl_date_type_key UNIQUE(date, strategy_type);
