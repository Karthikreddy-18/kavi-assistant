import express from 'express';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const NEEDS_SEARCH = /\b(news|today|current|latest|recent|weather|price|stock|score|result|update|forecast|election|who won|what happened|how much|livescore|match|date|time)\b/i;

function shouldSearch(text) {
  return NEEDS_SEARCH.test(text) || /202[4-9]/.test(text);
}

async function webSearch(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];
    $('.result').each((i, el) => {
      const title = $(el).find('.result__title').text().trim();
      const body = $(el).find('.result__snippet').text().trim();
      if (title && body) results.push(`- ${title}: ${body}`);
    });
    return results.length > 0 ? results.slice(0, 5).join('\n') : null;
  } catch {
    return null;
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/chat', async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
      return res.status(500).json({ error: 'GROQ_API_KEY not set in .env file. Add your real key and restart.' });
    }

    const { message, history } = req.body;
    let systemContent = 'You are KAVI, a fast conversational AI assistant optimized for voice. Keep responses 1-3 sentences. Speak naturally. Never use lists or markdown. Be direct and conversational.';

    if (shouldSearch(message)) {
      const searchResults = await webSearch(message);
      if (searchResults) {
        systemContent += `\n\nUse this current info if relevant:\n${searchResults}`;
      }
    }

    const messages = [
      { role: 'system', content: systemContent },
      ...(history || []),
      { role: 'user', content: message }
    ];

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.7,
      max_tokens: 200,
    });

    res.json({ response: completion.choices[0]?.message?.content || '' });
  } catch (err) {
    console.error('Groq API error:', err.message || err);
    const msg = err.status === 401 ? 'Invalid Groq API key. Check your .env file.' : 'Something went wrong on the server.';
    res.status(500).json({ error: msg });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`KAVI running at http://localhost:${PORT}`);
});
