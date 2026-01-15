const express = require("express")
const { Server } = require("socket.io")
const http = require("http")
const path = require("path")
const pty = require("node-pty")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static(path.join(__dirname, "public")))

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

io.on("connection", (socket) => {
  console.log("New connection")

  // Create SSH connection to your computer
  const shell = pty.spawn("ssh", ["doughstackr@100.115.92.206"], {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env,
  })

  shell.on("data", (data) => {
    socket.emit("output", data)
  })

  socket.on("input", (data) => {
    shell.write(data)
  })

  socket.on("resize", (data) => {
    shell.resize(data.cols, data.rows)
  })

  socket.on("disconnect", () => {
    shell.destroy()
    console.log("Disconnected")
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Web SSH running on port ${PORT}`)
})
