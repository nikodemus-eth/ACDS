import http from 'node:http';

const port = Number(process.env.MOCK_OLLAMA_PORT ?? 11434);

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/tags') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/generate') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : {};
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        model: parsed.model ?? 'llama3.2:latest',
        response: 'mock ollama response',
        done: true,
        total_duration: 1000000,
      }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[mock-ollama] listening on ${port}`);
});
