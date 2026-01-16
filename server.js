require("dotenv").config()
const express = require("express")
const path = require("path")
const http = require("http")
const { Server } = require("socket.io")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")

// Try to load node-pty (optional dependency)
let pty = null
try {
  pty = require("node-pty")
  console.log("Using node-pty for full PTY support")
} catch {
  console.log("node-pty not available, using fallback mode (restricted features)")
}

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket", "polling"],
})

const PORT = process.env.PORT || 3000
const SSH_HOST = process.env.SSH_HOST || "127.0.0.1"
const SSH_USER = process.env.SSH_USER || "root"

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "unpkg.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "unpkg.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
        imgSrc: ["'self'", "data:"],
      },
    },
  })
)

// Global rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(limiter)

app.use(express.static(path.join(__dirname, "public")))

// Terminal process registry
const terminalProcesses = new Map()

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", connections: terminalProcesses.size })
})

// WebSocket handling
io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`)

  // Warning: Direct access enabled
  socket.emit("data", "\r\n\x1b[33m[SECURITY WARNING] Password authentication is disabled.\x1b[0m\r\n")
  socket.emit("data", `\x1b[32mConnecting to ${SSH_USER}@${SSH_HOST}...\x1b[0m\r\n\r\n`)

  let term

  if (pty) {
    // Create actual PTY
    term = pty.spawn("ssh", [
      "-o", "StrictHostKeyChecking=no",
      "-o", "LogLevel=QUIET",
      `${SSH_USER}@${SSH_HOST}`
    ], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: process.env.HOME,
      env: process.env,
    })

    term.onData((data) => socket.emit("data", data))
    term.onExit(({ exitCode }) => {
      console.log(`Process exited for ${socket.id} with code ${exitCode}`)
      socket.disconnect()
    })
  } else {
    // Fallback to basic spawn if node-pty is missing
    const { spawn } = require("child_process")
    term = spawn("ssh", [
      "-o", "StrictHostKeyChecking=no",
      `${SSH_USER}@${SSH_HOST}`
    ])

    term.stdout.on("data", (data) => socket.emit("data", data.toString()))
    term.stderr.on("data", (data) => socket.emit("data", data.toString()))
    term.on("close", () => socket.disconnect())
    
    // Minimal write shim for fallback
    term.write = (data) => term.stdin.write(data)
    term.resize = () => {} // No-op
  }

  terminalProcesses.set(socket.id, term)

  socket.on("data", (data) => {
    if (term) term.write(data)
  })

  socket.on("resize", ({ cols, rows }) => {
    if (term && term.resize) {
      try {
        term.resize(cols, rows)
      } catch (e) {
        console.error("Resize failed:", e)
      }
    }
  })

  socket.on("disconnect", () => {
    console.log(`Connection closed: ${socket.id}`)
    const process = terminalProcesses.get(socket.id)
    if (process) {
      if (pty) {
        process.kill()
      } else {
        process.stdin.end()
        process.kill()
      }
      terminalProcesses.delete(socket.id)
    }
  })
})

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, cleaning up...")
  for (const [id, term] of terminalProcesses) {
    term.kill()
  }
  server.close(() => process.exit(0))
})

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Terminal server running on port ${PORT}`)
  console.log(`Target: ${SSH_USER}@${SSH_HOST}`)
})