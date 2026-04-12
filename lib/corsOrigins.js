/**
 * CORS / Socket.IO allowed origins from environment (no hardcoded production domain).
 */
function parseAllowedOrigins() {
  const fromCors = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (fromCors.length) return fromCors;

  const base = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (base) return [base];

  if (process.env.NODE_ENV !== 'production') {
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }

  return [];
}

module.exports = { parseAllowedOrigins };
