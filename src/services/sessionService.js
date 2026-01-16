const config = require("../config");
const { generateSessionId } = require("../utils/crypto");
const logger = require("../utils/logger");

class SessionService {
  constructor() {
    this.sessions = new Map();
    this.initCleanup();
  }

  initCleanup() {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, config.processes.cleanupIntervalMs);
  }

  cleanupExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(token);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired sessions`);
    }
  }

  createSession(userId) {
    const token = generateSessionId();
    const expiresAt = Date.now() + config.auth.sessionTtlMinutes * 60 * 1000;
    
    const session = {
      token,
      userId,
      createdAt: Date.now(),
      expiresAt,
    };
    
    this.sessions.set(token, session);
    logger.info(`Session created for user: ${userId}`, { token: token.substring(0, 8) });
    
    return token;
  }

  getSession(token) {
    const session = this.sessions.get(token);
    
    if (!session) {
      return null;
    }
    
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      logger.warn(`Expired session accessed: ${token.substring(0, 8)}`);
      return null;
    }
    
    return session;
  }

  deleteSession(token) {
    const deleted = this.sessions.delete(token);
    if (deleted) {
      logger.info(`Session deleted: ${token.substring(0, 8)}`);
    }
    return deleted;
  }

  refreshSession(token) {
    const session = this.getSession(token);
    if (!session) {
      return false;
    }
    
    session.expiresAt = Date.now() + config.auth.sessionTtlMinutes * 60 * 1000;
    this.sessions.set(token, session);
    logger.debug(`Session refreshed: ${token.substring(0, 8)}`);
    
    return true;
  }

  getActiveSessionCount() {
    this.cleanupExpiredSessions();
    return this.sessions.size;
  }
}

module.exports = new SessionService();