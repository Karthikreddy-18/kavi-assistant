import express from 'express';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_KEY = process.env.GROQ_API_KEY;
const groq = GROQ_KEY ? new Groq({ apiKey: GROQ_KEY }) : null;

const NEEDS_SEARCH = /\b(news|today|current|latest|recent|weather|price|stock|score|result|update|forecast|election|who won|what happened|how much|date|time)\b/i;

function shouldSearch(text) {
  return NEEDS_SEARCH.test(text) || /202[4-9]/.test(text);
}

async function webSearch(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = await res.text();
    const results = [];
    const regex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = regex.exec(html)) !== null && results.length < 5) {
      const title = match[1].replace(/<[^>]*>/g, '').trim();
      const body = match[2].replace(/<[^>]*>/g, '').trim();
      if (title) results.push(`- ${title}: ${body}`);
    }
    return results.length > 0 ? results.join('\n') : null;
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

    if (shouldSearch(message)) {
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
    console.error('API error:', err.message);
    res.status(500).json({ error: 'Server error. Check logs.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('KAVI running on port', PORT);
});
