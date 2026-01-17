require("dotenv").config();
const express = require("express");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const sessionService = require("./src/services/SessionService");
const { socketAuthMiddleware } = require("./src/middleware/auth");
const setupTerminalHandler = require("./src/socket/terminalHandler");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket", "polling"],
});

const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "unpkg.com"],
      connectSrc: ["'self'", "ws:", "wss:"],
      imgSrc: ["'self'", "data:"],
    },
  },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: "Too many login attempts. Please try again later." },
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Auth Route
app.post("/api/login", authLimiter, async (req, res) => {
  const { password } = req.body;
  const token = await sessionService.authenticate(password);
  
  if (token) {
    res.json({ token });
  } else {
    res.status(401).json({ error: "Invalid password" });
  }
});

// Socket.io Middleware and Setup
io.use(socketAuthMiddleware);
setupTerminalHandler(io);

// SPA Fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});