// Migration ponctuelle : convertit une base orapa.sqlite (l'ancien serveur) en un fichier
// JSON importable depuis ARCHIVES → Importer.
//
//   node scripts/sqlite-vers-json.mjs [base.sqlite] [sortie.json]
//
// Les positions référencées par une partie ou un duel sont inlinées, comme le fait désormais
// le stockage du navigateur ; `layouts` ne garde que les positionnements enregistrés à la main.
import { writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const [, , dbFile = 'orapa.sqlite', outFile = 'orapa-export.json'] = process.argv;
const db = new DatabaseSync(dbFile);

const has = (t) => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
const all = (sql) => (db.prepare(sql).all());
const json = (v, fallback) => (v ? JSON.parse(v) : fallback);

let seq = 0;
const id = () => ++seq;

const layouts = has('layouts')
  ? all("SELECT * FROM layouts WHERE source = 'validation' ORDER BY id").map(r => ({
      id: id(), name: r.name, source: r.source,
      pieces: JSON.parse(r.pieces), signature: r.signature || '', created_at: r.created_at,
    }))
  : [];

const games = has('games')
  ? all(`SELECT g.*, s.pieces AS sol, h.pieces AS gue
         FROM games g JOIN layouts s ON s.id = g.solution_id
         LEFT JOIN layouts h ON h.id = g.guess_id ORDER BY g.id`).map(r => ({
      id: id(), score: r.score, won: !!r.won, created_at: r.created_at,
      questions: json(r.questions, []), annotations: json(r.annotations, {}),
      solution: JSON.parse(r.sol), guess: r.gue ? JSON.parse(r.gue) : null,
    }))
  : [];

const duels = has('duels')
  ? all(`SELECT d.*, h.pieces AS gue
         FROM duels d LEFT JOIN layouts h ON h.id = d.guess_id ORDER BY d.id`).map(r => ({
      id: id(), name: r.name, created_at: r.created_at, updated_at: r.updated_at,
      questions: json(r.questions, []), annotations: json(r.annotations, {}),
      guess: r.gue ? JSON.parse(r.gue) : null,
    }))
  : [];

await writeFile(outFile, JSON.stringify({ version: 1, seq, layouts, games, duels }, null, 2));
console.log(`${outFile} : ${duels.length} duel(s), ${games.length} partie(s), ${layouts.length} positionnement(s)`);
