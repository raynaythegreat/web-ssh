const crypto = require("crypto");
const bcrypt = require("bcrypt");

class SessionService {
  constructor() {
    this.sessions = new Map();
    this.PASSWORD_HASH = process.env.SSH_PASSWORD_HASH || 
      "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4UpEqGpC1pmXWdSi"; // "changeme"
  }

  async authenticate(password) {
    const isValid = await bcrypt.compare(password, this.PASSWORD_HASH);
    if (!isValid) return null;

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    this.sessions.set(token, {
      createdAt: Date.now(),
      expiresAt
    });

    return token;
  }

  isValidToken(token) {
    if (!token) return false;
    const session = this.sessions.get(token);
    if (!session) return false;

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  revokeSession(token) {
    this.sessions.delete(token);
  }
}

module.exports = new SessionService();