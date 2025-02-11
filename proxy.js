const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const httpProxy = require('http-proxy');
const WebSocket = require('ws');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let serverPort = 3000;
  let proxyPort = 3001;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--server-port' && args[i + 1]) {
      serverPort = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--proxy-port' && args[i + 1]) {
      proxyPort = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--is-ready') {
      isReady = true;
    } else if (args[i] === '--help') {
      console.log("usage: ");
      console.log("  --server-port 3000   when set, define the port this proxy receives requests from");
      console.log("  --proxy-port 3001    when set, define the port the target application is listening on.");
      console.log("  --is-ready           when set, starts the proxy in proxy mode (not loading...)");
      process.exit(0);
    }
  }

  return { serverPort, proxyPort };
}

let isReady = false;
const { serverPort, proxyPort } = parseArgs();
const proxy = httpProxy.createProxyServer({});

// Handle proxy errors
proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err);
  res.writeHead(502, { 'Content-Type': 'text/plain' });
  res.end('Proxy error: The target server may be down or unreachable');
});

const loadingPage = fs.readFileSync(path.join(__dirname, 'loading.html'), 'utf8');

// Create HTTP server with error handling
const server = http.createServer((req, res) => {
  try {
    if (req.url.startsWith('/_ready')) {
      isReady = true;
      // Parse the URL to get query parameters
      const parsedUrl = url.parse(req.url, true);
      const path = parsedUrl.query.path || '/';
      
      // Broadcast to all WebSocket clients that we're ready
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'ready', path }));
        }
      });
      res.writeHead(200);
      res.end('Proxy mode activated');
      return;
    }

    if (!isReady) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(loadingPage);
      return;
    }

    const target = `http://localhost:${proxyPort}`;
    proxy.web(req, res, { target });
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
  }
});

// Handle server-level errors
server.on('error', (err) => {
  console.error('Server error:', err);
});

// Create WebSocket server with error handling
const wss = new WebSocket.Server({ server });

// Handle WebSocket server errors
wss.on('error', (err) => {
  console.error('WebSocket server error:', err);
});

// Handle individual WebSocket connection errors
wss.on('connection', (ws) => {
  ws.on('error', (err) => {
    console.error('WebSocket connection error:', err);
  });
});

// Start server
server.listen(serverPort, (err) => {
  if (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
  console.log(`Server running on port ${serverPort}`);
  console.log(`Will proxy to port ${proxyPort} when ready`);
});

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
