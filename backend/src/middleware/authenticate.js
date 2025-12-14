const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).send("Acesso negado");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "segredo_super_secreto");
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).send("Token inválido ou expirado.");
  }
}

module.exports = authenticate;
