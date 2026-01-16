const express = require("express");
const { authLimiter } = require("../middleware/rateLimiter");
const { login, logout, getSessionStatus } = require("../controllers/authController");
const authenticate = require("../middleware/authenticate");

const router = express.Router();

router.post("/login", authLimiter, login);
router.post("/logout", authenticate, logout);
router.get("/status", authenticate, getSessionStatus);

module.exports = router;