const terminalService = require("../services/terminalService");
const logger = require("../utils/logger");

function initializeTerminal(req, res, next) {
  try {
    const socketId = req.body.socketId;
    
    if (!socketId) {
      return res.status(400).json({ error: "socketId is required" });
    }

    const procData = terminalService.createProcess(socketId, req.user.id);
    
    if (!procData) {
      return res.status(500).json({ error: "Failed to create terminal process" });
    }

    logger.info("Terminal initialized", { socketId, userId: req.user.id });
    
    res.json({
      success: true,
      socketId,
      usePty: terminalService.usePty,
    });
  } catch (error) {
    next(error);
  }
}

function getTerminalStats(req, res, next) {
  try {
    const stats = {
      activeProcesses: terminalService.getActiveProcessCount(),
      activeSessions: require("../services/sessionService").getActiveSessionCount(),
    };
    
    logger.debug("Terminal stats requested", stats);
    
    res.json(stats);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  initializeTerminal,
  getTerminalStats,
};