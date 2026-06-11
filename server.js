const http = require('http');
const s = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('HELLO');
});
s.listen(process.env.PORT || 3000, () => console.log('UP'));
