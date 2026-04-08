-- Performance indexes for hot query paths (idempotent where supported).
-- Run: mysql -u ... restaurant_vip < sql/migration_v7_perf_indexes.sql

USE restaurant_vip;

-- Subscription lookup by restaurant + active + expiry (refresh / status)
CREATE INDEX idx_subscription_restaurant_status_expires
  ON subscription (restaurant_id, status, expires_at);

-- Table sessions: filter by restaurant + status
CREATE INDEX idx_sessions_restaurant_status_started
  ON table_sessions (restaurant_id, status, started_at DESC);

-- Orders: staff filters and participant joins
CREATE INDEX idx_orders_restaurant_session
  ON orders (restaurant_id, table_session_id, created_at DESC);

CREATE INDEX idx_orders_participant
  ON orders (participant_id, table_session_id);

-- Menu listing by restaurant
CREATE INDEX idx_menu_restaurant_available
  ON menu (restaurant_id, available);
