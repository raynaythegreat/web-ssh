const sessionService = require("../services/sessionService");
const logger = require("../utils/logger");

function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "") || req.query.token;
  
  if (!token) {
    logger.warn("Authentication attempt without token");
    return res.status(401).json({ error: "Authentication required" });
  }

  const session = sessionService.getSession(token);
  
  if (!session) {
    logger.warn("Invalid or expired token attempted", { token: token.substring(0, 8) });
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.user = {
    id: session.userId,
    token: token,
  };
  
  logger.debug("User authenticated", { userId: session.userId });
  next();
}

module.exports = authenticate;