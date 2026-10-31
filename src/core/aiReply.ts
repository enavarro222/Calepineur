// Lecture de la réponse d'une IA. Le texte collé n'est jamais que des données : il passe par la validation du projet.
import { cm } from './format';
import { parseProject } from './project';
import type { Design, Project, Wall } from './types';

const MAX_TILES_PER_WALL = 20000;

function extractJson(text: string): unknown {
  const blocks = [...text.matchAll(/```[a-z]*\s*([\s\S]*?)```/gi)].map(m => m[1]!).filter(b => b.includes('{'));
  const longest = blocks.sort((a, b) => b.length - a.length)[0];
  const candidate = longest ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error('aucun JSON valide dans ce texte. Demande à ton IA de redonner le bloc complet.');
  }
}

// Une IA peut se tromper d'unité ou oublier un champ : ces contrôles évitent de bloquer le navigateur.
function checkPlausible(p: Project): void {
  if (!p.walls.length) throw new Error('le projet ne contient aucun mur.');
  if (!p.designs.length) throw new Error('le projet ne contient aucun motif.');
  if (new Set(p.walls.map(w => w.id)).size !== p.walls.length) throw new Error('deux murs ont le même identifiant.');
  if (new Set(p.designs.map(d => d.key)).size !== p.designs.length) throw new Error('deux motifs ont la même clé.');
  for (const w of p.walls) {
    if (w.W <= 0 || w.H <= 0) throw new Error(`« ${w.name} » n'a pas de dimensions valides.`);
    if (w.W * w.H / p.tile.F ** 2 > MAX_TILES_PER_WALL) throw new Error(`« ${w.name} » demanderait trop de carreaux. Vérifie que tout est en cm.`);
  }
}

export function parseAiReply(text: string): Project {
  const data = extractJson(text);
  const raw = typeof data === 'object' && data !== null && 'state' in data ? data.state : data;
  const project = parseProject(raw);
  checkPlausible(project);
  return project;
}

function mergeWall(next: Wall, current: Wall | undefined): Wall {
  if (!current) return next;
  return {
    ...next,
    photo: next.photo ?? current.photo,
    tiles: Object.keys(next.tiles).length ? next.tiles : current.tiles,
  };
}

const mergeDesign = (next: Design, current: Design | undefined): Design =>
  (current && !next.img && current.name === next.name ? { ...next, img: current.img } : next);

// L'IA ne voit ni les images ni les retouches : on garde celles des murs et des motifs qu'elle a conservés.
export function mergeAiProject(current: Project, next: Project): Project {
  return {
    ...next,
    designs: next.designs.map(d => mergeDesign(d, current.designs.find(c => c.key === d.key))),
    walls: next.walls.map(w => mergeWall(w, current.walls.find(c => c.id === w.id))),
  };
}

export function summarizeProject(p: Project): string[] {
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
  return [
    ...p.walls.map(w => `${w.name} : ${cm(w.W)} × ${cm(w.H)} cm, ${plural(w.obstacles.length, 'élément')}`),
    `Carreau de ${cm(p.tile.F)} cm, joint de ${cm(p.tile.joint * 10)} mm`,
    `${plural(p.designs.length, 'motif')} : ${p.designs.map(d => d.name).join(', ')}`,
  ];
}
