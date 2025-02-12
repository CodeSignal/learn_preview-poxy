const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const httpProxy = require('http-proxy');
const WebSocket = require('ws');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    serverPort: 3000,
    proxyPort: 3001,
    defaultIsReady: false,
    heading: "Loading Application",
    subheading: "Please wait while we initialize your session...",
    defaultRedirect: "/",
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--server-port' && args[i + 1]) {
      result.serverPort = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--proxy-port' && args[i + 1]) {
      result.proxyPort = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--is-ready') {
      result.isReady = true;
    } else if (args[i] === "--heading-message") {
      result.heading = args[i + 1];
      i++;
    } else if (args[i] === "--subheading-message") {
      result.subheading = args[i + 1];
      i++; 
    } else if (args[i] === "--redirect-path") {
      result.defaultRedirect = args[i + 1];
      i++;
    } else if (args[i] === '--help') {
      console.log("This proxy will start off in the 'loading' state until it recieves a signal to start proxying");
      console.log(" - you can activate proxy mode by sending a request to /_ready like this`curl localhost:3000/_ready`");
      console.log(" - pass ?path=/login to force the page to redirect to a specific path (/login for example)");
      console.log("");
      console.log("usage: ");
      console.log(" [--server-port 3000]              define the port this proxy receives requests from");
      console.log(" [--proxy-port 3001]               define the port the target application is listening on.");
      console.log(" [--heading-message heading]       defines the heading in the loading screen");
      console.log(" [--subheading-message subheading] defines the heading in the loading screen");
      console.log(" [--redirect-path /login]          defines the default redirect when the proxy is ready");
      console.log(" [--is-ready]                      starts the proxy in proxy mode (not loading...)");
      process.exit(0);
    }
  }

  return result;
}

const args = parseArgs();
let isReady = args.defaultIsReady;

const proxy = httpProxy.createProxyServer({});
// Handle proxy errors
proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err);
  res.writeHead(502, { 'Content-Type': 'text/plain' });
  res.end('Proxy error: The target server may be down or unreachable');
});

const loadingPageTemplate = fs.readFileSync(path.join(__dirname, 'loading.html'), 'utf8');
const loadingPage = loadingPageTemplate
  .replace("HEADING_MESSAGE", args.heading)
  .replace("SUBHEADING_MESSAGE", args.subheading);

// Create HTTP server with error handling
const server = http.createServer((req, res) => {
  try {
    if (req.url.startsWith('/_ready')) {
      isReady = true;
      // Parse the URL to get query parameters
      const parsedUrl = url.parse(req.url, true);
      const path = parsedUrl.query.path || args.defaultRedirect;
      
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

    const target = `http://localhost:${args.proxyPort}`;
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
server.listen(args.serverPort, (err) => {
  if (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
  console.log(`Server running on port ${args.serverPort}`);
  console.log(`Will proxy to port ${args.proxyPort} when ready`);
});

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
