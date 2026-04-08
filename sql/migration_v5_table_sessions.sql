USE restaurant_vip;

ALTER TABLE restaurants
  ADD COLUMN contact_name VARCHAR(128) NULL AFTER logo_url,
  ADD COLUMN contact_phone VARCHAR(32) NULL AFTER contact_name,
  ADD COLUMN contact_email VARCHAR(128) NULL AFTER contact_phone;

ALTER TABLE orders
  ADD COLUMN table_session_id BIGINT UNSIGNED NULL AFTER dining_table_id,
  ADD COLUMN participant_id BIGINT UNSIGNED NULL AFTER table_session_id;

CREATE INDEX idx_orders_table_session ON orders (table_session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS table_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT UNSIGNED NOT NULL,
  dining_table_id INT UNSIGNED NOT NULL,
  token VARCHAR(72) NOT NULL UNIQUE,
  status ENUM('active', 'ended') NOT NULL DEFAULT 'active',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  ended_by_user_id INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_table FOREIGN KEY (dining_table_id) REFERENCES `tables` (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_sessions_table_status ON table_sessions (dining_table_id, status, started_at DESC);

CREATE TABLE IF NOT EXISTS session_participants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  table_session_id BIGINT UNSIGNED NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  phone VARCHAR(32) NULL,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_participants_session FOREIGN KEY (table_session_id) REFERENCES table_sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_participants_session ON session_participants (table_session_id, active, joined_at);

