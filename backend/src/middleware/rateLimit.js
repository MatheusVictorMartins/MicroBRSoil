const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX = 60;

function wantsJson(req) {
  const acceptHeader = req.headers.accept || '';
  const contentType = req.headers['content-type'] || '';
  return (
    req.path.startsWith('/api/') ||
    req.originalUrl?.includes('/api/') ||
    acceptHeader.includes('application/json') ||
    contentType.includes('application/json') ||
    req.xhr === true
  );
}

function createRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs) || DEFAULT_WINDOW_MS;
  const max = Number(options.max) || DEFAULT_MAX;
  const statusCode = Number(options.statusCode) || 429;
  const message = options.message || 'Too many requests. Please try again later.';
  const keyGenerator =
    options.keyGenerator ||
    ((req) => (req.user?.id ? `user:${req.user.id}` : `ip:${req.ip || 'unknown'}`));
  const skip = options.skip || (() => false);

  const store = new Map();
  let lastCleanup = Date.now();

  const cleanup = (now) => {
    if (now - lastCleanup < windowMs) return;
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
    lastCleanup = now;
  };

  return (req, res, next) => {
    if (skip(req)) return next();

    const now = Date.now();
    cleanup(now);

    const key = String(keyGenerator(req) || 'unknown');
    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.ceil(entry.resetAt / 1000);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetSeconds));

    if (entry.count > max) {
      const retryAfter = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));

      if (wantsJson(req)) {
        return res.status(statusCode).json({ error: message });
      }
      return res.status(statusCode).send(message);
    }

    return next();
  };
}

module.exports = {
  createRateLimiter
};
