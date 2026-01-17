const terminalService = require("../services/TerminalService");

module.exports = (io) => {
  const terminalProcesses = new Map();

  io.on("connection", (socket) => {
    console.log(`New terminal connection: ${socket.id}`);

    socket.on("start-terminal", ({ cols, rows }) => {
      const { term, type } = terminalService.createTerminal(cols, rows);
      terminalProcesses.set(socket.id, { term, type });

      if (type === "pty") {
        term.onData((data) => socket.emit("output", data));
        term.onExit(() => socket.disconnect());
      } else {
        term.stdout.on("data", (data) => socket.emit("output", data.toString()));
        term.stderr.on("data", (data) => socket.emit("output", data.toString()));
        term.on("close", () => socket.disconnect());
      }
    });

    socket.on("input", (data) => {
      const session = terminalProcesses.get(socket.id);
      if (session) {
        if (session.type === "pty") {
          session.term.write(data);
        } else {
          session.term.stdin.write(data);
        }
      }
    });

    socket.on("resize", ({ cols, rows }) => {
      const session = terminalProcesses.get(socket.id);
      if (session && session.type === "pty") {
        session.term.resize(cols, rows);
      }
    });

    socket.on("disconnect", () => {
      const session = terminalProcesses.get(socket.id);
      if (session) {
        if (session.type === "pty") {
          session.term.kill();
        } else {
          session.term.kill();
        }
        terminalProcesses.delete(socket.id);
      }
      console.log(`Terminal disconnected: ${socket.id}`);
    });
  });
};