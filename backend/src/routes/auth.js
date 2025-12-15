const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { paths } = require('../utils/moduleResolver');
const userFunctions = require(paths.userFunctions());
const authenticate = require('../middleware/authenticate');

// Import logging system
const { apiLogger } = require('../utils/logger');

const router = express.Router();

// Helper to detect JSON-oriented calls (fetch/AJAX)
const wantsJson = (req) => {
  const acceptHeader = req.headers.accept || '';
  const contentType = req.headers['content-type'] || '';
  return acceptHeader.includes('application/json') || contentType.includes('application/json');
};

// LOGIN
router.post('/login', async (req, res) => {
  const { temail, tpassword } = req.body;

  if (!temail || !tpassword) {
    apiLogger.warn('Login attempt with missing credentials', { 
      email: temail ? 'provided' : 'missing',
      password: tpassword ? 'provided' : 'missing',
      ip: req.ip 
    });
    return res.status(400).send("Usuário e senha são obrigatórios.");
  }

  try {
    const checkUser = await userFunctions.logUser(temail);

    if (checkUser === false) {
      apiLogger.error('Login lookup failed', { 
        email: temail,
        ip: req.ip 
      });
      return res.status(500).send('Erro interno do servidor');
    }

    if (!checkUser || checkUser.rowCount === 0) {
      apiLogger.warn('Login attempt with non-existent user', { 
        email: temail,
        ip: req.ip 
      });
      return res.status(400).send('Nome de usuário não existe.');
    }

    const userRow = checkUser.rows[0];
    const userRole = userRow.role_id ?? userRow.user_role;
    const senhaCorreta = await bcrypt.compare(tpassword, userRow.password_hash);
    if (!senhaCorreta) {
      apiLogger.warn('Login attempt with incorrect password', { 
        email: temail,
        userId: userRow.user_id,
        ip: req.ip 
      });
      return res.status(401).send('Senha incorreta');
    }

    const token = jwt.sign(
      { id: userRow.user_id, username: userRow.user_email, role: userRole },
      process.env.JWT_SECRET || "segredo_super_secreto",
      { expiresIn: "1h" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: false, // true se estiver com HTTPS
      maxAge: 3600000,
      path: "/"
    });
    // Cookie auxiliar (não sensível) para o front detectar status mesmo se o fetch falhar
    res.cookie("auth_status", "1", {
      httpOnly: false,
      sameSite: "Lax",
      secure: false,
      maxAge: 3600000,
      path: "/"
    });

    apiLogger.info('Successful login', {
      email: temail,
      userId: userRow.user_id,
      role: userRole,
      ip: req.ip
    });

    res.redirect('/');
  } catch (error) {
    apiLogger.error('Login error', {
      email: temail,
      error: error.message,
      stack: error.stack,
      ip: req.ip
    });
    res.status(500).send('Erro interno do servidor');
  }
});

// REGISTER (somente simulação, sem autenticação de admin ainda)
router.post('/register', async (req, res) => {
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
  
    // Handle DB lookup failure separately
    if (checkUser === false) {
      apiLogger.error('Register lookup failed', {
        email: temail,
        ip: req.ip
      });
      const message = 'Erro ao consultar usuário no BD.';
      return reply(500, { success: false, message });
    }
  
    if (checkUser && checkUser.rowCount > 0) {
      apiLogger.warn('Register attempt with existing user', {
        email: temail,
        ip: req.ip
      });
      const message = 'Nome de usuário já existe.';
      return reply(400, { success: false, message });
    }
  
    const passwordHash = await bcrypt.hash(tpassword, 10);
    const userResp = await userFunctions.createUser({email: temail, password: passwordHash});
  
    if(userResp == false){
      throw new Error('Erro no BD ao criar usuário.');
    }
  
    if (wantsJson(req)) {
      return res.status(201).json({ success: true, message: 'Usuário registrado com sucesso.' });
    }
  
    return res.redirect('/login');
  } catch (error) {
    apiLogger.error('Register error', {
      email: temail,
      error: error.message,
      stack: error.stack,
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

  res.clearCookie('token', {
    httpOnly: true,
    sameSite: "Lax",
    secure: false,
    path: "/"
  });
  res.clearCookie('auth_status', {
    httpOnly: false,
    sameSite: "Lax",
    secure: false,
    path: "/"
  });

  // Always return JSON; client/UI decides the redirect
  return res.json({ success: true });
});

// Check authentication status for client-side UI updates
router.get('/status', (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "segredo_super_secreto");
    return res.json({
      authenticated: true,
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
    res.clearCookie('token');
    return res.json({ authenticated: false });
  }
});


router.get('/api/userList', authenticate, async (req, res)=>{ 
  const userList = await userFunctions.listUsers();
  if(userList == false){
    return res.status(500).send('Erro no BD.');
  }
  res.json({userList : userList.rows});
});

module.exports = router;
