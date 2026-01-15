const express = require("express")
const path = require("path")
const { spawn } = require("child_process")
const http = require("http")

const app = express()
const server = http.createServer(app)
const PORT = process.env.PORT || 3000

app.use(express.static(path.join(__dirname, "public")))
app.use(express.json())

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"))
})

app.get("/terminal", (req, res) => {
  // Check for valid session token
  const token = req.query.token || req.headers["authorization"]
  if (isValidToken(token)) {
    res.sendFile(path.join(__dirname, "public", "index.html"))
  } else {
    res.redirect("/")
  }
})

// Simple token-based auth
const validTokens = new Set()
const deviceTokens = new Map()

function isValidToken(token) {
  if (!token) return false
  if (validTokens.has(token)) return true
  if (deviceTokens.has(token) && Date.now() - deviceTokens.get(token) < 30 * 24 * 60 * 60 * 1000) {
    return true // Remember device for 30 days
  }
  return false
}

function generateToken() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

app.post("/auth", express.json(), (req, res) => {
  const { password, remember } = req.body

  if (password === "Superprimitive69!") {
    const token = generateToken()
    validTokens.add(token)

    if (remember) {
      deviceTokens.set(token, Date.now())
      res.json({ token, remember: true, expires: Date.now() + 30 * 24 * 60 * 60 * 1000 })
    } else {
      res.json({ token, remember: false })
    }
  } else {
    res.status(401).json({ error: "Invalid password" })
  }
})

app.post("/logout", express.json(), (req, res) => {
  const { token } = req.body
  validTokens.delete(token)
  deviceTokens.delete(token)
  res.json({ success: true })
})

// Store SSH session
let sshProcess = null
let sessionId = Date.now()

// Authentication middleware
function requireAuth(req, res, next) {
  const token = req.query.token || req.headers["authorization"]
  if (isValidToken(token)) {
    next()
  } else {
    res.status(401).json({ error: "Unauthorized" })
  }
}

app.post("/start-ssh", requireAuth, (req, res) => {
  if (sshProcess) {
    sshProcess.kill()
  }

  // Start persistent SSH session with full shell
  sshProcess = spawn("ssh", ["-t", "doughstackr@100.115.92.206"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, TERM: "xterm-256color" },
  })

  let outputBuffer = ""

  sshProcess.stdout.on("data", (data) => {
    outputBuffer += data.toString()
  })

  sshProcess.stderr.on("data", (data) => {
    outputBuffer += data.toString()
  })

  sshProcess.on("close", (code) => {
    console.log(`SSH process closed with code ${code}`)
    sshProcess = null
  })

  // Send initial output after SSH starts
  setTimeout(() => {
    res.json({
      output: outputBuffer || "Connecting to SSH...",
      sessionId: sessionId,
    })
  }, 1500)
})

app.post("/send-input", express.json(), requireAuth, (req, res) => {
  const { input } = req.body

  if (sshProcess) {
    sshProcess.stdin.write(input)
    res.json({ success: true })
  } else {
    res.json({ error: "No SSH session active" })
  }
})

app.get("/get-output", requireAuth, (req, res) => {
  if (sshProcess) {
    let output = ""
    let received = false

    const getOutput = () => {
      sshProcess.stdout.once("data", (data) => {
        output += data.toString()
        received = true
      })

      sshProcess.stderr.once("data", (data) => {
        output += data.toString()
        received = true
      })

      setTimeout(() => {
        res.json({ output, hasOutput: received })
      }, 200)
    }

    getOutput()
  } else {
    res.json({ output: "", connected: false })
  }
})

app.post("/resize", express.json(), requireAuth, (req, res) => {
  const { cols, rows } = req.body
  if (sshProcess && sshProcess.stdin && process.platform !== "win32") {
    // Set terminal size (Linux/macOS)
    sshProcess.stdin.write(`stty cols ${cols} rows ${rows}\n`)
  }
  res.json({ success: true })
})

server.listen(PORT, () => {
  console.log(`Full Web Terminal running on port ${PORT}`)
  console.log(`Access at: http://localhost:${PORT}`)
})
