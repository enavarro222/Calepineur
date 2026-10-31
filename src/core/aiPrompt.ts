// Consigne pour une IA de discussion. Elle se suffit à elle-même : pas besoin d'accès au web.
import type { Project } from './types';

export const APP_URL = 'https://enavarro222.github.io/Calepineur/';
export const GUIDE_URL = `${APP_URL}llms.txt`;
const MAX_LINK_LENGTH = 6000; // au-delà, certains navigateurs ou serveurs coupent l'adresse

const FORMAT = `{
  "version": 1,
  "name": "Ma cuisine",
  "tile": { "F": 14, "joint": 0.2, "orient": "flat", "grout": "#d8d3c8", "edgeGap": 0.2, "waste": 10, "minPiece": 15, "perBox": 0, "m2PerBox": 0 },
  "rotMode": "none",
  "seed": 1,
  "designs": [{ "key": "A", "name": "Motif A", "img": "", "color": "#a3906f", "weight": 1 }],
  "walls": [{
    "id": "mur-1", "name": "Mur évier", "W": 240, "H": 75, "color": "#efe6d2", "ox": 8, "oy": 7,
    "zoneMode": "organic",
    "zone": [[-10, -10], [-10, 60], [250, 60], [250, -10]],
    "obstacles": [{ "name": "Fenêtre", "x": 90, "y": 22, "w": 80, "h": 53 }],
    "photo": null, "tiles": {}
  }]
}`;

const RULES = `Règles :
- Tout est en cm. Pour chaque mur, l'origine est le coin bas-gauche, au ras du plan de travail, et y monte.
- Crée un élément de "walls" par mur à carreler, avec un "id" différent. Il peut y en avoir un seul ou plusieurs.
- W et H : largeur et hauteur du mur, d'un bord dur à l'autre.
- "tile.F" : largeur du carreau hexagonal, de plat à plat. "orient" : "flat" (pointes sur les côtés) ou "pointy" (pointes en haut).
- "designs" : un élément par motif, avec une clé courte et différente ("A", "B"…), "color" au format #rrggbb, "img" toujours vide.
- "obstacles" : rectangles qui interrompent le carrelage (fenêtre, hotte, prises, meubles) ; x et y sont leur coin bas-gauche.
- "zone" : contour de la surface à carreler. Fais-le déborder au-delà du plan de travail et des angles.
- "ox" et "oy" : centre d'un carreau de référence, proche du coin bas-gauche.
- Laisse toujours "photo" à null et "tiles" vide.`;

const PARTIAL = `Modification partielle : pour une correction, donne un JSON sans "version" qui contient seulement ce qui change. Seuls les champs présents sont modifiés.
{ "tile": { "F": 15 }, "walls": [{ "id": "mur-1", "W": 250, "obstacles": [{ "name": "Hotte", "x": 110, "y": 68, "w": 80, "h": 27 }] }] }
- Dans "walls", "id" (ou "name") désigne le mur à modifier. Un id inconnu ajoute un mur, avec au moins W et H. "remove": true retire le mur.
- Dans "designs", "key" désigne le motif, avec la même logique.
- "obstacles" et "zone" remplacent la liste entière du mur.`;

const LINK = `Lien : tu peux aussi donner la configuration, complète ou partielle, sous forme d'un lien à cliquer :
${APP_URL}#config=<JSON encodé>
Encode le JSON comme encodeURIComponent, en encodant aussi les parenthèses (%28, %29) et l'apostrophe (%27). Exemple pour un carreau de 15 cm :
${APP_URL}#config=%7B%22tile%22%3A%7B%22F%22%3A15%7D%7D
L'application montre les changements et attend la validation de l'utilisateur. Au-delà de 4000 caractères, donne plutôt le bloc JSON, à coller dans la fenêtre « Préparer avec une IA ».`;

// Le projet envoyé à l'IA ne contient ni image ni réglage carreau par carreau.
function promptProject(project: Project): Project {
  return {
    ...project,
    designs: project.designs.map(d => ({ ...d, img: '' })),
    walls: project.walls.map(w => ({ ...w, photo: null, tiles: {} })),
  };
}

export function buildPrompt(project: Project | null): string {
  const start = project
    ? `Voici mon projet actuel, à modifier selon mes demandes :\n${JSON.stringify(promptProject(project))}\n\nDemande-moi ce que je veux changer.`
    : `Commence par me demander :
- une photo de chaque mur à carreler, prise bien de face ;
- la référence ou une photo des carreaux ;
- les mesures que je connais déjà.
N'écris pas le projet avant d'avoir ma réponse.`;

  return `Tu m'aides à préparer un projet pour Calepineur (${APP_URL}), un outil de calepinage de carreaux hexagonaux. Si mes carreaux ne sont pas hexagonaux, dis-le-moi : l'outil ne les gère pas encore.

${start}

Ensuite, réponds avec un seul bloc de code JSON, sans commentaire à l'intérieur, de ce format :
${FORMAT}

${RULES}

Après le bloc, liste les cotes que tu as estimées d'après les photos, pour que je les vérifie au mètre. Je collerai ce JSON dans Calepineur.

${PARTIAL}

${LINK}`;
}

// Fichier publié à la racine du site : tout ce qu'une IA doit savoir, à partir d'un simple lien.
export function buildGuide(): string {
  return `# Calepineur

> Application web de calepinage de carreaux hexagonaux : ${APP_URL}
> Elle fonctionne dans le navigateur, sans compte. Tu peux préparer une configuration pour ton interlocuteur.

## Ce que tu dois faire

${buildPrompt(null)}

## Limites

- Tu ne peux pas transmettre d'image : l'utilisateur charge ses photos et ses motifs dans l'application.
- Les cotes déduites d'une photo sont des estimations. Dis-le toujours.
`;
}

export interface AiTarget {
  name: string;
  url: string;
  prefilled: boolean;
}

// Ces paramètres d'adresse ne sont pas documentés et peuvent changer : l'interface copie toujours la consigne aussi.
export function aiTargets(prompt: string): AiTarget[] {
  const q = encodeURIComponent(prompt);
  const withPrompt = (name: string, base: string): AiTarget => {
    const url = `${base}?q=${q}`;
    return url.length <= MAX_LINK_LENGTH ? { name, url, prefilled: true } : { name, url: base, prefilled: false };
  };
  return [
    withPrompt('Claude', 'https://claude.ai/new'),
    withPrompt('ChatGPT', 'https://chatgpt.com/'),
    withPrompt('Le Chat', 'https://chat.mistral.ai/chat'),
    { name: 'Gemini', url: 'https://gemini.google.com/app', prefilled: false },
  ];
}
