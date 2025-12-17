const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'segredo_super_secreto';
const ADMIN_ROLE_VALUES = ['admin', 'ADMIN', 1, '1'];

function wantsJson(req) {
  const accept = req.headers.accept || '';
  const contentType = req.headers['content-type'] || '';
  return (
    req.path.startsWith('/api/') ||
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
  return jwt.verify(token, JWT_SECRET);
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
      error: 'Autenticação necessária.',
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
    const message = 'Token inválido ou expirado.';
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
        return res.status(403).json({ error: 'Apenas administradores podem acessar este recurso.' });
      }
      return res.status(403).send('Acesso restrito a administradores.');
    }
    req.user = decoded;
    return next();
  } catch (err) {
    const message = 'Token inválido ou expirado.';
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
};
