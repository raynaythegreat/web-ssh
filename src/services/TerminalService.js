const { spawn } = require("child_process");
let pty = null;
try {
  pty = require("node-pty");
} catch (e) {
  console.log("node-pty not available, using child_process fallback");
}

class TerminalService {
  constructor() {
    this.SSH_HOST = process.env.SSH_HOST || "100.115.92.206";
    this.SSH_USER = process.env.SSH_USER || "doughstackr";
  }

  createTerminal(cols = 80, rows = 24) {
    const shellArgs = [
      "-o", "StrictHostKeyChecking=no",
      "-o", "UserKnownHostsFile=/dev/null",
      `${this.SSH_USER}@${this.SSH_HOST}`
    ];

    if (pty) {
      const term = pty.spawn("ssh", shellArgs, {
        name: "xterm-256color",
        cols,
        rows,
        cwd: process.env.HOME,
        env: process.env
      });
      return { term, type: "pty" };
    } else {
      const term = spawn("ssh", shellArgs);
      return { term, type: "spawn" };
    }
  }
}

module.exports = new TerminalService();