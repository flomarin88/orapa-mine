// Serveur de développement : il ne fait que servir la page.
// Les parties vivent dans le navigateur (localStorage), exactement comme sur GitHub Pages —
// ouvrir http://localhost:4000 ou l'URL Pages donne le même comportement, à ceci près que
// chaque origine a son propre stockage. Pour transporter des parties : ARCHIVES → Exporter.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const html = await readFile(join(ROOT, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
});

server.listen(PORT, () => {
  console.log(`Orapa Mine → http://localhost:${PORT}`);
});
