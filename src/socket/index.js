const { Server } = require("socket.io");
const config = require("../config");
const { handleConnection } = require("./handlers");
const logger = require("../utils/logger");

function initializeSocketIO(server) {
  const io = new Server(server, {
    cors: {
      origin: config.cors.allowedOrigins,
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["websocket", "polling"],
    allowUpgrades: true,
  });

  io.on("connection", (socket) => {
    handleConnection(socket);
  });

  logger.info("Socket.IO initialized");
  return io;
}

module.exports = initializeSocketIO;