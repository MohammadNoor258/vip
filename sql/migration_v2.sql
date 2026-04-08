-- Upgrade single-tenant schema to multi-restaurant (run once on existing DB)
USE restaurant_vip;

CREATE TABLE IF NOT EXISTS restaurants (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL DEFAULT 'Restaurant',
  slug VARCHAR(64) NOT NULL,
  logo_url VARCHAR(512) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_restaurants_slug (slug)
) ENGINE=InnoDB;

INSERT IGNORE INTO restaurants (id, name, slug) VALUES (1, 'Main Restaurant', 'main');

-- Users: add restaurant_id and expand roles
ALTER TABLE users
  ADD COLUMN restaurant_id INT UNSIGNED NULL AFTER id,
  ADD CONSTRAINT fk_users_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE SET NULL;

ALTER TABLE users
  MODIFY COLUMN role ENUM('admin', 'manager', 'waiter', 'cashier', 'superadmin') NOT NULL DEFAULT 'admin';

UPDATE users SET restaurant_id = 1 WHERE restaurant_id IS NULL AND role <> 'superadmin';

-- Subscription: add restaurant_id (one row per restaurant)
ALTER TABLE subscription ADD COLUMN restaurant_id INT UNSIGNED NULL AFTER id;
UPDATE subscription SET restaurant_id = 1 WHERE restaurant_id IS NULL;
ALTER TABLE subscription MODIFY restaurant_id INT UNSIGNED NOT NULL;
ALTER TABLE subscription ADD CONSTRAINT fk_subscription_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE;
ALTER TABLE subscription ADD UNIQUE KEY uq_subscription_restaurant (restaurant_id);

-- Menu
ALTER TABLE menu ADD COLUMN restaurant_id INT UNSIGNED NULL DEFAULT 1 AFTER id;
ALTER TABLE menu ADD COLUMN image_url VARCHAR(512) NULL AFTER category;
UPDATE menu SET restaurant_id = 1 WHERE restaurant_id IS NULL;
ALTER TABLE menu MODIFY restaurant_id INT UNSIGNED NOT NULL;
ALTER TABLE menu ADD CONSTRAINT fk_menu_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE;

-- Tables: composite unique (restaurant_id, table_number)
ALTER TABLE `tables` ADD COLUMN restaurant_id INT UNSIGNED NULL DEFAULT 1 AFTER id;
UPDATE `tables` SET restaurant_id = 1 WHERE restaurant_id IS NULL;
ALTER TABLE `tables` DROP INDEX table_number;
ALTER TABLE `tables` ADD UNIQUE KEY uq_rest_table (restaurant_id, table_number);
ALTER TABLE `tables` MODIFY restaurant_id INT UNSIGNED NOT NULL;
ALTER TABLE `tables` ADD CONSTRAINT fk_tables_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE;

-- Orders
ALTER TABLE orders ADD COLUMN restaurant_id INT UNSIGNED NULL DEFAULT 1 AFTER id;
UPDATE orders o
  INNER JOIN `tables` t ON t.id = o.dining_table_id
  SET o.restaurant_id = t.restaurant_id
  WHERE o.restaurant_id IS NULL OR o.restaurant_id = 1;
ALTER TABLE orders MODIFY restaurant_id INT UNSIGNED NOT NULL;
ALTER TABLE orders ADD CONSTRAINT fk_orders_restaurant FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE;
CREATE INDEX idx_orders_restaurant_created ON orders (restaurant_id, created_at DESC);
