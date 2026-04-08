-- Restaurant VIP — PostgreSQL Schema (Supabase Ready)

-- 1. إنشاء جدول المطاعم
CREATE TABLE IF NOT EXISTS restaurants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(128) NOT NULL DEFAULT 'Restaurant',
  slug VARCHAR(64) NOT NULL UNIQUE,
  logo_url VARCHAR(512),
  whatsapp_number VARCHAR(32),
  contact_name VARCHAR(128),
  contact_phone VARCHAR(32),
  contact_email VARCHAR(128),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. إنشاء جدول المستخدمين
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  restaurant_id INT REFERENCES restaurants(id) ON DELETE SET NULL,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role TEXT CHECK (role IN ('admin', 'manager', 'waiter', 'cashier', 'superadmin')) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. إنشاء جدول الاشتراكات
CREATE TABLE IF NOT EXISTS subscription (
  id SERIAL PRIMARY KEY,
  restaurant_id INT NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('active', 'cancelled', 'suspended')) NOT NULL DEFAULT 'active',
  plan_name VARCHAR(128) NOT NULL DEFAULT 'Standard',
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  notes VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. إنشاء تصنيفات المنيو
CREATE TABLE IF NOT EXISTS menu_categories (
  id SERIAL PRIMARY KEY,
  restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (restaurant_id, name)
);

-- 5. إنشاء الطاولات
CREATE TABLE IF NOT EXISTS tables (
  id SERIAL PRIMARY KEY,
  restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_number VARCHAR(32) NOT NULL,
  label VARCHAR(128),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (restaurant_id, table_number)
);

-- 6. إنشاء المنيو (الأصناف)
CREATE TABLE IF NOT EXISTS menu (
  id SERIAL PRIMARY KEY,
  restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id INT NOT NULL REFERENCES menu_categories(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  image_url VARCHAR(512),
  available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. إنشاء الطلبات
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  dining_table_id INT NOT NULL REFERENCES tables(id),
  table_session_id BIGINT,
  participant_id BIGINT,
  items JSONB NOT NULL,
  total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status TEXT CHECK (status IN ('new', 'preparing', 'ready', 'completed', 'cancelled')) NOT NULL DEFAULT 'new',
  customer_note VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- إنشاء الفهارس (Indexes) للسرعة
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_created ON orders (created_at DESC);
CREATE INDEX idx_orders_restaurant_created ON orders (restaurant_id, created_at DESC);

-- 8. جلسات الطاولات
CREATE TABLE IF NOT EXISTS table_sessions (
  id BIGSERIAL PRIMARY KEY,
  restaurant_id INT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  dining_table_id INT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  token VARCHAR(72) NOT NULL UNIQUE,
  status TEXT CHECK (status IN ('active', 'ended')) NOT NULL DEFAULT 'active',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP WITH TIME ZONE,
  ended_by_user_id INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. المشاركين في الجلسات
CREATE TABLE IF NOT EXISTS session_participants (
  id BIGSERIAL PRIMARY KEY,
  table_session_id BIGINT NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  display_name VARCHAR(64) NOT NULL,
  phone VARCHAR(32),
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN NOT NULL DEFAULT TRUE
);