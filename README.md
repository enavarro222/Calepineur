# Calepineur

Prépare ta pose de carrelage dans le navigateur : visualise le rendu sur tes photos, calcule la quantité à commander et imprime un calepinage précis.

**[Ouvrir l'application](https://enavarro222.github.io/Calepineur/)**

Tout se passe dans ton navigateur : tes photos et tes mesures ne sont envoyées nulle part. Le projet est enregistré automatiquement sur l'appareil utilisé. **Exporter** produit un fichier JSON (images comprises) à garder en sauvegarde ou à rouvrir ailleurs.

Calepineur gère aujourd'hui les carreaux hexagonaux.

## Démarche

1. **Carreaux & motifs** : taille réelle du carreau (plat à plat), joint, orientation, motifs et leurs poids.
2. **Chaque pan** : largeur et hauteur mesurées, éléments (fenêtre, hotte, prises, meubles), zone à carreler avec *Pinceau zone* (glisser sur les carreaux pour en ajouter ou en retirer, en vue Plan ou Photo) ou *Contour zone* (déplacer les points du contour). Les cotes partent du coin bas-gauche, au ras du plan de travail.
3. **Grille** : *Optimiser* cherche le décalage qui gâche le moins de carreaux et évite les petites coupes ; *Raccorder* prolonge la grille du pan précédent à travers l'angle. *Angle commun* indique que le pan touche le précédent (coché d'office pour une grille raccordée). Si les deux pans ne partent pas de la même hauteur (l'un du sol, l'autre du plan de travail), le *Décalage en hauteur* donne la hauteur du bas du pan au-dessus du bas du précédent, négative s'il part plus bas : le raccord de la grille, l'harmonie et la vue d'ensemble en tiennent compte. Règle-le avant de cliquer sur *Raccorder*, ou après : une grille déjà raccordée suit.
4. **Vue Photo** : *Caler la photo* (4 repères aux cotes connues) montre le rendu sur la vraie pièce.
5. **Vue d'ensemble** : tous les pans à la fois, en plan déplié (les pans reliés par un angle se suivent), sur leurs photos côte à côte, ou sur une photo de toute la pièce où chaque pan se cale sur ses propres repères. Si la photo d'ensemble est la photo d'un pan, *Reprendre le calage de sa photo* applique son calage tel quel. Pour deux pans en angle, *Raccorder à « … »* pose les deux repères côté angle sur l'arête du pan voisin déjà calé : il ne reste que les deux repères du côté opposé à placer.
6. **Motifs** : *Mélanger*, ou peindre et pivoter carreau par carreau (touches 1 à 9 pour choisir le motif). *Harmoniser* propose plusieurs répartitions à choisir, *Défauts* surligne ce qui accroche l'œil, *Échanger* intervertit deux carreaux à la main, et *Remplacer* propose pour un carreau un autre motif qui ne se répète pas à proximité (reclique pour une autre proposition).
7. **Commande**, puis **Calepinage** → Imprimer / PDF : plan étiqueté, repères de traçage et vignettes cotées de chaque coupe.

Une seule liste de défauts sert partout : la note d'harmonie et *Défauts* les montrent, *Harmoniser*, *Mélanger*, *Remplacer* et le remplissage des nouveaux carreaux cherchent à en avoir le moins possible. Chaque défaut vaut des points :

| Défaut | Points |
|---|---|
| Deux voisins identiques | 3 |
| Trois carreaux identiques alignés, côte à côte, à une colonne ou à un carreau d'écart | 1 |
| Deux carreaux identiques sur une même rangée, une colonne entre | 0,5 |
| Trois carreaux identiques à un autre pas constant | 0,25 |
| Un carreau en amas : son motif revient nettement plus que sa part autour de lui | 0,25 |
| Quatre voisins clairs, ou sombres, en losange ou en ligne droite (style Naturel) | 0,25 |
| Deux voisins sans couleur commune (styles Vagues et Dégradé) | 0,25 |

Les morceaux de moins de 20 % d'un carreau ne comptent pas. Avec 7 motifs ou plus, deux voisins identiques sont toujours évitables, car un carreau a 6 voisins.

*Mélanger* donne à chaque motif sa part selon les poids, au carreau près, la pose au hasard, puis fait la même recherche qu'Harmoniser. Harmoniser ne fait qu'échanger des carreaux d'un même pan : les quantités ne changent pas, ni au total ni par pan, et les carreaux peints ou échangés à la main restent en place. Le but est un aspect naturel, pas un écartement maximal, qui créerait une trame régulière. La teinte d'un motif vient de sa couleur, calculée quand son image est chargée.

Harmoniser propose quatre styles :

- **Naturel** : le mélange décrit ci-dessus.
- **Vagues de couleur** : les teintes se regroupent en vagues irrégulières.
- **Dégradé** : les motifs suivent leur couleur dominante, du plus sombre au plus clair, avec une proposition par sens (gauche-droite, droite-gauche, bas-haut, diagonale).

- **Mes teintes** : tu poses toi-même des repères de couleur sur les pans, dans *Vue d'ensemble* → *Teintes*. Les motifs qui ont cette couleur y sont attirés, et les teintes se fondent d'un repère à l'autre, d'un pan à l'autre ; le réglage *Transition* va de douce à franche. Les couleurs proposées sont celles des motifs. Pour chaque teinte, la vue compare la part des carreaux demandée à celle des carreaux disponibles : les quantités ne changent pas, une teinte trop demandée déborde sur les autres.

Dans ces trois styles, chaque motif est en plus attiré vers sa zone : c'est le seul critère qui n'est pas un défaut. Les amas et les taches de teinte y sont voulus, et deux voisins sans couleur commune comptent comme un défaut.

Les voisinages traversent les angles communs : deux carreaux de part et d'autre d'un angle ne doivent pas être identiques, et les deux morceaux d'un carreau coupé par l'angle ne comptent pas comme voisins. Une fois un style choisi, *Mélanger* en tire une nouvelle variante, dans le même sens pour un dégradé.

Les styles de couleur échangent des carreaux entre les pans : le total commandé ne change pas, la part de chaque pan oui. Les couleurs primaire, secondaire et tertiaire de chaque motif sont lues au chargement de son image, avec une seule couleur pour un uni. Elles se corrigent dans *Carreaux & motifs*, et *Lire les couleurs des images* les relit.

## Préparer le projet avec une IA

**Préparer avec une IA** ouvre Claude, ChatGPT, Le Chat ou Gemini avec une consigne prête à l'emploi. Tu ajoutes tes photos et ta référence de carreaux dans la discussion, puis tu colles la réponse dans Calepineur, qui la vérifie et résume les changements avant de les appliquer. Les images restent à charger dans l'app, et les cotes estimées sont à vérifier au mètre.

Une IA avec accès au web peut aussi tout apprendre depuis un seul lien : [llms.txt](https://enavarro222.github.io/Calepineur/llms.txt).

Elle peut répondre par un projet complet, une simple correction, ou un lien de la forme `https://enavarro222.github.io/Calepineur/#config=<JSON encodé>`. Un tel lien ne s'applique jamais tout seul : Calepineur montre les changements et attend ta validation. Les données restent après le `#`, elles ne sont donc pas envoyées au serveur.

Un lien ne peut pas contenir d'image, mais une IA peut préparer leur traitement :

- `calib` sur un mur : 4 repères de calage, appliqués dès que la photo du mur est choisie, ou tout de suite si elle est déjà chargée.
- `overviewCalib` sur un mur : ses 4 repères sur la photo d'ensemble, appliqués de la même façon dès que cette photo est choisie dans la Vue d'ensemble.
- `crop` sur un motif : l'emplacement du carreau sur une photo qui les montre tous. Calepineur découpe les motifs quand cette photo est choisie.

Elle peut aussi régler les angles : `joinPrev` sur un mur indique qu'il touche le précédent, et `joinDy` la hauteur de son bas au-dessus du bas du précédent.

Les liens préremplis reposent sur des paramètres d'adresse non documentés. Chaque bouton copie donc aussi la consigne, à coller si elle n'apparaît pas.

## Développement

Il faut Node 26 et pnpm.

```sh
pnpm install
pnpm dev          # serveur de développement
pnpm test         # tests unitaires et d'intégration (Vitest, Testing Library)
pnpm test:e2e     # tests de bout en bout (Playwright)
pnpm lint
pnpm typecheck
pnpm build
```

En local, `pnpm test:e2e` utilise le Chrome installé sur la machine. Pour un autre navigateur, `pnpm exec playwright install chromium` puis `CI=1 pnpm build && CI=1 pnpm test:e2e`.

À chaque push, GitHub Actions lance toutes ces vérifications. Sur `main`, le site est ensuite déployé sur GitHub Pages.

## Organisation

- `src/core/` : calcul pur, sans interface. `lattice.ts` réseau de pose (seul fichier qui connaît la forme du carreau), `compute.ts` coupes, `designs.ts` répartition des motifs, `order.ts` quantités, `optimize.ts` grille, `harmony.ts` note et recherche de répartitions, `palette.ts` couleurs des motifs et parenté, `layout.ts` pans reliés par un angle, `aiPrompt.ts` et `aiReply.ts` échanges avec une IA, `photo.ts` projection sur la photo, `project.ts` format de fichier et validation, `demo.ts` projet d'exemple.
- `src/store/` : état, annulation, sauvegarde et outils de la scène.
- `src/components/` : interface React.
- `tests/e2e/` : parcours complets dans un vrai navigateur.

## Données personnelles

Le dépôt ne contient aucune photo ni aucun visuel de produit. Le projet d'exemple est fictif et ses motifs sont dessinés par le code. `pnpm check:data` refuse toute image bitmap, y compris en CI, et le dossier `perso/` est ignoré par Git.

## Licence

[MIT](LICENSE)
