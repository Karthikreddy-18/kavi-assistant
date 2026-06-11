const http = require('http');
require('dotenv').config();
const s = http.createServer((req, res) => {
  if (req.url === '/test') { res.end(process.env.GROQ_API_KEY ? 'HAS_KEY' : 'NO_KEY'); return; }
  res.end('KAVI OK');
});
s.listen(process.env.PORT || 3000, () => console.log('OK'));
