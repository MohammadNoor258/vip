const { run, getStore } = require('../lib/requestContext');

function perfMiddleware(req, res, next) {
  const store = {
    queryCount: 0,
    dbTime: 0,
    statsCacheHit: null,
    statsCacheSource: null,
  };
  run(store, () => {
    const start = Date.now();
    res.on('finish', () => {
      const s = getStore();
      const totalMs = Date.now() - start;
      const path = req.originalUrl || req.url || req.path;
      const cache =
        s && s.statsCacheHit != null
          ? ` cacheHit=${s.statsCacheHit} cacheSource=${s.statsCacheSource || '-'}`
          : '';
      console.log(
        `[PERF] route=${path} queries=${s ? s.queryCount : 0} dbTime=${s ? s.dbTime : 0}ms totalTime=${totalMs}ms${cache}`
      );
    });
    next();
  });
}

function setStatsCacheMeta(hit, source) {
  const s = getStore();
  if (!s) return;
  s.statsCacheHit = hit;
  s.statsCacheSource = source;
}

module.exports = { perfMiddleware, setStatsCacheMeta };
