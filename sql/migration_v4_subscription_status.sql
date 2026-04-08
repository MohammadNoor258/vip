-- Migration v4: subscription.status
USE restaurant_vip;

ALTER TABLE subscription
  ADD COLUMN status ENUM('active', 'cancelled', 'suspended') NOT NULL DEFAULT 'active' AFTER restaurant_id;

UPDATE subscription SET status = 'active' WHERE status IS NULL;

