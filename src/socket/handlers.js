const terminalService = require("../services/terminalService");
const sessionService = require("../services/sessionService");
const logger = require("../utils/logger");

function handleConnection(socket) {
  logger.info("Socket connected", { socketId: socket.id });
  
  socket.on("terminal:init", (data) => handleTerminalInit(socket, data));
  socket.on("terminal:input", (data) => handleTerminalInput(socket, data));
  socket.on("terminal:resize", (data) => handleTerminalResize(socket, data));
  socket.on("disconnect", () => handleDisconnect(socket));
  socket.on("error", (error) => handleSocketError(socket, error));
}

function handleTerminalInit(socket, data) {
  try {
    const { token, socketId } = data;
    
    if (!token || !socketId) {
      logger.warn("Terminal init missing parameters", { socketId: socket.id });
      return socket.emit("error", { message: "Missing token or socketId" });
    }

    const session = sessionService.getSession(token);
    if (!session) {
      logger.warn("Terminal init with invalid token", { socketId: socket.id });
      return socket.emit("error", { message: "Invalid session" });
    }

    const procData = terminalService.createProcess(socketId, session.userId);
    if (!procData) {
      logger.error("Failed to create terminal process", { socketId });
      return socket.emit("error", { message: "Failed to create terminal" });
    }

    procData.process.onData((data) => {
      socket.emit("terminal:output", { socketId, data });
    });

    if (procData.process.onExit) {
      procData.process.onExit((code) => {
        logger.info("Terminal process exited", { socketId, code });
        terminalService.killProcess(socketId);
        socket.emit("terminal:exit", { socketId, code });
      });
    }

    logger.info("Terminal initialized via socket", { socketId, userId: session.userId });
    socket.emit("terminal:ready", { socketId });
    
  } catch (error) {
    logger.error("Terminal init error:", error);
    socket.emit("error", { message: "Internal error" });
  }
}

function handleTerminalInput(socket, data) {
  try {
    const { socketId, input } = data;
    
    if (!socketId || !input) {
      logger.warn("Terminal input missing parameters", { socketId: socket.id });
      return;
    }

    const success = terminalService.writeToProcess(socketId, input);
    if (!success) {
      socket.emit("error", { message: "Terminal not found" });
    }
  } catch (error) {
    logger.error("Terminal input error:", error);
    socket.emit("error", { message: "Internal error" });
  }
}

function handleTerminalResize(socket, data) {
  try {
    const { socketId, cols, rows } = data;
    
    if (!socketId || !cols || !rows) {
      logger.warn("Terminal resize missing parameters", { socketId: socket.id });
      return;
    }

    const success = terminalService.resizeProcess(socketId, cols, rows);
    if (!success) {
      logger.warn("Terminal resize failed", { socketId });
    }
  } catch (error) {
    logger.error("Terminal resize error:", error);
  }
}

function handleDisconnect(socket) {
  logger.info("Socket disconnected", { socketId: socket.id });
  
  for (const [socketId, procData] of terminalService.processes.entries()) {
    if (procData.socketId === socket.id) {
      terminalService.killProcess(socketId);
      break;
    }
  }
}

function handleSocketError(socket, error) {
  logger.error("Socket error:", error, { socketId: socket.id });
}

module.exports = {
  handleConnection,
};