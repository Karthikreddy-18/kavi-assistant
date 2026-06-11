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

function httpsPost(host, path2, data, headers) {
  return new Promise((resolve, reject) => {
    const d = JSON.stringify(data);
    const opts = { hostname: host, port: 443, path: path2, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d), ...headers } };
    const req = https.request(opts, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => resolve(JSON.parse(b))); });
    req.on('error', reject); req.write(d); req.end();
  });
}

async function askGroq(messages) {
  const r = await httpsPost('api.groq.com', '/openai/v1/chat/completions', { model: 'llama-3.3-70b-versatile', messages, temperature: 0.7, max_tokens: 200 }, { 'Authorization': 'Bearer ' + GROQ_KEY });
  return r.choices?.[0]?.message?.content || '';
}

async function webSearch(q) {
  try {
    const html = await httpsGet('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q));
    const out = [];
    const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null && out.length < 5) {
      const t = m[1].replace(/<[^>]*>/g, '').trim();
      const b = m[2].replace(/<[^>]*>/g, '').trim();
      if (t) out.push('- ' + t + ': ' + b);
    }
    return out.length ? out.join('\n') : null;
  } catch { return null; }
}

const SEARCH_REGEX = /\b(news|today|current|latest|recent|weather|price|stock|score|result|update|forecast|election|who won|what happened|how much|date|time)\b/i;

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  if (urlPath === '/debug') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('KEY: ' + (GROQ_KEY ? 'SET' : 'NOT SET'));
  }

  if (urlPath === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        if (!GROQ_KEY) { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'GROQ_API_KEY not set.' })); }
        const { message, history } = JSON.parse(body);
        let system = 'You are KAVI, a conversational voice AI. Keep responses short. Natural speech, no lists.';
        if (SEARCH_REGEX.test(message) || /202[4-9]/.test(message)) {
          const info = await webSearch(message);
          if (info) system += '\n\nCurrent info:\n' + info;
        }
        const reply = await askGroq([{ role: 'system', content: system }, ...(history || []), { role: 'user', content: message }]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ response: reply }));
      } catch (e) {
        console.error(e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error' }));
      }
    });
    return;
  }

  const filePath = urlPath === '/' ? path.join(PUBLIC, 'index.html') : path.join(PUBLIC, urlPath);
  serveFile(res, filePath);
}).listen(PORT, () => console.log('UP'));
