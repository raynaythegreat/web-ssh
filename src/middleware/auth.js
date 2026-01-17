const sessionService = require("../services/SessionService");

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1] || req.query.token;
  
  if (sessionService.isValidToken(token)) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

const socketAuthMiddleware = (socket, next) => {
  const token = socket.handshake.auth.token;
  if (sessionService.isValidToken(token)) {
    next();
  } else {
    next(new Error("Authentication error"));
  }
};

module.exports = { authMiddleware, socketAuthMiddleware };