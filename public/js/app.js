document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('terminal_token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');

  const term = new Terminal({
    cursorBlink: true,
    fontFamily: '"Cascadia Code", Menlo, Monaco, "Courier New", monospace',
    fontSize: 14,
    theme: {
      background: '#0d1117',
      foreground: '#e6edf3',
      cursor: '#58a6ff',
      selection: '#21262d',
      black: '#484f58',
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5bb',
      white: '#ffffff',
    },
    allowProposedApi: true
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon.WebLinksAddon());
  term.open(document.getElementById('terminal'));
  fitAddon.fit();

  const socket = io({
    auth: { token },
    transports: ['websocket']
  });

  socket.on('connect', () => {
    statusBadge.className = 'connection-badge connected';
    statusText.textContent = 'Connected';
    
    socket.emit('start-terminal', {
      cols: term.cols,
      rows: term.rows
    });
  });

  socket.on('output', (data) => {
    term.write(data);
  });

  socket.on('disconnect', () => {
    statusBadge.className = 'connection-badge disconnected';
    statusText.textContent = 'Disconnected';
    term.write('\r\n\x1b[31mConnection closed.\x1b[0m\r\n');
  });

  socket.on('connect_error', (err) => {
    if (err.message === 'Authentication error') {
      localStorage.removeItem('terminal_token');
      window.location.href = '/login.html';
    }
  });

  term.onData((data) => {
    socket.emit('input', data);
  });

  window.addEventListener('resize', () => {
    fitAddon.fit();
    socket.emit('resize', {
      cols: term.cols,
      rows: term.rows
    });
  });
});