const logger = require("../utils/logger");

function errorHandler(error, req, res, next) {
  logger.error("Unhandled error:", error);
  
  if (res.headersSent) {
    return next(error);
  }
  
  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || "Internal server error";
  
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  });
}

module.exports = errorHandler;