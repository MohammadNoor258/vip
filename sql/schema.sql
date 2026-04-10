-- Restaurant VIP - MySQL 8+ schema (Hostinger ready)
-- Import this file into phpMyAdmin for a fresh database.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS restaurants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL DEFAULT 'Restaurant',
  slug VARCHAR(64) NOT NULL,
  logo_url VARCHAR(512) DEFAULT NULL,
  whatsapp_number VARCHAR(32) DEFAULT NULL,
  contact_name VARCHAR(128) DEFAULT NULL,
  contact_phone VARCHAR(32) DEFAULT NULL,
  contact_email VARCHAR(128) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_restaurants_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  restaurant_id INT UNSIGNED DEFAULT NULL,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'manager', 'waiter', 'cashier', 'superadmin') NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_restaurant (restaurant_id),
  CONSTRAINT fk_users_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  restaurant_id INT UNSIGNED NOT NULL,
  status ENUM('active', 'cancelled', 'suspended') NOT NULL DEFAULT 'active',
  plan_name VARCHAR(128) NOT NULL DEFAULT 'Standard',
  starts_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  notes VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscription_restaurant (restaurant_id),
  KEY idx_subscription_status_expires (status, expires_at),
  CONSTRAINT fk_subscription_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  restaurant_id INT UNSIGNED NOT NULL,
  name VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_menu_categories_restaurant_name (restaurant_id, name),
  KEY idx_menu_categories_restaurant_sort (restaurant_id, sort_order),
  CONSTRAINT fk_menu_categories_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tables` (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  restaurant_id INT UNSIGNED NOT NULL,
  table_number VARCHAR(32) NOT NULL,
  label VARCHAR(128) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tables_restaurant_number (restaurant_id, table_number),
  KEY idx_tables_restaurant (restaurant_id),
  CONSTRAINT fk_tables_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  restaurant_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  price DECIMAL(10,2) NOT NULL,
  image_url VARCHAR(512) DEFAULT NULL,
  available TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_menu_restaurant (restaurant_id),
  KEY idx_menu_category (category_id),
  KEY idx_menu_available (available),
  CONSTRAINT fk_menu_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_menu_category
    FOREIGN KEY (category_id) REFERENCES menu_categories(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS table_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  restaurant_id INT UNSIGNED NOT NULL,
  dining_table_id INT UNSIGNED NOT NULL,
  token VARCHAR(72) NOT NULL,
  status ENUM('active', 'ended') NOT NULL DEFAULT 'active',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME DEFAULT NULL,
  ended_by_user_id INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_table_sessions_token (token),
  KEY idx_table_sessions_restaurant_table_status (restaurant_id, dining_table_id, status),
  KEY idx_table_sessions_started (started_at),
  CONSTRAINT fk_table_sessions_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_table_sessions_table
    FOREIGN KEY (dining_table_id) REFERENCES `tables`(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_table_sessions_ended_by
    FOREIGN KEY (ended_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS session_participants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  table_session_id BIGINT UNSIGNED NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  phone VARCHAR(32) DEFAULT NULL,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_participants_session (table_session_id),
  KEY idx_participants_active (active),
  CONSTRAINT fk_participants_session
    FOREIGN KEY (table_session_id) REFERENCES table_sessions(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  restaurant_id INT UNSIGNED NOT NULL,
  dining_table_id INT UNSIGNED NOT NULL,
  table_session_id BIGINT UNSIGNED DEFAULT NULL,
  participant_id BIGINT UNSIGNED DEFAULT NULL,
  items JSON NOT NULL,
  total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status ENUM('new', 'preparing', 'ready', 'completed', 'cancelled') NOT NULL DEFAULT 'new',
  customer_note VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_orders_status (status),
  KEY idx_orders_created (created_at),
  KEY idx_orders_restaurant_created (restaurant_id, created_at),
  KEY idx_orders_table_session (table_session_id),
  KEY idx_orders_participant (participant_id),
  CONSTRAINT fk_orders_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_orders_table
    FOREIGN KEY (dining_table_id) REFERENCES `tables`(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_orders_session
    FOREIGN KEY (table_session_id) REFERENCES table_sessions(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_orders_participant
    FOREIGN KEY (participant_id) REFERENCES session_participants(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;