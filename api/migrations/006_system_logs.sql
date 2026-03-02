-- 006: 系统日志持久化表
-- 支持结构化日志查询和自动清理

CREATE TABLE IF NOT EXISTS system_logs (
  id BIGSERIAL PRIMARY KEY,
  level VARCHAR(8) NOT NULL,
  module VARCHAR(64) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  correlation_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_module ON system_logs(module);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_correlation ON system_logs(correlation_id) WHERE correlation_id IS NOT NULL;
