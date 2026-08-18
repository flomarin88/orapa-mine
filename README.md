# Orapa Mine

Éditeur de disposition et mode solo, avec archivage des parties dans une base SQLite.

## Lancer

```sh
npm start          # → http://localhost:3000
```

Aucune dépendance à installer : le serveur utilise `node:sqlite`, intégré à Node ≥ 22.5
(testé sur Node 24). La page a en revanche besoin d'un accès réseau, React étant chargé
depuis un CDN.

Variables d'environnement : `PORT` (3000 par défaut) et `ORAPA_DB` (chemin de la base,
`orapa.sqlite` à côté du serveur par défaut).

## Les trois modes

- **SOLO** — une disposition est tirée au hasard et cachée. Chaque clic sur un rond du bord
  pose une question ; la sortie et la couleur du rayon s'affichent. Le score est le nombre de
  questions posées. On reconstitue la disposition avec les 5 pièces, puis « Vérifier » compare
  les 36 sondages. Une partie gagnée s'archive automatiquement.
  Le plateau accepte des annotations pour raisonner : griser une case (ou une ligne / colonne
  entière en cliquant son libellé), poser un triangle rectangle isocèle ou un carré, dans l'une
  des quatre couleurs des pièces.
- **VALIDATION** — l'éditeur : placer, déplacer (glisser ou flèches), pivoter (`R`), retourner
  (`F`), tirer un rayon depuis n'importe quel bord, contrôler la légalité du placement, et
  enregistrer le positionnement sous un nom.
- **ARCHIVES** — les parties et les positionnements enregistrés. Une partie se reprend où elle
  s'était arrêtée (questions, annotations, hypothèses), se rejoue de zéro sur la même disposition
  cachée, ou s'ouvre dans l'éditeur.

## La base

Un fichier SQLite classique, ouvrable avec n'importe quel outil (`sqlite3 orapa.sqlite`) :

- `layouts` — un positionnement : `pieces` (JSON), `source` (`validation`, `solo-solution`,
  `solo-hypothese`), `signature` (les 36 sondages, pour reconnaître une position), `name`.
- `games` — une partie solo : la solution et l'hypothèse (vers `layouts`), les `questions`
  posées (JSON), les `annotations` du plateau (JSON `{"x,y": {kind, color, orient}}`), le
  `score` et `won`.

Une base créée avant les annotations est migrée au démarrage (`ALTER TABLE`), sans rien perdre.

Supprimer une partie supprime aussi les deux positions qui n'existaient que par elle.

## Débug

Le panneau « Débug » de chaque mode logge le plateau et les 36 sondages en JSON (log auto,
copie dans le presse-papier). En console : `__debug()` / `__debugJSON()` pour le plateau
courant, `__solution()` pour la disposition cachée du mode solo.
