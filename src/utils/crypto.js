const crypto = require("crypto");
const bcrypt = require("bcrypt");
const logger = require("./logger");

function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function hashPassword(password) {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

async function verifyPassword(password, hash) {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error("Password verification error:", error);
    return false;
  }
}

function generateSessionId() {
  return `${Date.now()}-${crypto.randomBytes(16).toString("hex")}`;
}

module.exports = {
  generateSecureToken,
  hashPassword,
  verifyPassword,
  generateSessionId,
};