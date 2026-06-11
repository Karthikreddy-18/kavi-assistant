const express = require('express');
const path = require('path');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_KEY = process.env.GROQ_API_KEY;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}

function httpPost(url, data, headers) {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: u.hostname, port: 443, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

async function askGroq(messages) {
  const res = await httpPost('https://api.groq.com/openai/v1/chat/completions', {
    model: 'llama-3.3-70b-versatile',
    messages, temperature: 0.7, max_tokens: 200
  }, { 'Authorization': 'Bearer ' + GROQ_KEY });
  return res.choices?.[0]?.message?.content || '';
}

const SEARCH_WORDS = /\b(news|today|current|latest|recent|weather|price|stock|score|result|update|forecast|election|who won|what happened|how much|date|time)\b/i;

function needsSearch(text) {
  return SEARCH_WORDS.test(text) || /202[4-9]/.test(text);
}

async function webSearch(query) {
  try {
    const html = await httpGet('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query));
    const results = [];
    const regex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = regex.exec(html)) !== null && results.length < 5) {
      const t = m[1].replace(/<[^>]*>/g, '').trim();
      const b = m[2].replace(/<[^>]*>/g, '').trim();
      if (t) results.push('- ' + t + ': ' + b);
    }
    return results.length ? results.join('\n') : null;
  } catch { return null; }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/chat', async (req, res) => {
  try {
    if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set.' });
    const { message, history } = req.body;
    let system = 'You are KAVI, a conversational voice AI. Keep responses short. Natural speech, no lists.';
    if (needsSearch(message)) {
      const info = await webSearch(message);
      if (info) system += '\n\nCurrent info:\n' + info;
    }
    const reply = await askGroq([
      { role: 'system', content: system },
      ...(history || []),
      { role: 'user', content: message }
    ]);
    res.json({ response: reply });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.get('/debug', (req, res) => {
  res.type('text').send('KEY: ' + (GROQ_KEY ? 'SET' : 'NOT SET'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log('UP on', PORT));
