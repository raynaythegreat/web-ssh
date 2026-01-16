const express = require("express");
const path = require("path");
const authRoutes = require("./auth");
const { initializeTerminal, getTerminalStats } = require("../controllers/terminalController");
const authenticate = require("../middleware/authenticate");

const router = express.Router();

router.use("/auth", authRoutes);

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../../public", "login.html"));
});

router.get("/terminal", authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, "../../public", "index.html"));
});

router.post("/terminal/init", authenticate, initializeTerminal);
router.get("/terminal/stats", authenticate, getTerminalStats);

router.get("/health", (req, res) => {
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    memory: {
      used: Math.round(memory.heapUsed / 1024 / 1024) + "MB",
      total: Math.round(memory.heapTotal / 1024 / 1024) + "MB",
    },
  });
});

module.exports = router;