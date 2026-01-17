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
} catch (err) {
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
  transports: ["websocket", "polling"],
  allowUpgrades: true,
})

const PORT = process.env.PORT || 3000
const SSH_HOST = process.env.SSH_HOST || "100.115.92.206"
const SSH_USER = process.env.SSH_USER || "doughstackr"

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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many authentication attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
})

app.use(express.static(path.join(__dirname, "public")))
app.use(express.json())

const sessions = new Map()
const terminalProcesses = new Map()

const PASSWORD_HASH =
  process.env.SSH_PASSWORD_HASH ||
  "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4UpEqGpC1pmXWdSi" // default: "changeme"

function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex")
}

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
app.post("/api/login", authLimiter, async (req, res) => {
  const { password } = req.body
  try {
    const match = await bcrypt.compare(password, PASSWORD_HASH)
    if (match) {
      const token = generateSecureToken()
      sessions.set(token, {
        userId: "admin",
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h
      })
      return res.json({ token })
    }
    res.status(401).json({ error: "Invalid password" })
  } catch (error) {
    res.status(500).json({ error: "Internal server error" })
  }
})

app.get("/api/verify", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1]
  if (isValidToken(token)) {
    return res.json({ valid: true })
  }
  res.status(401).json({ valid: false })
})

// Socket.io Terminal Logic
io.on("connection", (socket) => {
  const token = socket.handshake.auth.token
  if (!isValidToken(token)) {
    socket.disconnect()
    return
  }

  console.log(`New terminal session: ${socket.id}`)

  socket.on("terminal:start", ({ cols, rows }) => {
    let term
    const shellArgs = ["-o", "StrictHostKeyChecking=no", `${SSH_USER}@${SSH_HOST}`]

    if (usePty) {
      term = pty.spawn("ssh", shellArgs, {
        name: "xterm-color",
        cols: cols || 80,
        rows: rows || 24,
        cwd: process.env.HOME,
        env: process.env,
      })

      term.onData((data) => socket.emit("terminal:output", data))
      term.onExit(() => {
        socket.emit("terminal:exit")
        terminalProcesses.delete(socket.id)
      })
    } else {
      term = spawn("ssh", shellArgs)
      term.stdout.on("data", (data) => socket.emit("terminal:output", data.toString()))
      term.stderr.on("data", (data) => socket.emit("terminal:output", data.toString()))
      term.on("close", () => {
        socket.emit("terminal:exit")
        terminalProcesses.delete(socket.id)
      })
    }

    terminalProcesses.set(socket.id, term)
  })

  socket.on("terminal:input", (data) => {
    const term = terminalProcesses.get(socket.id)
    if (term) {
      if (usePty) {
        term.write(data)
      } else {
        term.stdin.write(data)
      }
    }
  })

  socket.on("terminal:resize", ({ cols, rows }) => {
    const term = terminalProcesses.get(socket.id)
    if (term && usePty && term.resize) {
      try {
        term.resize(cols, rows)
      } catch (e) {
        console.error("Resize error:", e)
      }
    }
  })

  socket.on("disconnect", () => {
    console.log(`Session closed: ${socket.id}`)
    const term = terminalProcesses.get(socket.id)
    if (term) {
      if (usePty) {
        term.kill()
      } else {
        term.kill("SIGTERM")
      }
      terminalProcesses.delete(socket.id)
    }
  })
})

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Web-SSH Server running on port ${PORT}`)
  console.log(`Connecting to: ${SSH_USER}@${SSH_HOST}`)
})