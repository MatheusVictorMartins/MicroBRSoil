const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const userFunctions = require('../db/db_functions/user_functions');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

// LOGIN
router.post('/login', async (req, res) => {
  const { temail, tpassword } = req.body;

  if (!temail || !tpassword) {
    return res.status(400).send("Usuário e senha são obrigatórios.");
  }

  const checkUser = await userFunctions.logUser(temail);

  if (checkUser == false) {
    return res.status(400).send('Nome de usuário não existe.');
  }

  const senhaCorreta = await bcrypt.compare(tpassword, checkUser.rows[0].password_hash);
  if (!senhaCorreta) {
    return res.status(401).send('Senha incorreta');
  }

  const token = jwt.sign(
    { id: checkUser.rows[0].user_id, username: checkUser.rows[0].user_email, role: checkUser.rows[0].user_role },
    process.env.JWT_SECRET || "segredo_super_secreto",
    { expiresIn: "1h" }
  );

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "Strict",
    secure: false, // true se estiver com HTTPS
    maxAge: 3600000
  });

  res.redirect('/');
});

// REGISTER (somente simulação, sem autenticação de admin ainda)
router.post('/register', async (req, res) => {
  const { temail, tpassword, tconfpassword } = req.body;

  if (!temail || !tpassword || !tconfpassword) {
    return res.status(400).send('Todos os campos são obrigatórios.');
  }

  if (tpassword !== tconfpassword) {
    return res.status(400).send('As senhas não coincidem.');
  }

  const checkUser = await userFunctions.logUser(temail);

  if (checkUser) {
    return res.status(400).send('Nome de usuário já existe.');
  }

  const passwordHash = await bcrypt.hash(tpassword, 10);

  const userResp = await userFunctions.createUser({email: temail, password: passwordHash});

  if(userResp == false){
    return res.status(500).send('Erro no BD.');
  }

  // res.send(`Usuário ${temail} registrado com sucesso.`);
  res.redirect('/login');
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});


router.get('/api/userList', authenticate, async (req, res)=>{ 
  const userList = await userFunctions.listUsers();
  if(userList == false){
    return res.status(500).send('Erro no BD.');
  }
  res.json({userList : userList.rows});
});

module.exports = router;
