# Orapa Mine

Éditeur de disposition, mode solo et prise de notes en duel. Une page statique : tout le jeu
tourne dans le navigateur, et les parties y sont archivées.

## Lancer

```sh
npm start          # → http://localhost:4000
```

Aucune dépendance à installer, et rien à construire : `server.js` ne fait que servir
`index.html`. `PORT` change le port (4000 par défaut).

Le même fichier se publie tel quel sur GitHub Pages — voir
[docs/hebergement-github-pages.md](docs/hebergement-github-pages.md). La page a besoin d'un
accès réseau au premier chargement, React étant chargé depuis un CDN.

## Les sept pièces

Cinq pièces colorées — **Rouge** (parallélogramme), **Jaune** (triangle rectangle isocèle de
côté 2), **Bleu** et **Grand blanc** (triangles isocèles de base 4), **Petit blanc** (losange) —
et deux petites :

- **Transparent** — un triangle rectangle isocèle de côté 1, large d'une seule case. Il dévie le
  rayon comme les autres pièces, mais sans le teinter : un rayon devenu rouge chez le Rouge
  ressort rouge après le Transparent, et un rayon qui ne croise que du transparent ressort
  incolore.
- **Noir** — un rectangle 2×1, deux cases pleines sans aucune arête en biais. Il avale le rayon :
  peu importe par où celui-ci l'aborde et ce qu'il avait déjà touché, il n'y a pas de sortie, et
  donc aucune couleur à annoncer. La réponse à la question est « rien ne ressort ».

Toute pièce qui renvoie le rayon n'est un miroir que sur son hypoténuse : un rayon qui l'aborde
par l'un de ses côtés droits bute sur un flanc plat et repart d'où il vient. Les grandes pièces
cachaient cette règle — derrière leurs faces plates il y a toujours une case pleine, qui renvoie
déjà le rayon à 180°. Le petit Transparent, large d'une seule case, n'en a pas : `rasterize` note
donc, pour chaque case coupée en biais, quel demi-carré porte la matière (`filled`), et `fire2`
fait demi-tour quand le rayon y entre par un côté plein. Les cinq pièces d'origine gardent au
sondage près le comportement qu'elles avaient.

## Les quatre modes

- **SOLO** — une disposition est tirée au hasard et cachée. Chaque clic sur un rond du bord
  pose une question ; la sortie et la couleur du rayon s'affichent. Le score est le nombre de
  questions posées. On reconstitue la disposition avec les 7 pièces, puis « Vérifier » compare
  les 36 sondages. Une partie gagnée s'archive automatiquement.
  Un sélecteur au-dessus du plateau choisit ce qu'un clic y fait, parmi trois choses.
  **Placer des pièces**, et les questions se posent en cliquant les ronds du bord.
  **Annoter** pour raisonner — griser une case (ou une ligne / colonne entière en cliquant son
  libellé), poser un triangle rectangle isocèle ou un carré, dans l'une des six couleurs des
  pièces : rouge, jaune, bleu, blanc, noir et transparent. Les questions se posent aussi dans ce
  mode. **Sonder l'hypothèse**, enfin : un clic sur un rond du bord tire alors un rayon à travers
  les pièces posées et non la disposition cachée. Ça ne coûte pas de question, le trajet s'affiche
  sur le plateau, et si ce départ a déjà sa réponse, l'app dit tout de suite si l'hypothèse la
  respecte ou la contredit.
- **DUEL** — la prise de notes face à un adversaire réel. L'app ne connaît aucune disposition :
  c'est l'adversaire qui répond, et on saisit sa réponse en trois clics — le rond de **départ**,
  le rond d'**arrivée** (ou « rayon piégé », ou « rayon absorbé » — qui se note d'un seul clic,
  puisqu'un rayon avalé n'annonce pas de couleur), puis la **couleur** annoncée. Les deux extrémités
  du rayon prennent cette couleur sur le plateau. Le même plateau accepte les annotations, les
  pièces et le sondage d'hypothèse qu'en mode solo ; « Comparer aux notes » confronte d'un coup
  l'hypothèse posée à toutes les réponses notées et liste celles qui la contredisent. Un duel
  s'enregistre sous le nom de l'adversaire, puis se sauvegarde tout seul à chaque note.
- **VALIDATION** — l'éditeur : placer, déplacer (glisser ou flèches), pivoter (`R`), retourner
  (`F`), tirer un rayon depuis n'importe quel bord, contrôler la légalité du placement, et
  enregistrer le positionnement sous un nom.
- **ARCHIVES** — les parties, les duels et les positionnements enregistrés. Une partie se reprend
  où elle s'était arrêtée (questions, annotations, hypothèses), se rejoue de zéro sur la même
  disposition cachée, ou s'ouvre dans l'éditeur. Un duel se reprend de la même façon.

## Les données

Tout vit dans le `localStorage` du navigateur, sous une seule clé `orapa.v1` :

```js
{ version: 1, seq: 42,
  layouts: [ {id, name, source:'validation', pieces, signature, created_at} ],
  games:   [ {id, score, won, created_at, questions, annotations, solution, guess} ],
  duels:   [ {id, name, created_at, updated_at, questions, annotations, guess} ] }
```

Les positions d'une partie ou d'un duel sont rangées avec eux (`solution`, `guess`) ; `layouts`
ne garde que les positionnements enregistrés à la main en mode VALIDATION. Supprimer une partie
emporte donc ses positions, sans cascade à gérer. `version` sert aux migrations futures.

**C'est la seule copie, et elle est locale.** Vider les données du site efface les parties, et
rien ne suit vers un autre appareil — chaque origine (`localhost:4000`, l'URL Pages) a son
stockage à elle. D'où le panneau **Sauvegarde** dans ARCHIVES : *Exporter* télécharge tout dans
un `orapa-AAAA-MM-JJ.json`, *Importer* le relit. Les entrées importées sont ré-identifiées et
ajoutées, jamais écrasées — réimporter deux fois le même fichier crée des doublons.

### Venir d'une ancienne base SQLite

Les versions précédentes stockaient les parties dans `orapa.sqlite` via un serveur Node. Pour
récupérer ces données :

```sh
node scripts/sqlite-vers-json.mjs orapa.sqlite orapa-export.json
```

puis ARCHIVES → 📂 Importer, sur chaque origine où tu utilises l'app.

## Documents

- [Héberger sur GitHub Pages](docs/hebergement-github-pages.md) — pourquoi l'app est passée à
  un stockage navigateur, ce que ça coûte, et comment publier.

## Débug

Le panneau « Débug » de chaque mode logge le plateau et les 36 sondages en JSON (log auto,
copie dans le presse-papier). En console : `__debug()` / `__debugJSON()` pour le plateau
courant, `__solution()` pour la disposition cachée du mode solo.
