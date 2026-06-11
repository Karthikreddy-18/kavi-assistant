const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const GROQ_KEY = process.env.GROQ_API_KEY;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(d)); }).on('error', reject);
  });
}

function httpsPost(url, data, headers) {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const opts = { hostname: u.hostname, port: 443, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } };
    const req = https.request(opts, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject); req.write(JSON.stringify(data)); req.end();
  });
}

async function askGroq(messages) {
  const r = await httpsPost('https://api.groq.com/openai/v1/chat/completions', { model: 'llama-3.3-70b-versatile', messages, temperature: 0.7, max_tokens: 200 }, { 'Authorization': 'Bearer ' + GROQ_KEY });
  return r.choices?.[0]?.message?.content || '';
}

async function webSearch(q) {
  try {
    const html = await httpsGet('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q));
    const out = []; const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi; let m;
    while ((m = re.exec(html)) && out.length < 5) { const t = m[1].replace(/<[^>]*>/g, '').trim(); const b = m[2].replace(/<[^>]*>/g, '').trim(); if (t) out.push('- ' + t + ': ' + b); }
    return out.length ? out.join('\n') : null;
  } catch { return null; }
}

const SEARCH = /\b(news|today|current|latest|recent|weather|price|stock|score|result|update|forecast|election|who won|what happened|how much|date|time)\b/i;

function serveFile(res, file) {
  const ext = path.extname(file);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/debug') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('KEY: ' + (GROQ_KEY ? 'SET' : 'NOT SET'));
  }

  if (url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        if (!GROQ_KEY) { res.writeHead(500); return res.end(JSON.stringify({ error: 'GROQ_API_KEY not set.' })); }
        const { message, history } = JSON.parse(body);
        let system = 'You are KAVI, a conversational voice AI. Keep responses short. Natural speech, no lists.';
        if (SEARCH.test(message) || /202[4-9]/.test(message)) { const info = await webSearch(message); if (info) system += '\n\nCurrent info:\n' + info; }
        const reply = await askGroq([{ role: 'system', content: system }, ...(history || []), { role: 'user', content: message }]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ response: reply }));
      } catch (e) { console.error(e.message); res.writeHead(500); res.end(JSON.stringify({ error: 'Error' })); }
    });
    return;
  }

  let file = url === '/' ? '/index.html' : url;
  serveFile(res, path.join(PUBLIC, file));
});

server.listen(PORT, () => console.log('UP'));
