const pino = require("pino");
const config = require("../config");

const logger = pino({
  level: config.logging.level,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
      ignore: "pid,hostname",
    },
  },
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});

module.exports = logger;