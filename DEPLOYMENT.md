# Hostinger deployment checklist

This app is an **Express** server with **Socket.IO**, **MySQL** (`mysql2`), and static files under `public/`. The Node.js entry file is **`server.js`**. Use **npm** (not pnpm/yarn) so Hostinger’s install step matches your lockfile.

## How Hostinger Node.js hosting works (short)

### `.htaccess` and SSL

Hostinger typically **generates or manages `.htaccess`** in your web root (`public_html`) to route HTTP(S) traffic to **Phusion Passenger**, enforce **HTTPS**, and handle redirects. You usually **do not** need to hand-edit `.htaccess` for a standard Node app unless you add custom rewrites; conflicting rules can prevent Passenger from reaching your app and may surface as **503** errors.

### `.builds` and internal paths (`ght/nodejs`)

During deployment, Hostinger may create a **`.builds`** directory containing **`config`** and **`logs`**, and it may run your application from an internal path such as **`ght/nodejs`**. Your code must **not** assume the current working directory (`process.cwd()`) is the project root. This project uses **`path.join(__dirname, ...)`** (via `lib/paths.js`) so **`public`**, **`uploads`**, and **`locales`** resolve correctly wherever Passenger mounts the app.

### `node_modules`

**Do not upload `node_modules`.** Hostinger runs **`npm install`** from your `package.json` (and `package-lock.json` if present) during deployment. Uploading a partial `node_modules` tree often causes errors like **“Cannot find module …”** and **503** responses.

---

## Requirements

| Item | Value |
|------|--------|
| Node.js | **20.x or higher** (supported on 20, 22, 24 per `package.json` `engines`) |
| Entry | **`server.js`** |
| Package manager | **npm** |
| Database | **MySQL** on Hostinger (credentials from hPanel) |
| Domain | **https://thaka-smarttable.com** (SSL enabled in hPanel) |

---

## Environment variables (hPanel → Node.js → Environment variables)

Set these in the panel; **do not hardcode** secrets in the repository.

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | `production` |
| `MYSQL_HOST` | e.g. `auth-db1803.hstgr.io` |
| `MYSQL_PORT` | `3306` |
| `MYSQL_DATABASE` | Your DB name |
| `MYSQL_USER` | Your DB user |
| `MYSQL_PASSWORD` | Your DB password |
| `MYSQL_POOL_MAX` | `10` (tune down if needed on small plans; pool is in `config/database.js`) |
| `SESSION_SECRET` | Strong random string |
| `JWT_SECRET` | Strong random string |
| `PUBLIC_BASE_URL` | `https://thaka-smarttable.com` (no trailing slash; used for QR/table links) |
| `CORS_ORIGINS` | Comma-separated origins, e.g. `https://thaka-smarttable.com,https://www.thaka-smarttable.com` |
| `TRUST_PROXY` | `1` recommended behind Hostinger/SSL termination |

**Passenger** sets **`PORT`** automatically. Local fallback in code is `3000` for development only.

Optional:

| Variable | Purpose |
|----------|---------|
| `PUBLIC_HTML_DIR` | Folder name for static files relative to app root (default `public`). Use if your deployed layout differs. |
| `DEBUG_STARTUP` | `1` logs extra startup diagnostics |

Copy from **`.env.example`** and fill in real values; keep **`.env` out of git** (already in `.gitignore`).

---

## Folder layout on the server

Typical layout after upload:

- `server.js` (entry)
- `package.json`, `package-lock.json`
- `public/` — HTML/JS/CSS and `public/uploads/` for uploaded images (created at runtime if missing)
- `locales/` — JSON locale files
- `routes/`, `middleware/`, `config/`, `lib/`, `services/`, etc.

If you map **`public_html`** to only the static site and run Node elsewhere, either:

- deploy the **full** app and point the app’s static root with `PUBLIC_HTML_DIR`, or  
- keep **`public`** as the static bundle folder name inside the Node app (default).

---

## Database

1. Create the database in hPanel (MySQL).
2. Import **`sql/schema.sql`** via **phpMyAdmin** (or run `npm run db:setup` from SSH if configured with the same env vars).
3. Optionally seed: `npm run db:seed` (SSH, with env loaded).

---

## Health check (avoids blind 503 debugging)

After deploy, verify the process responds without hitting the database:

- `GET /health`
- `GET /api/health`

Both return **`200`** with JSON `{ ok: true, ... }`. Use these in monitoring or support tickets to confirm Passenger is routing to Node.

---

## Socket.IO (real-time)

The UI connects to the **same origin** as the site; Socket.IO uses the default path **`/socket.io`**. Ensure:

- **`CORS_ORIGINS`** includes every browser origin you use (apex + `www` if both exist).
- **`TRUST_PROXY=1`** if you terminate SSL in front of Node.

After env changes, **restart** the Node app in hPanel.

---

## Deployment steps (checklist)

1. Set **Node.js version** to **20+** in hPanel.
2. Set **Application startup file** to **`server.js`**.
3. Upload project **without** `node_modules` (and without `.env` in public repos).
4. Configure **environment variables** (see table above).
5. Let Hostinger run **`npm install`** (or trigger deploy / install).
6. **Restart** the Node application.
7. Open **`https://thaka-smarttable.com/health`** — expect `200` JSON.
8. Confirm **`https://thaka-smarttable.com/menu`** loads.
9. Test staff login and a live order; confirm Socket.IO updates without full page refresh.

---

## Performance notes (3 GB RAM / 2 cores)

- MySQL pool size: start with **`MYSQL_POOL_MAX=10`**; reduce if you see memory pressure.
- Redis is optional for this codebase; if unused, it does not start a server by default.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| 503 | Wrong startup file, app crash on boot, or `PORT` mismatch (Passenger must own the port). |
| Cannot find module | Incomplete `node_modules`; delete `node_modules` on server and reinstall. |
| Socket fails / CORS | Missing origin in `CORS_ORIGINS` or `www` vs apex mismatch. |
| Wrong static files | `PUBLIC_HTML_DIR` or deploy path; ensure `public` exists next to `server.js`. |

---

## Local development

```bash
cp .env.example .env
# edit .env for local MySQL or tunnel
npm install
npm start
```

Use Node **20+** locally to match production.
