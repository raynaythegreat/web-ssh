const express = require("express")
const path = require("path")
const { spawn } = require("child_process")

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.static(path.join(__dirname, "public")))

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

// Simple command execution endpoint (for demonstration)
app.post("/exec", express.json(), (req, res) => {
  const { command } = req.body

  const ssh = spawn("ssh", ["doughstackr@100.115.92.206", command], {
    stdio: ["pipe", "pipe", "pipe"],
  })

  let output = ""
  ssh.stdout.on("data", (data) => {
    output += data.toString()
  })

  ssh.stderr.on("data", (data) => {
    output += data.toString()
  })

  ssh.on("close", (code) => {
    res.json({ output, code })
  })
})

app.listen(PORT, () => {
  console.log(`Simple Web Terminal running on port ${PORT}`)
})
