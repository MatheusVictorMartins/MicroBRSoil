const crypto = require('crypto');

const DEFAULT_TTL_MS = 30 * 1000;
const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_MAX_BODY_SIZE = 2 * 1024 * 1024;

function normalizeBody(body) {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (body === undefined || body === null) return Buffer.from('');
  return Buffer.from(JSON.stringify(body));
}

function generateEtag(buffer) {
  const hash = crypto.createHash('sha1').update(buffer).digest('hex');
  return `"${hash}"`;
}

function defaultKeyBuilder(req, prefix) {
  const userId = req.user?.id ? `user:${req.user.id}` : `ip:${req.ip || 'unknown'}`;
  const base = `${req.method}:${req.originalUrl || req.url || ''}`;
  return prefix ? `${prefix}:${userId}:${base}` : `${userId}:${base}`;
}

function createResponseCache(options = {}) {
  const ttlMs = Number(options.ttlMs) || DEFAULT_TTL_MS;
  const maxEntries = Number(options.maxEntries) || DEFAULT_MAX_ENTRIES;
  const maxBodySize = Number(options.maxBodySize) || DEFAULT_MAX_BODY_SIZE;
  const keyPrefix = options.keyPrefix || '';
  const keyBuilder =
    options.keyBuilder || ((req) => defaultKeyBuilder(req, keyPrefix));

  const store = new Map();

  const prune = (now) => {
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt <= now) {
        store.delete(key);
      }
    }
    while (store.size > maxEntries) {
      const oldestKey = store.keys().next().value;
      if (!oldestKey) break;
      store.delete(oldestKey);
    }
  };

  return (req, res, next) => {
    if (req.method !== 'GET') return next();

    const cacheControl = String(req.headers['cache-control'] || '');
    const pragma = String(req.headers['pragma'] || '');
    if (cacheControl.includes('no-cache') || cacheControl.includes('no-store') || pragma.includes('no-cache')) {
      return next();
    }

    const key = keyBuilder(req);
    if (!key) return next();

    const now = Date.now();
    prune(now);

    const cached = store.get(key);
    if (cached && cached.expiresAt > now) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('ETag', cached.etag);
      res.setHeader('Cache-Control', cached.cacheControl);
      if (cached.contentType) {
        res.setHeader('Content-Type', cached.contentType);
      }

      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === cached.etag) {
        return res.status(304).end();
      }

      return res.status(cached.status).send(cached.body);
    }

    res.setHeader('X-Cache', 'MISS');

    const originalSend = res.send.bind(res);
    const originalJson = res.json.bind(res);

    const cacheResponse = (body, sender) => {
      const buffer = normalizeBody(body);
      if (buffer.length > maxBodySize) {
        return sender(body);
      }

      const etag = generateEtag(buffer);
      const cacheControlHeader = `private, max-age=${Math.floor(ttlMs / 1000)}`;

      res.setHeader('ETag', etag);
      if (!res.getHeader('Cache-Control')) {
        res.setHeader('Cache-Control', cacheControlHeader);
      }

      const response = sender(body);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        const contentType = res.getHeader('Content-Type');
        store.set(key, {
          body: buffer,
          etag,
          status: res.statusCode,
          contentType: contentType ? String(contentType) : '',
          cacheControl: cacheControlHeader,
          expiresAt: Date.now() + ttlMs
        });
      }

      return response;
    };

    res.send = (body) => cacheResponse(body, originalSend);
    res.json = (body) => cacheResponse(body, originalJson);

    return next();
  };
}

module.exports = {
  createResponseCache
};
