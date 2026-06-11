const express = require('express');
const Groq = require('groq-sdk');
const path = require('path');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_KEY = process.env.GROQ_API_KEY;
const groq = GROQ_KEY ? new Groq({ apiKey: GROQ_KEY }) : null;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
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
      const title = m[1].replace(/<[^>]*>/g, '').trim();
      const body = m[2].replace(/<[^>]*>/g, '').trim();
      if (title) results.push('- ' + title + ': ' + body);
    }
    return results.length ? results.join('\n') : null;
  } catch {
    return null;
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/chat', async (req, res) => {
  try {
    if (!groq) {
      return res.status(500).json({ error: 'GROQ_API_KEY not set. Add it in Render env vars.' });
    }
    const { message, history } = req.body;
    let system = 'You are KAVI, a conversational voice AI. Keep responses 1-3 sentences. Natural speech, no lists.';
    if (needsSearch(message)) {
      const info = await webSearch(message);
      if (info) system += '\n\nCurrent info:\n' + info;
    }
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        ...(history || []),
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 200,
    });
    res.json({ response: completion.choices[0]?.message?.content || '' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log('KAVI on port', PORT));
