# Calepineur

Prépare ta pose de carrelage dans le navigateur : visualise le rendu sur tes photos, calcule la quantité à commander et imprime un calepinage précis.

**[Ouvrir l'application](https://enavarro222.github.io/Calepineur/)**

Tout se passe dans ton navigateur : tes photos et tes mesures ne sont envoyées nulle part. Le projet est enregistré automatiquement sur l'appareil utilisé. **Exporter** produit un fichier JSON (images comprises) à garder en sauvegarde ou à rouvrir ailleurs.

Calepineur gère aujourd'hui les carreaux hexagonaux.

## Démarche

1. **Carreaux & motifs** : taille réelle du carreau (plat à plat), joint, orientation, motifs et leurs poids.
2. **Chaque pan** : largeur et hauteur mesurées, éléments (fenêtre, hotte, prises, meubles), zone à carreler avec *Pinceau zone* (glisser sur les carreaux pour en ajouter ou en retirer, en vue Plan ou Photo) ou *Contour zone* (déplacer les points du contour). Les cotes partent du coin bas-gauche, au ras du plan de travail.
3. **Grille** : *Optimiser* cherche le décalage qui gâche le moins de carreaux et évite les petites coupes ; *Raccorder* prolonge la grille du pan précédent à travers l'angle.
4. **Vue Photo** : *Caler la photo* (4 repères aux cotes connues) montre le rendu sur la vraie pièce.
5. **Motifs** : *Mélanger*, ou peindre et pivoter carreau par carreau (touches 1 à 9 pour choisir le motif).
6. **Commande**, puis **Calepinage** → Imprimer / PDF : plan étiqueté, repères de traçage et vignettes cotées de chaque coupe.

Le mélange équilibre les quantités et évite deux motifs identiques côte à côte. Cette règle n'est garantie qu'à partir de 7 motifs, car un carreau a 6 voisins.

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

- `src/core/` : calcul pur, sans interface. `lattice.ts` réseau de pose (seul fichier qui connaît la forme du carreau), `compute.ts` coupes, `designs.ts` répartition des motifs, `order.ts` quantités, `optimize.ts` grille, `photo.ts` projection sur la photo, `project.ts` format de fichier et validation, `demo.ts` projet d'exemple.
- `src/store/` : état, annulation, sauvegarde et outils de la scène.
- `src/components/` : interface React.
- `tests/e2e/` : parcours complets dans un vrai navigateur.

## Données personnelles

Le dépôt ne contient aucune photo ni aucun visuel de produit. Le projet d'exemple est fictif et ses motifs sont dessinés par le code. `pnpm check:data` refuse toute image bitmap, y compris en CI, et le dossier `perso/` est ignoré par Git.

## Licence

[MIT](LICENSE)
