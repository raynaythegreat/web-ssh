const { spawn } = require("child_process");
const config = require("../config");
const logger = require("../utils/logger");

let pty = null;
let usePty = false;

try {
  pty = require("node-pty");
  usePty = true;
  logger.info("Using node-pty for full PTY support");
} catch (error) {
  logger.warn("node-pty not available, using fallback mode (child_process)");
}

class TerminalService {
  constructor() {
    this.processes = new Map();
    this.initCleanup();
  }

  initCleanup() {
    setInterval(() => {
      this.cleanupStaleProcesses();
    }, config.processes.cleanupIntervalMs);
  }

  cleanupStaleProcesses() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [socketId, procData] of this.processes.entries()) {
      if (now > procData.timeoutAt) {
        this.killProcess(socketId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} stale terminal processes`);
    }
  }

  createProcess(socketId, userId) {
    if (this.processes.has(socketId)) {
      logger.warn(`Process already exists for socket: ${socketId}`);
      return null;
    }

    const timeoutAt = Date.now() + config.processes.timeoutMs;
    
    let proc;
    if (usePty) {
      proc = pty.spawn("ssh", [`${config.ssh.user}@${config.ssh.host}`], {
        name: "xterm-color",
        cols: 80,
        rows: 24,
        cwd: process.env.HOME || "/",
        env: process.env,
      });
    } else {
      proc = spawn("ssh", [`${config.ssh.user}@${config.ssh.host}`], {
        stdio: ["pipe", "pipe", "pipe"],
      });
    }

    const procData = {
      process: proc,
      userId,
      socketId,
      createdAt: Date.now(),
      timeoutAt,
    };

    this.processes.set(socketId, procData);
    logger.info(`Terminal process created for user: ${userId}`, { socketId });
    
    return procData;
  }

  getProcess(socketId) {
    return this.processes.get(socketId);
  }

  killProcess(socketId) {
    const procData = this.processes.get(socketId);
    if (!procData) {
      logger.warn(`Attempted to kill non-existent process: ${socketId}`);
      return false;
    }

    try {
      if (usePty) {
        procData.process.kill();
      } else {
        procData.process.kill("SIGTERM");
        setTimeout(() => {
          if (!procData.process.killed) {
            procData.process.kill("SIGKILL");
          }
        }, 5000);
      }
      
      this.processes.delete(socketId);
      logger.info(`Terminal process killed: ${socketId}`);
      return true;
    } catch (error) {
      logger.error(`Error killing process ${socketId}:`, error);
      return false;
    }
  }

  killAllUserProcesses(userId) {
    let killed = 0;
    for (const [socketId, procData] of this.processes.entries()) {
      if (procData.userId === userId) {
        this.killProcess(socketId);
        killed++;
      }
    }
    logger.info(`Killed ${killed} processes for user: ${userId}`);
    return killed;
  }

  resizeProcess(socketId, cols, rows) {
    const procData = this.getProcess(socketId);
    if (!procData) {
      logger.warn(`Attempted to resize non-existent process: ${socketId}`);
      return false;
    }

    if (usePty && procData.process.resize) {
      procData.process.resize(cols, rows);
      logger.debug(`Process resized: ${socketId}`, { cols, rows });
      return true;
    }
    
    return false;
  }

  writeToProcess(socketId, data) {
    const procData = this.getProcess(socketId);
    if (!procData) {
      logger.warn(`Attempted to write to non-existent process: ${socketId}`);
      return false;
    }

    try {
      if (usePty) {
        procData.process.write(data);
      } else {
        procData.process.stdin.write(data);
      }
      return true;
    } catch (error) {
      logger.error(`Error writing to process ${socketId}:`, error);
      return false;
    }
  }

  getActiveProcessCount() {
    return this.processes.size;
  }

  shutdown() {
    logger.info("Shutting down terminal service...");
    const count = this.processes.size;
    for (const socketId of this.processes.keys()) {
      this.killProcess(socketId);
    }
    logger.info(`Terminated ${count} processes during shutdown`);
  }
}

module.exports = new TerminalService();