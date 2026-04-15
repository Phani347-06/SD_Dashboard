const http = require('http');
const https = require('https');

const TARGET_HOST = 'sd-dashboard.onrender.com';
const PORT = 8080;

const server = http.createServer((req, res) => {
  console.log(`[RELAY] ${new Date().toLocaleTimeString()} - ${req.method} ${req.url}`);
  
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const options = {
      hostname: TARGET_HOST,
      port: 443,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: TARGET_HOST,
      }
    };

    const proxyReq = https.request(options, proxyRes => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', e => {
      console.error(`[ERROR] Render connection failed: ${e.message}`);
      res.writeHead(502);
      res.end('Bridge Error');
    });

    proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 SD-Dashboard Bridge Active!`);
  console.log(`📡 Listening on Port: ${PORT}`);
  console.log(`🔗 Forwarding to: https://${TARGET_HOST}`);
  console.log(`\n👉 NEXT STEP: Point your ESP32 to http://[YOUR_IP]:${PORT}`);
  console.log('--------------------------------------------------');
});
