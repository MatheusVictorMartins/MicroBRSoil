const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { paths } = require('../utils/moduleResolver');
const userFunctions = require(paths.userFunctions());
const { requireAdmin, getTokenFromRequest, decodeToken, isAdminRole, getActiveJwtSecret } = require('../middleware/authenticate');
const { createRateLimiter } = require('../middleware/rateLimit');
const { apiLogger } = require('../utils/logger');
const { encryptPassword } = require('../utils/passwordView');

const router = express.Router();

const isProduction = process.env.NODE_ENV === 'production';
const cookieSecure = process.env.COOKIE_SECURE !== undefined
  ? String(process.env.COOKIE_SECURE).toLowerCase() === 'true'
  : isProduction;
const jwtSecret = getActiveJwtSecret();

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || '7d';

const parseDurationMs = (value, fallbackMs) => {
  if (value === undefined || value === null || value === '') return fallbackMs;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return fallbackMs;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)(ms|s|m|h|d)$/i);
  if (match) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };
    return amount * (multipliers[unit] || 1);
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : fallbackMs;
};

const ACCESS_COOKIE_MAX_AGE = parseDurationMs(
  process.env.ACCESS_TOKEN_COOKIE_MAX_AGE || ACCESS_TOKEN_TTL,
  15 * 60 * 1000
);
const REFRESH_COOKIE_MAX_AGE = parseDurationMs(
  process.env.REFRESH_TOKEN_COOKIE_MAX_AGE || REFRESH_TOKEN_TTL,
  7 * 24 * 60 * 60 * 1000
);

const accessCookieOptions = {
  httpOnly: true,
  sameSite: 'Lax',
  secure: cookieSecure,
  maxAge: ACCESS_COOKIE_MAX_AGE,
  path: '/'
};

const publicCookieOptions = {
  httpOnly: false,
  sameSite: 'Lax',
  secure: cookieSecure,
  maxAge: ACCESS_COOKIE_MAX_AGE,
  path: '/'
};

const refreshCookieOptions = {
  httpOnly: true,
  sameSite: 'Lax',
  secure: cookieSecure,
  maxAge: REFRESH_COOKIE_MAX_AGE,
  path: '/'
};

const wantsJson = (req) => {
  const acceptHeader = req.headers.accept || '';
  const contentType = req.headers['content-type'] || '';
  return acceptHeader.includes('application/json') || contentType.includes('application/json');
};

const sanitizeNext = (value = '/') => {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/')) return '/';
  return value;
};

const hashIdentifier = (value) => {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
};

const serverErrorMessage = 'Internal server error';

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again later.',
  keyGenerator: (req) => {
    const email = String(req.body?.temail || '').toLowerCase();
    return `login:${req.ip}:${email}`;
  }
});

const registerLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many register attempts. Please try again later.',
  keyGenerator: (req) => `register:${req.ip}`
});

const statusLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many status checks. Please slow down.'
});

const refreshLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many refresh attempts. Please try again later.',
  keyGenerator: (req) => `refresh:${req.ip}`
});

// LOGIN
router.post('/login', loginLimiter, async (req, res) => {
  const { temail, tpassword } = req.body;
  const nextPath = sanitizeNext(req.body.next || req.query.next || '/');

  if (!jwtSecret) {
    apiLogger.error('Login blocked: missing JWT secret', { requestId: req.id || 'login' });
    return res.status(500).send('Missing configuration. Contact the administrator.');
  }

  if (!temail || !tpassword) {
    apiLogger.warn('Login attempt with missing credentials', { 
      emailProvided: Boolean(temail),
      passwordProvided: Boolean(tpassword),
      ip: req.ip 
    });
    return res.status(400).send('Email and password are required.');
  }

  try {
    const checkUser = await userFunctions.logUser(temail);

    if (checkUser === false) {
      apiLogger.error('Login lookup failed', { 
        emailHash: hashIdentifier(temail),
        ip: req.ip 
      });
      return res.status(500).send(serverErrorMessage);
    }

    if (!checkUser || checkUser.rowCount === 0) {
      apiLogger.warn('Login attempt with non-existent user', { 
        emailHash: hashIdentifier(temail),
        ip: req.ip 
      });
      return res.status(400).send('User not found.');
    }

    const userRow = checkUser.rows[0];
    const userRole = userRow.role_id ?? userRow.user_role;
    const isPasswordCorrect = await bcrypt.compare(tpassword, userRow.password_hash);
    if (!isPasswordCorrect) {
      apiLogger.warn('Login attempt with incorrect password', { 
        userId: userRow.user_id,
        ip: req.ip 
      });
      return res.status(401).send('Incorrect password');
    }

    if (!userRow.password_view) {
      try {
        const passwordView = encryptPassword(tpassword);
        if (passwordView) {
          await userFunctions.updatePasswordView({ userId: userRow.user_id, passwordView });
        }
      } catch (error) {
        apiLogger.warn('Password view update failed', {
          userId: userRow.user_id,
          error: error.message
        });
      }
    }

    const token = jwt.sign(
      { id: userRow.user_id, username: userRow.user_email, role: userRole },
      jwtSecret,
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    res.cookie('token', token, accessCookieOptions);
    res.cookie('auth_status', '1', publicCookieOptions);

    const refreshToken = crypto.randomBytes(48).toString('hex');
    const refreshExpiresAt = new Date(Date.now() + REFRESH_COOKIE_MAX_AGE);
    const refreshSaved = await userFunctions.updateRefreshToken({
      userId: userRow.user_id,
      refreshToken,
      expiresAt: refreshExpiresAt
    });
    if (refreshSaved) {
      res.cookie('refresh_token', refreshToken, refreshCookieOptions);
    } else {
      apiLogger.warn('Refresh token not stored for user', {
        userId: userRow.user_id
      });
    }

    apiLogger.info('Successful login', {
      userId: userRow.user_id,
      role: userRole,
      ip: req.ip,
      nextPath
    });

    if (wantsJson(req)) {
      return res.json({ success: true, redirect: nextPath });
    }

    return res.redirect(nextPath);
  } catch (error) {
    apiLogger.error('Login error', {
      emailHash: hashIdentifier(temail),
      error: error.message,
      ip: req.ip
    });
    return res.status(500).send(serverErrorMessage);
  }
});

// REGISTER (admins only)
router.post('/register', requireAdmin, registerLimiter, async (req, res) => {
  const { temail, tpassword, tconfpassword } = req.body;

  const reply = (status, payload) => {
    if (wantsJson(req)) {
      return res.status(status).json(payload);
    }
    return res.status(status).send(payload.message || payload);
  };

  try {
    if (!temail || !tpassword || !tconfpassword) {
      const message = 'All fields are required.';
      return reply(400, { success: false, message });
    }
  
    if (tpassword !== tconfpassword) {
      const message = 'Passwords do not match.';
      return reply(400, { success: false, message });
    }
  
    const checkUser = await userFunctions.logUser(temail);
  
    if (checkUser === false) {
      apiLogger.error('Register lookup failed', {
        emailHash: hashIdentifier(temail),
        ip: req.ip
      });
      const message = 'Database error while looking up user.';
      return reply(500, { success: false, message });
    }
  
    if (checkUser && checkUser.rowCount > 0) {
      apiLogger.warn('Register attempt with existing user', {
        emailHash: hashIdentifier(temail),
        ip: req.ip
      });
      const message = 'User already exists.';
      return reply(400, { success: false, message });
    }
  
    const passwordHash = await bcrypt.hash(tpassword, 10);
    const passwordView = encryptPassword(tpassword);
    const userResp = await userFunctions.createUser({ email: temail, password: passwordHash, passwordView });
  
    if (userResp === false){
      throw new Error('Database error while creating user.');
    }
  
    if (wantsJson(req)) {
      return res.status(201).json({ success: true, message: 'User registered successfully.' });
    }
  
    return res.redirect('/login');
  } catch (error) {
    apiLogger.error('Register error', {
      emailHash: hashIdentifier(temail),
      error: error.message,
      ip: req.ip
    });
    const message = error.message || 'Database error.';
    return reply(500, { success: false, message });
  }
});

router.post('/logout', async (req, res) => {
  apiLogger.info('Logout requested', {
    ip: req.ip
  });

  const refreshToken = req.cookies?.refresh_token;
  if (refreshToken) {
    try {
      const tokenHash = crypto.createHash('sha256').update(String(refreshToken)).digest('hex');
      const userFromRefresh = await userFunctions.getUserByRefreshTokenHash(tokenHash);
      if (userFromRefresh?.user_id) {
        await userFunctions.clearRefreshToken({ userId: userFromRefresh.user_id });
      }
    } catch (error) {
      apiLogger.warn('Failed to clear refresh token on logout', {
        error: error.message
      });
    }
  } else {
    const accessToken = getTokenFromRequest(req);
    if (accessToken) {
      try {
        const decoded = decodeToken(accessToken);
        if (decoded?.id) {
          await userFunctions.clearRefreshToken({ userId: decoded.id });
        }
      } catch (error) {
        apiLogger.warn('Failed to decode access token on logout', {
          error: error.message
        });
      }
    }
  }

  res.clearCookie('token', accessCookieOptions);
  res.clearCookie('refresh_token', refreshCookieOptions);
  res.clearCookie('auth_status', publicCookieOptions);

  return res.json({ success: true });
});

// Refresh access token using refresh token cookie
router.post('/refresh', refreshLimiter, async (req, res) => {
  const refreshToken = req.cookies?.refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token missing' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(String(refreshToken)).digest('hex');
    const user = await userFunctions.getUserByRefreshTokenHash(tokenHash);

    if (!user) {
      res.clearCookie('refresh_token', refreshCookieOptions);
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const expiresAt = user.refresh_token_expires_at ? new Date(user.refresh_token_expires_at) : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      await userFunctions.clearRefreshToken({ userId: user.user_id });
      res.clearCookie('refresh_token', refreshCookieOptions);
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    const newRefreshToken = crypto.randomBytes(48).toString('hex');
    const newRefreshExpiresAt = new Date(Date.now() + REFRESH_COOKIE_MAX_AGE);
    const refreshSaved = await userFunctions.updateRefreshToken({
      userId: user.user_id,
      refreshToken: newRefreshToken,
      expiresAt: newRefreshExpiresAt
    });

    if (!refreshSaved) {
      return res.status(500).json({ error: 'Failed to rotate refresh token' });
    }

    const roleValue = user.role_id ?? user.user_role;
    const newAccessToken = jwt.sign(
      { id: user.user_id, username: user.user_email, role: roleValue },
      jwtSecret,
      { expiresIn: ACCESS_TOKEN_TTL }
    );

    res.cookie('token', newAccessToken, accessCookieOptions);
    res.cookie('refresh_token', newRefreshToken, refreshCookieOptions);
    res.cookie('auth_status', '1', publicCookieOptions);

    return res.json({ success: true });
  } catch (error) {
    apiLogger.error('Refresh error', {
      error: error.message,
      ip: req.ip
    });
    return res.status(500).json({ error: serverErrorMessage });
  }
});

// Check authentication status for client-side UI updates
router.get('/status', statusLimiter, (req, res) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    const decoded = decodeToken(token);
    const adminFlag = isAdminRole(decoded.role);
    return res.json({
      authenticated: true,
      isAdmin: adminFlag,
      user: {
        id: decoded.id,
        email: decoded.username,
        role: decoded.role
      }
    });
  } catch (error) {
    apiLogger.warn('Invalid auth status check', {
      error: error.message,
      ip: req.ip
    });
    res.clearCookie('token', accessCookieOptions);
    res.clearCookie('auth_status', publicCookieOptions);
    return res.json({ authenticated: false });
  }
});


router.get('/api/userList', requireAdmin, async (req, res)=>{ 
  const userList = await userFunctions.listUsers();
  if(userList == false){
    return res.status(500).send('Database error.');
  }
  res.json({userList : userList.rows});
});

module.exports = router;
