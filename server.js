import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.ORAPA_DB || join(ROOT, 'orapa.sqlite');

const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS layouts (
    id         INTEGER PRIMARY KEY,
    name       TEXT,
    source     TEXT NOT NULL,           -- validation | solo-solution | solo-hypothese
    pieces     TEXT NOT NULL,           -- JSON [{name, anchor, rot, flip}]
    signature  TEXT NOT NULL,           -- les 36 sondages, pour reconnaître une position
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS games (
    id          INTEGER PRIMARY KEY,
    solution_id INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
    guess_id    INTEGER          REFERENCES layouts(id) ON DELETE SET NULL,
    questions   TEXT NOT NULL,          -- JSON [{entree, side, line, sortie, ex, couleur}]
    annotations TEXT NOT NULL DEFAULT '{}',  -- JSON {"x,y": {kind, color, orient}}
    score       INTEGER NOT NULL,       -- nombre de questions posées
    won         INTEGER NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS layouts_signature ON layouts(signature);
`);

// migration des bases créées avant les annotations
if (!db.prepare("SELECT name FROM pragma_table_info('games')").all().some(c => c.name === 'annotations')) {
  db.exec("ALTER TABLE games ADD COLUMN annotations TEXT NOT NULL DEFAULT '{}'");
  console.log('base migrée : colonne games.annotations ajoutée');
}

const insertLayout = db.prepare(
  'INSERT INTO layouts (name, source, pieces, signature, created_at) VALUES (?, ?, ?, ?, ?)');
const selectLayouts = db.prepare(
  'SELECT * FROM layouts WHERE source = ? OR ? = \'\' ORDER BY id DESC');
const deleteLayout = db.prepare('DELETE FROM layouts WHERE id = ?');
const insertGame = db.prepare(
  'INSERT INTO games (solution_id, guess_id, questions, annotations, score, won, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
const selectGames = db.prepare(`
  SELECT g.*, s.pieces AS solution_pieces, h.pieces AS guess_pieces
  FROM games g
  JOIN layouts s ON s.id = g.solution_id
  LEFT JOIN layouts h ON h.id = g.guess_id
  ORDER BY g.id DESC`);
const deleteGame = db.prepare('DELETE FROM games WHERE id = ?');
// les positions d'une partie (solution, hypothèse) ne vivent que par elle
const deleteGameLayouts = db.prepare(
  'DELETE FROM layouts WHERE id IN (SELECT solution_id FROM games WHERE id = ?1 UNION SELECT guess_id FROM games WHERE id = ?1)');
const selectGame = db.prepare('SELECT * FROM games WHERE id = ?');

const now = () => new Date().toISOString();
const layoutRow = (r) => ({ ...r, pieces: JSON.parse(r.pieces) });
const gameRow = (r) => ({
  id: r.id, score: r.score, won: !!r.won, created_at: r.created_at,
  questions: JSON.parse(r.questions),
  annotations: JSON.parse(r.annotations || '{}'),
  solution: JSON.parse(r.solution_pieces),
  guess: r.guess_pieces ? JSON.parse(r.guess_pieces) : null,
});

function saveLayout({ name = null, source, pieces, signature }) {
  if (!Array.isArray(pieces) || !pieces.length) throw new HttpError(400, 'pieces manquantes');
  if (!source) throw new HttpError(400, 'source manquante');
  const { lastInsertRowid } = insertLayout.run(
    name, source, JSON.stringify(pieces), signature || '', now());
  return Number(lastInsertRowid);
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readJSON(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'corps JSON invalide'); }
}

async function route(req, url) {
  const p = url.pathname;
  const idOf = (prefix) => Number(p.slice(prefix.length));

  if (req.method === 'GET' && p === '/api/layouts') {
    const source = url.searchParams.get('source') || '';
    return selectLayouts.all(source, source).map(layoutRow);
  }
  if (req.method === 'POST' && p === '/api/layouts') {
    const body = await readJSON(req);
    const id = saveLayout({ ...body, source: body.source || 'validation' });
    return layoutRow(db.prepare('SELECT * FROM layouts WHERE id = ?').get(id));
  }
  if (req.method === 'DELETE' && p.startsWith('/api/layouts/')) {
    deleteLayout.run(idOf('/api/layouts/'));
    return null;
  }
  if (req.method === 'GET' && p === '/api/games') {
    return selectGames.all().map(gameRow);
  }
  if (req.method === 'POST' && p === '/api/games') {
    const { solution, guess, questions = [], annotations = {}, score = 0, won = false, signature, guessSignature } = await readJSON(req);
    const solutionId = saveLayout({ source: 'solo-solution', pieces: solution, signature });
    const guessId = guess && guess.length
      ? saveLayout({ source: 'solo-hypothese', pieces: guess, signature: guessSignature })
      : null;
    const { lastInsertRowid } = insertGame.run(
      solutionId, guessId, JSON.stringify(questions), JSON.stringify(annotations), score, won ? 1 : 0, now());
    const row = selectGame.get(Number(lastInsertRowid));
    return gameRow({ ...row, solution_pieces: JSON.stringify(solution), guess_pieces: guess ? JSON.stringify(guess) : null });
  }
  if (req.method === 'DELETE' && p.startsWith('/api/games/')) {
    const id = idOf('/api/games/');
    db.exec('BEGIN');
    try { deleteGameLayouts.run(id); deleteGame.run(id); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
    return null;
  }
  throw new HttpError(404, 'route inconnue');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      const data = await route(req, url);
      if (data === null) { res.writeHead(204).end(); return; }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(data));
      return;
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = await readFile(join(ROOT, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
      .end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Orapa Mine → http://localhost:${PORT}  (base : ${DB_FILE})`);
});
