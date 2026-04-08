USE restaurant_vip;

ALTER TABLE restaurants
  ADD COLUMN whatsapp_number VARCHAR(32) NULL AFTER logo_url;

