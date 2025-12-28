const jwt = require('jsonwebtoken');
const { ROLES } = require('../constants');

const rawSecret = process.env.JWT_SECRET;
const secretList = (process.env.JWT_SECRETS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const previousSecrets = (process.env.JWT_SECRET_PREVIOUS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const jwtSecrets = secretList.length ? secretList : (rawSecret ? [rawSecret, ...previousSecrets] : []);

if (!jwtSecrets.length) {
  throw new Error('JWT_SECRET env var must be set to verify authentication tokens');
}

const activeJwtSecret = jwtSecrets[0];

const assertSecretStrength = (secret, label) => {
  if (!secret || secret.length < 16) {
    throw new Error(`${label} must be at least 16 characters long`);
  }
};

jwtSecrets.forEach((secret, index) => {
  const label = index === 0 ? 'JWT secret' : `JWT secret #${index + 1}`;
  assertSecretStrength(secret, label);
});
const ADMIN_ROLE_VALUES = ROLES.ADMIN_VALUES;

function wantsJson(req) {
  const accept = req.headers.accept || '';
  const contentType = req.headers['content-type'] || '';
  const originalUrl = req.originalUrl || '';
  const baseUrl = req.baseUrl || '';
  return (
    req.path.startsWith('/api/') ||
    baseUrl.startsWith('/api/') ||
    originalUrl.includes('/api/') ||
    accept.includes('application/json') ||
    contentType.includes('application/json') ||
    req.xhr === true
  );
}

function wantsApiResponse(req) {
  return wantsJson(req) || req.method !== 'GET';
}

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === 'string') {
    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token) {
      return token.trim();
    }
  }

  if (req.cookies?.token) {
    return req.cookies.token;
  }

  return null;
}

function decodeToken(token) {
  let lastError;
  for (const secret of jwtSecrets) {
    try {
      return jwt.verify(token, secret);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Invalid token');
}

function getJwtSecrets() {
  return [...jwtSecrets];
}

function getActiveJwtSecret() {
  return activeJwtSecret;
}

function isAdminRole(role) {
  if (role === undefined || role === null) return false;
  if (typeof role === 'string' && ADMIN_ROLE_VALUES.includes(role)) return true;
  if (typeof role === 'number' && ADMIN_ROLE_VALUES.includes(role)) return true;

  const asNumber = Number(role);
  if (!Number.isNaN(asNumber) && ADMIN_ROLE_VALUES.includes(asNumber)) return true;

  const asString = String(role);
  return ADMIN_ROLE_VALUES.includes(asString);
}

function unauthorizedResponse(req, res) {
  const nextPath = encodeURIComponent(req.originalUrl || '/');
  const redirect = `/login?next=${nextPath}`;

  if (wantsApiResponse(req)) {
    return res.status(401).json({
      error: 'Authentication required.',
      redirect
    });
  }

  return res.redirect(redirect);
}

function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return unauthorizedResponse(req, res);
  }

  try {
    const decoded = decodeToken(token);
    req.user = decoded;
    return next();
  } catch (err) {
    const message = 'Token is invalid or expired.';
    if (wantsApiResponse(req)) {
      return res.status(403).json({ error: message });
    }
    return res.status(403).send(message);
  }
}

function optionalAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return next();
  }

  try {
    req.user = decodeToken(token);
  } catch (err) {
    // ignore invalid tokens in optional flow
  }
  return next();
}

function requireAdmin(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return unauthorizedResponse(req, res);
  }

  try {
    const decoded = decodeToken(token);
    if (!isAdminRole(decoded.role)) {
      if (wantsApiResponse(req)) {
        return res.status(403).json({ error: 'Only administrators can access this resource.' });
      }
      return res.status(403).send('Access restricted to administrators.');
    }
    req.user = decoded;
    return next();
  } catch (err) {
    const message = 'Token is invalid or expired.';
    if (wantsApiResponse(req)) {
      return res.status(403).json({ error: message });
    }
    return res.status(403).send(message);
  }
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireAdmin,
  getTokenFromRequest,
  decodeToken,
  isAdminRole,
  getJwtSecrets,
  getActiveJwtSecret,
};
