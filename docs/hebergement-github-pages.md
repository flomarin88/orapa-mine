# Héberger Orapa Mine sur GitHub Pages

> **Statut : proposition.** L'architecture ci-dessous n'est pas encore implémentée.
> Trois décisions restent à trancher — voir « Décisions à prendre ».

## Le problème

L'app est en deux morceaux :

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

La couture est déjà au bon endroit : **10 méthodes dans un seul objet `api`, appelées depuis
8 endroits, dans 3 composants** (`SaveLayoutPanel`, `Archives`, `Solo`, `Duel`). Tout le reste
ignore d'où viennent les données.

```
                      AUJOURD'HUI                          APRÈS
  ┌──────────────────────────────┐        ┌──────────────────────────────┐
  │ Solo · Duel · Validation     │        │ Solo · Duel · Validation     │
  │ Archives · BoardView         │        │ Archives · BoardView         │
  │ useEditor · useAnnots        │        │ useEditor · useAnnots        │
  │ fire2 · buildBoard · sig     │        │ fire2 · buildBoard · sig     │
  ├──────────────────────────────┤        ├──────────────────────────────┤
  │ api  (10 méthodes)           │ ◄──────┤ api  (10 méthodes, identique)│
  ├──────────────────────────────┤ seam   ├──────────────────────────────┤
  │ apiReq  →  fetch('/api/...') │        │ localStore  →  localStorage  │
  └──────────────┬───────────────┘        └──────────────────────────────┘
                 │ HTTP
  ┌──────────────▼───────────────┐          server.js : plus nécessaire
  │ server.js  ·  node:sqlite    │          (garde-le comme serveur de
  │ layouts · games · duels      │           fichiers en local, ou pas)
  └──────────────────────────────┘
```

Zéro ligne à toucher dans les composants. On remplace uniquement l'implémentation sous `api`.

## 2. Le contrat à respecter

C'est la seule chose qui compte : la nouvelle implémentation doit rendre exactement les mêmes
formes, sinon `Archives`, `Solo` et `Duel` cassent.

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

On peut donc aplatir — et les cascades disparaissent d'elles-mêmes :

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

Effet de bord à assumer : **le fichier `orapa.sqlite` disparaît**, et avec lui l'inspection au
`sqlite3`. C'est ce que remplace la section suivante.

## 4. Export / import JSON

Non négociable, pour deux raisons :

1. C'est la seule sauvegarde. Un « effacer les données du site » dans le navigateur efface tout.
2. C'est le seul moyen de passer un duel du téléphone au laptop.

Un panneau dans ARCHIVES : *Exporter* télécharge le blob complet, *Importer* le relit et
fusionne. C'est aussi ce qui remplace `sqlite3 orapa.sqlite` pour fouiller à la main.

## 5. Décisions à prendre

### a) Un backend, ou deux ?

- **Un seul** — `localStorage` partout, `server.js` prend sa retraite. Un seul chemin de code,
  mais adieu SQLite.
- **Deux** — une sonde au démarrage : SQLite quand `npm start` répond, `localStorage` sinon.
  Garde le confort de dev, au prix de deux implémentations à maintenir en phase.

*Penchant : un seul*, l'export JSON couvrant le besoin d'inspection.

### b) React et Babel : CDN, figés, ou compilés ?

| | poids | hors-ligne | build |
|---|---|---|---|
| CDN (actuel) | 0 | ✗ | aucun |
| vendorisé dans le dépôt | ~3 Mo (Babel pèse lourd) | ✓ | aucun |
| JSX précompilé | ~140 Ko | ✓ | `npx babel` avant commit |

Le troisième donne le meilleur résultat mais casse le « ouvre `index.html`, ça marche » qui
fait le charme du projet. Le deuxième est le compromis honnête : lourd au premier chargement,
puis mis en cache.

À noter : en l'état, la page a besoin du réseau au premier chargement. En salle sans wifi
fiable, ça compte.

### c) Un seul fichier, ou un `vendor/` ?

`index.html` fait déjà plus de 1160 lignes. Si on vendorise, autant en profiter pour sortir le
script dans `app.jsx` — mais ça oblige à servir la page par HTTP (plus de double-clic sur le
fichier).

## 6. Déploiement

Rien à installer. `index.html` est déjà à la racine, donc Pages en mode *deploy from branch →
`master` → `/ (root)`* le sert tel quel sur `flomarin.github.io/orapa-mine/`.

Le sous-chemin ne pose aucun problème une fois `/api` supprimé : plus une seule URL absolue
dans le code. Pas d'Actions, pas de branche `gh-pages`, pas de config.

## 7. Ce que ça coûte

- **Les données restent sur l'appareil.** Un duel noté sur le téléphone ne sera pas sur le
  laptop, sauf export / import manuel.
- **Elles sont effaçables par le navigateur** — nettoyage de données de site, mode privé,
  réglages agressifs de rétention. D'où l'export.
- **Plus de base SQLite** à ouvrir avec un outil tiers, si l'option (a) « un seul backend »
  est retenue.

Si l'un de ces trois points devient bloquant, c'est le signal qu'il faut un vrai backend —
et à ce moment-là, Vercel + Turso plutôt que Pages.
