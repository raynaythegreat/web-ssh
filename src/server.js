const express = require("express");
const helmet = require("helmet");
const path = require("path");
const http = require("http");
const config = require("./config");
const logger = require("./utils/logger");
const routes = require("./routes");
const initializeSocketIO = require("./socket");
const terminalService = require("./services/terminalService");
const sessionService = require("./services/sessionService");
const errorHandler = require("./middleware/errorHandler");
const { generalLimiter } = require("./middleware/rateLimiter");

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "unpkg.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "unpkg.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
        imgSrc: ["'self'", "data:"],
      },
    },
  })
);

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());
app.use(generalLimiter);

app.use("/", routes);

app.use(errorHandler);

const server = http.createServer(app);
const io = initializeSocketIO(server);

function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  server.close(() => {
    logger.info("HTTP server closed");
    
    terminalService.shutdown();
    sessionService.cleanupExpiredSessions();
    
    io.close(() => {
      logger.info("Socket.IO closed");
      logger.info("Graceful shutdown complete");
      process.exit(0);
    });
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (error) => {
  logger.fatal("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal("Unhandled rejection at:", promise, "reason:", reason);
  process.exit(1);
});

server.listen(config.port, () => {
  logger.info(`Web SSH server running on port ${config.port}`, {
    env: config.env,
    sshHost: config.ssh.host,
    sshUser: config.ssh.user,
    usePty: terminalService.usePty,
  });
});

module.exports = { app, server, io };