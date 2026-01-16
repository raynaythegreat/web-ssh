const config = require("../config");
const logger = require("../utils/logger");

class SSHService {
  constructor() {
    this.sshAvailable = false;
    this.checkSSHAvailability();
  }

  async checkSSHAvailability() {
    try {
      const { spawn } = require("child_process");
      const testProc = spawn("ssh", ["-V"], { stdio: "pipe" });
      
      testProc.on("close", (code) => {
        if (code === 0 || code === 255) {
          this.sshAvailable = true;
          logger.info("SSH client is available");
        } else {
          logger.error("SSH client check failed with code:", code);
        }
      });
      
      testProc.on("error", (error) => {
        logger.error("SSH client not found:", error.message);
      });
    } catch (error) {
      logger.error("SSH availability check failed:", error);
    }
  }

  getSSHCommand() {
    return {
      command: "ssh",
      args: [`${config.ssh.user}@${config.ssh.host}`],
      host: config.ssh.host,
      user: config.ssh.user,
    };
  }

  isSSHAvailable() {
    return this.sshAvailable;
  }
}

module.exports = new SSHService();