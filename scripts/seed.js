const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
require('dotenv').config();

async function main() {
  const [existingTables] = await pool.query('SELECT COUNT(*) AS c FROM `tables`');
  if (existingTables[0].c > 0) {
    console.log('Seed skipped: tables already has rows.');
    return;
  }

  await pool.query(
    'INSERT INTO restaurants (id, name, slug, whatsapp_number, contact_name, contact_phone) VALUES (1, ?, ?, ?, ?, ?)',
    ['Main Restaurant', 'main', '+962700000000', 'Owner', '+100000000']
  );

  const catDefs = [
    ['Starters', 1],
    ['Mains', 2],
    ['Desserts', 3],
    ['Drinks', 4],
  ];
  const catIds = {};
  for (const [name, sort] of catDefs) {
    const [r] = await pool.query(
      'INSERT INTO menu_categories (restaurant_id, name, sort_order) VALUES (1, ?, ?)',
      [name, sort]
    );
    catIds[name] = r.insertId;
  }

  for (let i = 1; i <= 10; i += 1) {
    await pool.query(
      'INSERT INTO `tables` (restaurant_id, table_number, label) VALUES (1, ?, ?)',
      [String(i), `Table ${i}`]
    );
  }

  const menu = [
    ['Margherita Pizza', 'Tomato, mozzarella, basil', 12.5, 'Mains'],
    ['Caesar Salad', 'Romaine, parmesan, croutons', 9.0, 'Starters'],
    ['Grilled Salmon', 'Lemon butter, seasonal veg', 18.0, 'Mains'],
    ['Beef Burger', 'Cheddar, pickles, fries', 14.0, 'Mains'],
    ['Tomato Soup', 'With herb oil', 6.5, 'Starters'],
    ['Chocolate Brownie', 'Vanilla ice cream', 5.5, 'Desserts'],
    ['Espresso', 'Double shot', 3.0, 'Drinks'],
    ['House Red', 'Glass', 7.0, 'Drinks'],
  ];

  for (const [name, description, price, catName] of menu) {
    const cid = catIds[catName];
    await pool.query(
      'INSERT INTO menu (restaurant_id, category_id, name, description, price) VALUES (1, ?, ?, ?, ?)',
      [cid, name, description, price]
    );
  }

  const hashAdmin = await bcrypt.hash('admin123', 10);
  await pool.query(
    'INSERT INTO users (restaurant_id, username, password_hash, role) VALUES (1, ?, ?, ?)',
    ['admin', hashAdmin, 'admin']
  );

  const hashCashier = await bcrypt.hash('cashier123', 10);
  await pool.query(
    'INSERT INTO users (restaurant_id, username, password_hash, role) VALUES (1, ?, ?, ?)',
    ['cashier', hashCashier, 'cashier']
  );

  const hashSuper = await bcrypt.hash('super123', 10);
  await pool.query(
    'INSERT INTO users (restaurant_id, username, password_hash, role) VALUES (NULL, ?, ?, ?)',
    ['superadmin', hashSuper, 'superadmin']
  );

  const start = new Date();
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  await pool.query(
    'INSERT INTO subscription (restaurant_id, status, plan_name, starts_at, expires_at, notes) VALUES (1, ?, ?, ?, ?, ?)',
    ['active', 'Standard', start, end, 'Seed subscription']
  );

  console.log('Seed complete: categories, restaurant 1, tables 1–10, admin/admin123, cashier/cashier123, superadmin/super123.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
