# Restaurant VIP — Node.js + Express + MySQL

Customer ordering (table QR), admin dashboard with Socket.io, and a subscription gate that blocks new orders when inactive.

## Prerequisites

- Node.js 18+
- MySQL 8 (JSON column support)

## Setup

1. Copy `.env.example` to `.env` and set MySQL credentials and `SESSION_SECRET`.

2. Create schema and database:

   ```bash
   npm install
   npm run db:setup
   ```

3. Load demo data (tables 1–10, sample menu, admin user, 1-year subscription):

   ```bash
   npm run db:seed
   ```

4. Start the server:

   ```bash
   npm start
   ```

- Customer menu: `http://localhost:3000/menu?table=5`
- Admin dashboard: `http://localhost:3000/admin.html`  
  Default login after seed: **`admin` / `admin123`** (change immediately).

## Subscription

- On startup the server loads subscription state from the **`subscription`** table (row with `expires_at > NOW()`), or from **`SUBSCRIPTION_API_URL`** if set (expects JSON with `active: true/false` or an `expiresAt` ISO string).
- State is refreshed every 60 seconds.
- When inactive, `POST /api/orders` returns **403** with `subscription_expired`, and the customer UI shows **Subscription expired**.

To test expiry, update MySQL:

```sql
UPDATE subscription SET expires_at = NOW() - INTERVAL 1 DAY WHERE id = 1;
```

Restart the app or wait for the next refresh.

## QR codes

Each row in the **`tables`** table has a `table_number`. QR PNG (links to `/menu?table=<number>`):

`GET /api/tables/<tableNumber>/qrcode.png`

Example: `http://localhost:3000/api/tables/5/qrcode.png`

Set **`PUBLIC_BASE_URL`** in `.env` so encoded URLs match your deployment host.

## REST API (summary)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/status` | No | `{ subscriptionActive, message }` |
| GET | `/api/menu` | No | Available menu items |
| GET | `/api/menu/all` | Admin session | All items |
| GET | `/api/tables` | No | List tables |
| GET | `/api/tables/:tableNumber/qrcode.png` | No | QR PNG |
| GET | `/api/tables/:tableNumber/link` | No | `{ url, tableNumber }` |
| POST | `/api/orders` | No* | Create order (blocked if subscription inactive) |
| GET | `/api/orders` | Admin session | List recent orders |
| PATCH | `/api/orders/:id/status` | Admin session | Status transition |
| POST | `/api/auth/login` | No | JSON `{ username, password }` |
| POST | `/api/auth/logout` | Session | |
| GET | `/api/auth/me` | Session | |

\*Customers are not logged in; only subscription must be active.

### Order body (`POST /api/orders`)

```json
{
  "tableNumber": "5",
  "items": [{ "menuId": 1, "quantity": 2 }],
  "customerNote": "optional"
}
```

### Status transitions (`PATCH /api/orders/:id/status`)

Allowed: `new` → `preparing` | `cancelled`; `preparing` → `ready` | `cancelled`; `ready` → `completed` | `cancelled`.

## Socket.io (admin)

After admin login, the client connects with `credentials: true`.

- Server emits `orders:snapshot` (array) on admin connect.
- `order:new` — new order created.
- `order:updated` — status changed.

## Database tables

- **`tables`** — physical table numbers for QR codes and order foreign keys (SQL identifier is backtick-quoted `` `tables` ``).
- **`menu`**
- **`orders`** — line items stored as JSON.
- **`users`** — admin accounts.
- **`subscription`** — plan window (`starts_at`, `expires_at`).
