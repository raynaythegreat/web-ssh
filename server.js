require("dotenv").config()
const express = require("express")
const path = require("path")
const http = require("http")
const { Server } = require("socket.io")
const { spawn } = require("child_process")
const bcrypt = require("bcrypt")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
const { v4: uuidv4 } = require("uuid")
const crypto = require("crypto")

// Try to load node-pty (optional dependency)
let pty = null
let usePty = false
try {
  pty = require("node-pty")
  usePty = true
  console.log("Using node-pty for full PTY support")
} catch {
  console.log("node-pty not available, using fallback mode (child_process)")
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
})

const PORT = process.env.PORT || 3000
const SSH_HOST = process.env.SSH_HOST || "100.115.92.206"
const SSH_USER = process.env.SSH_USER || "doughstackr"

// Security headers with helmet (relaxed for WebSocket)
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

// Rate limiting for auth attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { error: "Too many authentication attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
})

// General rate limiting
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
})

app.use(generalLimiter)
app.use(express.static(path.join(__dirname, "public")))
app.use(express.json())

// Session management
const sessions = new Map() // token -> { userId, createdAt, expiresAt }
const terminalProcesses = new Map() // socketId -> { process, userId, type }

// Password hash (generate with: node -e "require('bcrypt').hash('YourPassword', 12).then(console.log)")
// Default hash is for development - ALWAYS change in production via SSH_PASSWORD_HASH env var
const PASSWORD_HASH =
  process.env.SSH_PASSWORD_HASH ||
  "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4UpEqGpC1pmXWdSi" // "changeme"

// Secure token generation
function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex")
}

// Token validation
function isValidToken(token) {
  if (!token) return false
  const session = sessions.get(token)
  if (!session) return false
  if (Date.now() > session.expiresAt) {
    sessions.delete(token)
    return false
  }
  return true
}

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"))
})

app.get("/terminal", (req, res) => {
  const token = req.query.token || req.headers["authorization"]
  if (isValidToken(token)) {
    res.sendFile(path.join(__dirname, "public", "index.html"))
  } else {
    res.redirect("/")
  }
})

// Auth endpoint with rate limiting
app.post("/auth", authLimiter, async (req, res) => {
  const { password, remember } = req.body

  if (!password) {
    return res.status(400).json({ error: "Password required" })
  }

  try {
    const isValid = await bcrypt.compare(password, PASSWORD_HASH)

    if (isValid) {
      const token = generateSecureToken()
      const expiresAt = remember
        ? Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
        : Date.now() + 24 * 60 * 60 * 1000 // 24 hours

      sessions.set(token, {
        userId: uuidv4(),
        createdAt: Date.now(),
        expiresAt,
      })

      res.json({
        token,
        remember: !!remember,
        expires: expiresAt,
      })
    } else {
      // Delay response to prevent timing attacks
      await new Promise((resolve) => setTimeout(resolve, 1000))
      res.status(401).json({ error: "Invalid password" })
    }
  } catch (error) {
    console.error("Auth error:", error)
    res.status(500).json({ error: "Authentication failed" })
  }
})

app.post("/logout", (req, res) => {
  const { token } = req.body
  if (token) {
    sessions.delete(token)
  }
  res.json({ success: true })
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    mode: usePty ? "pty" : "fallback",
    activeSessions: sessions.size,
    activeTerminals: terminalProcesses.size,
    uptime: process.uptime(),
  })
})

// WebSocket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token
  if (isValidToken(token)) {
    socket.token = token
    socket.userId = sessions.get(token).userId
    next()
  } else {
    next(new Error("Authentication failed"))
  }
})

// Create terminal process (PTY or fallback)
function createTerminalProcess(socket, cols, rows) {
  const socketId = socket.id

  // Clean up existing process
  if (terminalProcesses.has(socketId)) {
    const existing = terminalProcesses.get(socketId)
    if (existing.type === "pty") {
      existing.process.kill()
    } else {
      existing.process.kill("SIGTERM")
    }
    terminalProcesses.delete(socketId)
  }

  if (usePty) {
    // Use node-pty for full PTY support
    try {
      const ptyProcess = pty.spawn("ssh", ["-tt", `${SSH_USER}@${SSH_HOST}`], {
        name: "xterm-256color",
        cols: cols || 80,
        rows: rows || 24,
        cwd: process.env.HOME,
        env: {
          ...process.env,
          TERM: "xterm-256color",
        },
      })

      terminalProcesses.set(socketId, {
        process: ptyProcess,
        userId: socket.userId,
        type: "pty",
      })

      ptyProcess.onData((data) => {
        socket.emit("output", data)
      })

      ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`PTY exited: code=${exitCode}, signal=${signal}`)
        socket.emit("disconnect-terminal", { exitCode, signal })
        terminalProcesses.delete(socketId)
      })

      return { type: "pty", process: ptyProcess }
    } catch (error) {
      console.error("Failed to create PTY:", error)
      socket.emit("error", { message: "Failed to start terminal" })
      return null
    }
  } else {
    // Fallback to child_process
    try {
      const sshProcess = spawn("ssh", ["-tt", `${SSH_USER}@${SSH_HOST}`], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLUMNS: String(cols || 80),
          LINES: String(rows || 24),
        },
      })

      terminalProcesses.set(socketId, {
        process: sshProcess,
        userId: socket.userId,
        type: "spawn",
      })

      sshProcess.stdout.on("data", (data) => {
        socket.emit("output", data.toString())
      })

      sshProcess.stderr.on("data", (data) => {
        socket.emit("output", data.toString())
      })

      sshProcess.on("close", (code) => {
        console.log(`SSH process exited with code ${code}`)
        socket.emit("disconnect-terminal", { exitCode: code })
        terminalProcesses.delete(socketId)
      })

      sshProcess.on("error", (error) => {
        console.error("SSH process error:", error)
        socket.emit("error", { message: error.message })
      })

      return { type: "spawn", process: sshProcess }
    } catch (error) {
      console.error("Failed to spawn SSH:", error)
      socket.emit("error", { message: "Failed to start terminal" })
      return null
    }
  }
}

// WebSocket connection handling
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id} (User: ${socket.userId})`)

  // Start SSH session
  socket.on("start-ssh", (options = {}) => {
    const cols = options.cols || 80
    const rows = options.rows || 24

    const terminal = createTerminalProcess(socket, cols, rows)

    if (terminal) {
      socket.emit("connected", {
        message: "SSH session started",
        mode: terminal.type,
      })
    }
  })

  // Handle input from client
  socket.on("input", (data) => {
    const terminal = terminalProcesses.get(socket.id)
    if (terminal) {
      if (terminal.type === "pty") {
        terminal.process.write(data)
      } else {
        terminal.process.stdin.write(data)
      }
    }
  })

  // Handle terminal resize
  socket.on("resize", ({ cols, rows }) => {
    const terminal = terminalProcesses.get(socket.id)
    if (terminal && cols > 0 && rows > 0) {
      if (terminal.type === "pty") {
        try {
          terminal.process.resize(cols, rows)
        } catch (error) {
          console.error("Resize error:", error)
        }
      }
      // For spawn mode, resize isn't directly supported
    }
  })

  // Handle disconnection
  socket.on("disconnect", (reason) => {
    console.log(`Client disconnected: ${socket.id} (${reason})`)

    const terminal = terminalProcesses.get(socket.id)
    if (terminal) {
      if (terminal.type === "pty") {
        terminal.process.kill()
      } else {
        terminal.process.kill("SIGTERM")
      }
      terminalProcesses.delete(socket.id)
    }
  })

  // Handle explicit terminal close
  socket.on("close-terminal", () => {
    const terminal = terminalProcesses.get(socket.id)
    if (terminal) {
      if (terminal.type === "pty") {
        terminal.process.kill()
      } else {
        terminal.process.kill("SIGTERM")
      }
      terminalProcesses.delete(socket.id)
    }
  })
})

// Cleanup expired sessions periodically
setInterval(() => {
  const now = Date.now()
  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(token)
    }
  }
}, 60 * 1000) // Every minute

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down...")

  // Close all terminal processes
  for (const [socketId, terminal] of terminalProcesses.entries()) {
    if (terminal.type === "pty") {
      terminal.process.kill()
    } else {
      terminal.process.kill("SIGTERM")
    }
  }
  terminalProcesses.clear()

  // Close server
  server.close(() => {
    console.log("Server closed")
    process.exit(0)
  })
})

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║             Web SSH Terminal v2.0.0                   ║
╠═══════════════════════════════════════════════════════╣
║  Server running on port ${PORT.toString().padEnd(29)}║
║  SSH Target: ${(SSH_USER + "@" + SSH_HOST).padEnd(40)}║
║  Mode: ${(usePty ? "PTY (node-pty)" : "Fallback (child_process)").padEnd(46)}║
║  WebSocket: Enabled                                   ║
║  Rate Limiting: Enabled                               ║
╚═══════════════════════════════════════════════════════╝
  `)
})
