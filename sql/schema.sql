-- Restaurant VIP — core schema (multi-restaurant + JWT-ready categories)
-- Run: mysql -u root -p restaurant_vip < sql/schema.sql

CREATE DATABASE IF NOT EXISTS restaurant_vip
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE restaurant_vip;

CREATE TABLE IF NOT EXISTS restaurants (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL DEFAULT 'Restaurant',
  slug VARCHAR(64) NOT NULL,
  logo_url VARCHAR(512) NULL,
  whatsapp_number VARCHAR(32) NULL,
  contact_name VARCHAR(128) NULL,
  contact_phone VARCHAR(32) NULL,
  contact_email VARCHAR(128) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_restaurants_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT UNSIGNED NULL,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'manager', 'waiter', 'cashier', 'superadmin') NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subscription (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT UNSIGNED NOT NULL,
  status ENUM('active', 'cancelled', 'suspended') NOT NULL DEFAULT 'active',
  plan_name VARCHAR(128) NOT NULL DEFAULT 'Standard',
  starts_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_subscription_restaurant (restaurant_id),
  CONSTRAINT fk_subscription_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS menu_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT UNSIGNED NOT NULL,
  name VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_menu_cat_rest_name (restaurant_id, name),
  CONSTRAINT fk_menu_cat_rest FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `tables` (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT UNSIGNED NOT NULL,
  table_number VARCHAR(32) NOT NULL,
  label VARCHAR(128) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rest_table (restaurant_id, table_number),
  CONSTRAINT fk_tables_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS menu (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  price DECIMAL(10, 2) NOT NULL,
  image_url VARCHAR(512) NULL,
  available TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_menu_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE,
  CONSTRAINT fk_menu_category FOREIGN KEY (category_id) REFERENCES menu_categories (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT UNSIGNED NOT NULL,
  dining_table_id INT UNSIGNED NOT NULL,
  table_session_id BIGINT UNSIGNED NULL,
  participant_id BIGINT UNSIGNED NULL,
  items JSON NOT NULL,
  total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status ENUM('new', 'preparing', 'ready', 'completed', 'cancelled') NOT NULL DEFAULT 'new',
  customer_note VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_table FOREIGN KEY (dining_table_id) REFERENCES `tables` (id),
  CONSTRAINT fk_orders_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_created ON orders (created_at DESC);
CREATE INDEX idx_orders_restaurant_created ON orders (restaurant_id, created_at DESC);
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
