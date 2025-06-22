const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const { users, pipelines, samples } = require('../utils/fakeDB');

const router = express.Router();

// LOGIN
router.post('/login', async (req, res) => {
  const { user, tpassword } = req.body;

  if (!user || !tpassword) {
    return res.status(400).send("Usuário e senha são obrigatórios.");
  }

  const existingUser = users.find(u => u.username === user);
  if (!existingUser) {
    return res.status(401).send('Usuário não encontrado');
  }

  const senhaCorreta = await bcrypt.compare(tpassword, existingUser.passwordHash);
  if (!senhaCorreta) {
    return res.status(401).send('Senha incorreta');
  }

  const token = jwt.sign(
    { id: existingUser.id, username: existingUser.username, role: existingUser.role },
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
  const { tname, tpassword, tconfpassword } = req.body;

  if (!tname || !tpassword || !tconfpassword) {
    return res.status(400).send('Todos os campos são obrigatórios.');
  }

  if (tpassword !== tconfpassword) {
    return res.status(400).send('As senhas não coincidem.');
  }

  const userExists = users.some(u => u.username === tname);
  if (userExists) {
    return res.status(400).send('Nome de usuário já existe.');
  }

  const passwordHash = await bcrypt.hash(tpassword, 10);
  const newUser = {
    id: users.length + 1,
    username: tname,
    passwordHash,
    role: 'user' // default
  };

  users.push(newUser);

  return res.send(`Usuário ${tname} registrado com sucesso.`);
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});


module.exports = router;
