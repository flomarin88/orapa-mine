# Héberger Orapa Mine sur GitHub Pages

> **Statut : fait.** Le stockage est passé dans le navigateur, `server.js` ne sert plus que la
> page. Les trois décisions ouvertes ont été tranchées « au plus simple » — voir
> « Décisions prises ».

## Le problème

L'app était en deux morceaux :

- `index.html` — le simulateur, le plateau, les quatre modes. 100 % navigateur.
- `server.js` — le stockage : `/api/layouts`, `/api/games`, `/api/duels`, dans un fichier SQLite.

GitHub Pages ne sert que des fichiers statiques : aucun Node, donc `/api/*` renverrait des 404.
En l'état, SOLO, DUEL et VALIDATION fonctionneraient normalement — toute la simulation est
déjà côté client — mais « Enregistrer », l'auto-sauvegarde des duels et l'onglet ARCHIVES
afficheraient `erreur 404`.

## Pourquoi Vercel ne résout pas ça non plus

Vercel, c'est du serverless : le système de fichiers n'est pas persistant entre deux
invocations, donc `node:sqlite` écrivant dans `orapa.sqlite` perdrait tout. Il faudrait
réécrire les routes en fonctions serverless **et** brancher une base externe (Turso, Neon,
Postgres Vercel). Plus de travail que Pages, pas moins.

Le vrai clivage n'est pas Pages contre Vercel, c'est **où vivent les données**. Tant qu'elles
peuvent rester sur l'appareil, Pages suffit. Si elles doivent être synchronisées entre
plusieurs appareils, il faut un vrai backend, et là Vercel + Turso devient le bon choix.

## 1. Ce qui bouge, ce qui ne bouge pas

La couture était déjà au bon endroit : **10 méthodes dans un seul objet `api`, appelées depuis
8 endroits, dans 4 composants** (`SaveLayoutPanel`, `Archives`, `Solo`, `Duel`). Tout le reste
ignore d'où viennent les données.

```
                        AVANT                                APRÈS
  ┌──────────────────────────────┐        ┌──────────────────────────────┐
  │ Solo · Duel · Validation     │        │ Solo · Duel · Validation     │
  │ Archives · BoardView         │        │ Archives · BoardView         │
  │ useEditor · useAnnots        │        │ useEditor · useAnnots        │
  │ fire2 · buildBoard · sig     │        │ fire2 · buildBoard · sig     │
  ├──────────────────────────────┤        ├──────────────────────────────┤
  │ api  (10 méthodes)           │ ◄──────┤ api  (mêmes 10, + export/import)
  ├──────────────────────────────┤ couture├──────────────────────────────┤
  │ apiReq  →  fetch('/api/...') │        │ readDB / writeDB  →  1 clé   │
  └──────────────┬───────────────┘        └──────────────────────────────┘
                 │ HTTP
  ┌──────────────▼───────────────┐          server.js : 25 lignes, ne sert
  │ server.js  ·  node:sqlite    │          plus que la page — GitHub Pages
  │ layouts · games · duels      │          fait la même chose
  └──────────────────────────────┘
```

Zéro ligne touchée dans les composants : seule l'implémentation sous `api` a changé, plus
`exportAll` / `importAll` ajoutées pour la sauvegarde (section 4).

## 2. Le contrat à respecter

C'est la seule chose qui comptait : la nouvelle implémentation devait rendre exactement les
mêmes formes, sinon `Archives`, `Solo` et `Duel` cassaient.

| méthode | rend |
|---|---|
| `layouts('validation')` | `[{id, name, source, pieces, signature, created_at}]` |
| `saveLayout(l)` | la ligne créée |
| `games()` | `[{id, score, won, created_at, questions, annotations, solution, guess}]` |
| `saveGame(g)` | la ligne créée (seul `.id` est lu) |
| `duels()` | `[{id, name, created_at, updated_at, questions, annotations, guess}]` |
| `saveDuel(d)` / `updateDuel(id, d)` | la ligne (`.id` et `.updated_at` sont lus) |
| `delLayout(id)` / `delGame(id)` / `delDuel(id)` | `null` |

Toutes restent `async` : l'auto-sauvegarde du duel et les `.then().catch()` d'Archives en
dépendent.

## 3. Le format en localStorage

Côté serveur, `layouts` est une table à part et `games` / `duels` y pointent par `solution_id`
et `guess_id`, avec suppressions en cascade. **Mais le client n'a jamais vu ces jointures** :
le serveur lui renvoie déjà `solution` et `guess` inlinés, et `api.layouts()` n'est appelé
qu'avec `'validation'`.

On a donc aplati — et les cascades disparaissent d'elles-mêmes :

```js
localStorage['orapa.v1'] = {
  version: 1,
  seq: 42,                          // remplace l'AUTOINCREMENT
  layouts: [ {id, name, source:'validation', pieces, signature, created_at} ],
  games:   [ {id, score, won, created_at, questions, annotations, solution, guess} ],
  duels:   [ {id, name, created_at, updated_at, questions, annotations, guess} ],
}
```

Une seule clé, lue et réécrite en entier à chaque mutation. C'est brutal mais adapté à la
volumétrie : une partie pèse environ 3 Ko, le quota est de ~5 Mo, soit largement plus de mille
parties. `version` est là pour migrer plus tard sans rien perdre, comme le fait déjà
`server.js` avec son `ALTER TABLE`.

Effet de bord assumé : **le fichier `orapa.sqlite` disparaît**, et avec lui l'inspection au
`sqlite3`. C'est ce que remplace la section suivante.

## 4. Export / import JSON

Non négociable, pour deux raisons :

1. C'est la seule sauvegarde. Un « effacer les données du site » dans le navigateur efface tout.
2. C'est le seul moyen de passer un duel du téléphone au laptop.

D'où le panneau **Sauvegarde** en tête d'ARCHIVES : *Exporter* télécharge tout dans un
`orapa-AAAA-MM-JJ.json`, *Importer* le relit. Les entrées importées sont ré-identifiées et
ajoutées, jamais écrasées — donc réimporter deux fois le même fichier crée des doublons, mais
aucun import ne peut détruire ce qui est déjà là. C'est aussi ce qui remplace
`sqlite3 orapa.sqlite` pour fouiller à la main.

## 5. Décisions prises

**a) Un seul backend.** `localStorage` partout ; `server.js` est retombé à 25 lignes qui ne
font que servir `index.html`. Plus de `node:sqlite`, plus de routes `/api`. L'export JSON
couvre le besoin d'inspection que remplissait `sqlite3 orapa.sqlite`.

**b) CDN conservé.** React et Babel restent chargés depuis le CDN : zéro poids dans le dépôt,
zéro étape de build. Contrepartie assumée : **la page a besoin du réseau au premier
chargement**. En salle sans wifi fiable, ça compte — le jour où ça gêne, la porte de sortie est
de vendoriser les trois fichiers dans `vendor/` (~3 Mo, Babel pèse lourd), ou de précompiler le
JSX (~140 Ko, mais ça ajoute un build).

**c) Fichier unique.** Tout reste dans `index.html`.

### Ce que ça a donné

| | avant | après |
|---|---|---|
| `server.js` | 190 lignes, SQLite, 10 routes | 25 lignes, sert la page |
| stockage | `orapa.sqlite` | `localStorage['orapa.v1']` |
| composants | inchangés | inchangés |
| `api` | `fetch('/api/…')` | lecture / écriture d'une clé |

Un duel de 16 notes plus un positionnement pèsent 2,6 Ko dans le stockage — le quota de ~5 Mo
laisse largement la place.

### Migration depuis l'ancienne base

`scripts/sqlite-vers-json.mjs` convertit un `orapa.sqlite` existant en fichier importable :

```sh
node scripts/sqlite-vers-json.mjs orapa.sqlite orapa-export.json
```

puis ARCHIVES → 📂 Importer. Le script inline les positions référencées, comme le fait
désormais le stockage. À refaire sur chaque origine où l'app est utilisée : `localhost:4000` et
l'URL Pages ont chacune leur `localStorage`.

## 6. Déploiement

Rien à installer. `index.html` est à la racine, donc dans *Settings → Pages*, **Deploy from a
branch → `master` → `/ (root)`** le sert tel quel sur `flomarin.github.io/orapa-mine/`.

Le sous-chemin ne pose aucun problème : plus une seule URL absolue dans le code depuis la
suppression de `/api`. Pas d'Actions, pas de branche `gh-pages`, pas de config. Un `.nojekyll`
à la racine évite au passage de faire passer le dépôt par Jekyll pour rien.

À la première visite de l'URL Pages, les archives seront vides : c'est une origine neuve, donc
un `localStorage` neuf. Exporter depuis `localhost` et importer là-bas.

## 7. Ce que ça coûte

- **Les données restent sur l'appareil.** Un duel noté sur le téléphone ne sera pas sur le
  laptop, sauf export / import manuel.
- **Elles sont effaçables par le navigateur** — nettoyage de données de site, mode privé,
  réglages agressifs de rétention. D'où l'export.
- **Plus de base SQLite** à ouvrir avec un outil tiers. L'export JSON la remplace.
- **Le réseau est requis au premier chargement** (React et Babel viennent du CDN).

Si l'un de ces trois points devient bloquant, c'est le signal qu'il faut un vrai backend —
et à ce moment-là, Vercel + Turso plutôt que Pages.
