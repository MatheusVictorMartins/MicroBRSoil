const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { paths } = require('../utils/moduleResolver');
const userFunctions = require(paths.userFunctions());
const { requireAdmin, getTokenFromRequest, decodeToken, isAdminRole } = require('../middleware/authenticate');
const { apiLogger } = require('../utils/logger');
const { encryptPassword } = require('../utils/passwordView');

const router = express.Router();

const isProduction = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET;

const cookieOptions = {
  httpOnly: true,
  sameSite: 'Lax',
  secure: isProduction,
  maxAge: 3600000,
  path: '/'
};

const publicCookieOptions = {
  httpOnly: false,
  sameSite: 'Lax',
  secure: isProduction,
  maxAge: 3600000,
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

const serverErrorMessage = 'Erro interno do servidor';

// LOGIN
router.post('/login', async (req, res) => {
  const { temail, tpassword } = req.body;
  const nextPath = sanitizeNext(req.body.next || req.query.next || '/');

  if (!jwtSecret) {
    apiLogger.error('Login blocked: missing JWT secret', { requestId: req.id || 'login' });
    return res.status(500).send('Configuração ausente. Contate o administrador.');
  }

  if (!temail || !tpassword) {
    apiLogger.warn('Login attempt with missing credentials', { 
      emailProvided: Boolean(temail),
      passwordProvided: Boolean(tpassword),
      ip: req.ip 
    });
    return res.status(400).send('Usuário e senha são obrigatórios.');
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
      return res.status(400).send('Nome de usuário não existe.');
    }

    const userRow = checkUser.rows[0];
    const userRole = userRow.role_id ?? userRow.user_role;
    const senhaCorreta = await bcrypt.compare(tpassword, userRow.password_hash);
    if (!senhaCorreta) {
      apiLogger.warn('Login attempt with incorrect password', { 
        userId: userRow.user_id,
        ip: req.ip 
      });
      return res.status(401).send('Senha incorreta');
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
      { expiresIn: '1h' }
    );

    res.cookie('token', token, cookieOptions);
    res.cookie('auth_status', '1', publicCookieOptions);

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

// REGISTER (somente admins)
router.post('/register', requireAdmin, async (req, res) => {
  const { temail, tpassword, tconfpassword } = req.body;

  const reply = (status, payload) => {
    if (wantsJson(req)) {
      return res.status(status).json(payload);
    }
    return res.status(status).send(payload.message || payload);
  };

  try {
    if (!temail || !tpassword || !tconfpassword) {
      const message = 'Todos os campos são obrigatórios.';
      return reply(400, { success: false, message });
    }
  
    if (tpassword !== tconfpassword) {
      const message = 'As senhas não coincidem.';
      return reply(400, { success: false, message });
    }
  
    const checkUser = await userFunctions.logUser(temail);
  
    if (checkUser === false) {
      apiLogger.error('Register lookup failed', {
        emailHash: hashIdentifier(temail),
        ip: req.ip
      });
      const message = 'Erro ao consultar usuário no BD.';
      return reply(500, { success: false, message });
    }
  
    if (checkUser && checkUser.rowCount > 0) {
      apiLogger.warn('Register attempt with existing user', {
        emailHash: hashIdentifier(temail),
        ip: req.ip
      });
      const message = 'Nome de usuário já existe.';
      return reply(400, { success: false, message });
    }
  
    const passwordHash = await bcrypt.hash(tpassword, 10);
    const passwordView = encryptPassword(tpassword);
    const userResp = await userFunctions.createUser({ email: temail, password: passwordHash, passwordView });
  
    if (userResp === false){
      throw new Error('Erro no BD ao criar usuário.');
    }
  
    if (wantsJson(req)) {
      return res.status(201).json({ success: true, message: 'Usuário registrado com sucesso.' });
    }
  
    return res.redirect('/login');
  } catch (error) {
    apiLogger.error('Register error', {
      emailHash: hashIdentifier(temail),
      error: error.message,
      ip: req.ip
    });
    const message = error.message || 'Erro no BD.';
    return reply(500, { success: false, message });
  }
});

router.post('/logout', (req, res) => {
  apiLogger.info('Logout requested', {
    ip: req.ip
  });

  res.clearCookie('token', cookieOptions);
  res.clearCookie('auth_status', publicCookieOptions);

  return res.json({ success: true });
});

// Check authentication status for client-side UI updates
router.get('/status', (req, res) => {
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
    res.clearCookie('token', cookieOptions);
    res.clearCookie('auth_status', publicCookieOptions);
    return res.json({ authenticated: false });
  }
});


router.get('/api/userList', requireAdmin, async (req, res)=>{ 
  const userList = await userFunctions.listUsers();
  if(userList == false){
    return res.status(500).send('Erro no BD.');
  }
  res.json({userList : userList.rows});
});

module.exports = router;
