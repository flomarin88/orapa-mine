# Orapa Mine

Éditeur de disposition et mode solo, avec archivage des parties dans une base SQLite.

## Lancer

```sh
npm start          # → http://localhost:4000
```

Aucune dépendance à installer : le serveur utilise `node:sqlite`, intégré à Node ≥ 22.5
(testé sur Node 24). La page a en revanche besoin d'un accès réseau, React étant chargé
depuis un CDN.

Variables d'environnement : `PORT` (4000 par défaut) et `ORAPA_DB` (chemin de la base,
`orapa.sqlite` à côté du serveur par défaut).

## Les quatre modes

- **SOLO** — une disposition est tirée au hasard et cachée. Chaque clic sur un rond du bord
  pose une question ; la sortie et la couleur du rayon s'affichent. Le score est le nombre de
  questions posées. On reconstitue la disposition avec les 5 pièces, puis « Vérifier » compare
  les 36 sondages. Une partie gagnée s'archive automatiquement.
  Un sélecteur au-dessus du plateau choisit ce qu'un clic y pose : des pièces, ou des annotations
  pour raisonner — griser une case (ou une ligne / colonne entière en cliquant son libellé), poser
  un triangle rectangle isocèle ou un carré, dans l'une des quatre couleurs des pièces. Les
  questions se posent dans les deux cas.
- **DUEL** — la prise de notes face à un adversaire réel. L'app ne connaît aucune disposition :
  c'est l'adversaire qui répond, et on saisit sa réponse en trois clics — le rond de **départ**,
  le rond d'**arrivée** (ou « rayon piégé »), puis la **couleur** annoncée. Les deux extrémités
  du rayon prennent cette couleur sur le plateau. Le même plateau accepte les annotations et les
  pièces qu'en mode solo ; « Comparer aux notes » confronte l'hypothèse posée aux réponses notées
  et liste celles qui la contredisent. Un duel s'enregistre sous le nom de l'adversaire, puis se
  sauvegarde tout seul à chaque note.
- **VALIDATION** — l'éditeur : placer, déplacer (glisser ou flèches), pivoter (`R`), retourner
  (`F`), tirer un rayon depuis n'importe quel bord, contrôler la légalité du placement, et
  enregistrer le positionnement sous un nom.
- **ARCHIVES** — les parties, les duels et les positionnements enregistrés. Une partie se reprend
  où elle s'était arrêtée (questions, annotations, hypothèses), se rejoue de zéro sur la même
  disposition cachée, ou s'ouvre dans l'éditeur. Un duel se reprend de la même façon.

## La base

Un fichier SQLite classique, ouvrable avec n'importe quel outil (`sqlite3 orapa.sqlite`) :

- `layouts` — un positionnement : `pieces` (JSON), `source` (`validation`, `solo-solution`,
  `solo-hypothese`, `duel-hypothese`), `signature` (les 36 sondages, pour reconnaître une
  position), `name`.
- `games` — une partie solo : la solution et l'hypothèse (vers `layouts`), les `questions`
  posées (JSON), les `annotations` du plateau (JSON `{"x,y": {kind, color, orient}}`), le
  `score` et `won`.
- `duels` — un duel : le `name` de l'adversaire, l'hypothèse (vers `layouts`), les `questions`
  notées et les `annotations`, aux mêmes formats que pour une partie. `updated_at` bouge à
  chaque sauvegarde automatique.

Une base créée avant les annotations est migrée au démarrage (`ALTER TABLE`), sans rien perdre.

Supprimer une partie supprime aussi les deux positions qui n'existaient que par elle ; de même
pour un duel et son hypothèse. Ré-enregistrer un duel remplace son hypothèse au lieu d'en
empiler une nouvelle.

## Documents

- [Héberger sur GitHub Pages](docs/hebergement-github-pages.md) — proposition d'architecture
  pour rendre l'app statique (stockage dans le navigateur), et pourquoi Vercel ne serait pas
  plus simple. Pas encore implémentée.

## Débug

Le panneau « Débug » de chaque mode logge le plateau et les 36 sondages en JSON (log auto,
copie dans le presse-papier). En console : `__debug()` / `__debugJSON()` pour le plateau
courant, `__solution()` pour la disposition cachée du mode solo.
