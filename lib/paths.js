const path = require('path');

/**
 * Application root: directory containing server.js (stable even when Hostinger runs from ght/nodejs).
 */
const APP_ROOT = path.join(__dirname, '..');

/**
 * Static web root (default `public`). Override with PUBLIC_HTML_DIR if your folder name differs.
 * Always use path.join(APP_ROOT, ...) — never rely on cwd or relative ./public.
 */
const PUBLIC_REL = process.env.PUBLIC_HTML_DIR || 'public';
const PUBLIC_ROOT = path.join(APP_ROOT, PUBLIC_REL);

const LOCALES_ROOT = path.join(APP_ROOT, 'locales');
const UPLOADS_MENU_DIR = path.join(PUBLIC_ROOT, 'uploads', 'menu');
const UPLOADS_LOGO_DIR = path.join(PUBLIC_ROOT, 'uploads', 'logos');
const SQL_DIR = path.join(APP_ROOT, 'sql');

module.exports = {
  APP_ROOT,
  PUBLIC_REL,
  PUBLIC_ROOT,
  LOCALES_ROOT,
  UPLOADS_MENU_DIR,
  UPLOADS_LOGO_DIR,
  SQL_DIR,
};
