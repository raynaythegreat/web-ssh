const { verifyPassword } = require("../utils/crypto");
const sessionService = require("../services/sessionService");
const config = require("../config");
const logger = require("../utils/logger");

async function login(req, res, next) {
  try {
    const { password } = req.body;
    
    if (!password) {
      logger.warn("Login attempt without password");
      return res.status(400).json({ error: "Password is required" });
    }

    const isValid = await verifyPassword(password, config.auth.passwordHash);
    
    if (!isValid) {
      logger.warn("Failed login attempt");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const userId = `user_${Date.now()}`;
    const token = sessionService.createSession(userId);
    
    logger.info("Successful login", { userId });
    
    res.json({
      success: true,
      token,
      userId,
    });
  } catch (error) {
    next(error);
  }
}

function logout(req, res, next) {
  try {
    const token = req.user.token;
    sessionService.deleteSession(token);
    
    logger.info("User logged out", { userId: req.user.id });
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

function getSessionStatus(req, res, next) {
  try {
    const session = sessionService.getSession(req.user.token);
    
    if (!session) {
      return res.status(401).json({ error: "Session expired" });
    }
    
    sessionService.refreshSession(req.user.token);
    
    res.json({
      valid: true,
      userId: session.userId,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  logout,
  getSessionStatus,
};