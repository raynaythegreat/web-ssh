# Web SSH Terminal - Refactored

A secure web-based SSH terminal with real-time WebSocket connection, now with improved architecture for production use.

## Features

- **Secure Authentication**: bcrypt password hashing with session management
- **Real-time Terminal**: WebSocket-powered SSH terminal using xterm.js
- **Process Management**: Automatic cleanup of stale processes and sessions
- **Rate Limiting**: Configurable rate limits for auth and general requests
- **Graceful Shutdown**: Proper cleanup on SIGTERM/SIGINT
- **Health Checks**: `/health` endpoint for monitoring
- **Structured Logging**: Pino-based logging with correlation
- **Scalable Architecture**: Services ready for Redis/database integration

## Architecture
