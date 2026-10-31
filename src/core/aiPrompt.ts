// Consigne pour une IA de discussion. Elle se suffit à elle-même : pas besoin d'accès au web.
import type { Project } from './types';

export const APP_URL = 'https://enavarro222.github.io/Calepineur/';
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

Après le bloc, liste les cotes que tu as estimées d'après les photos, pour que je les vérifie au mètre. Si je demande une correction, redonne le JSON complet. Je collerai ce JSON dans Calepineur.`;
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
