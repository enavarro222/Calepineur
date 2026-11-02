// Lecture d'une configuration venue d'une IA, collée ou reçue par lien. C'est toujours de la donnée :
// seuls les champs prévus sont repris, puis le projet obtenu repasse par la validation.
import { cm } from './format';
import { round1 } from './geom';
import { latticeFor } from './lattice';
import { isCalibUsable } from './photo';
import { parseProject } from './project';
import type { Design, Project, Wall } from './types';

const MAX_TILES_PER_WALL = 20000;
const OTHER_TILE_FIELDS = ['grout', 'edgeGap', 'waste', 'minPiece', 'perBox', 'm2PerBox'] as const;
const TILE_FIELDS = ['F', 'joint', 'orient', ...OTHER_TILE_FIELDS] as const;
const WALL_FIELDS = ['name', 'W', 'H', 'color', 'ox', 'oy', 'zoneMode', 'zone', 'obstacles', 'calib'] as const;
const DESIGN_FIELDS = ['name', 'color', 'colors', 'weight', 'crop'] as const;

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

function extractJson(text: string): Raw {
  const blocks = [...text.matchAll(/```[a-z]*\s*([\s\S]*?)```/gi)].map(m => m[1]!).filter(b => b.includes('{'));
  const longest = blocks.sort((a, b) => b.length - a.length)[0];
  const candidate = longest ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  let data: unknown;
  try {
    data = JSON.parse(candidate);
  } catch {
    throw new Error('aucun JSON valide dans ce texte. Demande à ton IA de redonner le bloc complet.');
  }
  if (!isObject(data)) throw new Error('aucun JSON valide dans ce texte.');
  return data;
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
    if (w.calib && !isCalibUsable(w.calib)) throw new Error(`« ${w.name} » : les 4 repères de calage ne doivent pas être alignés.`);
  }
}

function copyFields(target: object, source: Raw, fields: readonly string[]): void {
  for (const f of fields) if (f in source) (target as Raw)[f] = source[f];
}

function listOf(v: unknown, what: string): Raw[] {
  if (!Array.isArray(v) || !v.every(isObject)) throw new Error(`${what} : liste d'objets attendue.`);
  return v;
}

function newWall(item: Raw, project: Project): Wall {
  const g = latticeFor(project.tile);
  const gap = project.tile.edgeGap || 0;
  const W = Number(item.W);
  const H = Number(item.H);
  let n = project.walls.length + 1;
  while (project.walls.some(w => w.id === `mur-${n}`)) n++;
  return {
    id: item.id ? String(item.id) : `mur-${n}`, name: `Pan ${n}`, W, H, color: '#efe6d2',
    ox: round1(g.R + gap), oy: round1(g.F / 2 + gap), zoneMode: 'organic',
    zone: [[-10, -10], [-10, H + 10], [W + 10, H + 10], [W + 10, -10]],
    obstacles: [], photo: null, tiles: {},
  };
}

function patchWalls(draft: Project, items: Raw[]): void {
  for (const item of items) {
    const k = draft.walls.findIndex(w => w.id === item.id || (item.id == null && w.name === item.name));
    if (item.remove) {
      if (k >= 0) draft.walls.splice(k, 1);
      continue;
    }
    const wall = draft.walls[k] ?? newWall(item, draft);
    copyFields(wall, item, WALL_FIELDS);
    if (k < 0) draft.walls.push(wall);
  }
}

function patchDesigns(draft: Project, items: Raw[]): void {
  for (const item of items) {
    const k = draft.designs.findIndex(d => d.key === item.key);
    if (item.remove) {
      if (k >= 0) draft.designs.splice(k, 1);
      continue;
    }
    const design = draft.designs[k] ?? { key: String(item.key ?? ''), name: '', img: '', color: '#999999', weight: 1 };
    copyFields(design, item, DESIGN_FIELDS);
    if (k < 0) draft.designs.push(design);
  }
}

// Modification partielle : seuls les champs présents changent. Les images et les retouches sont hors de portée.
function applyPatch(current: Project, patch: Raw): Project {
  if (!['name', 'tile', 'rotMode', 'seed', 'designs', 'walls'].some(k => k in patch)) throw new Error('rien à modifier dans ce texte.');
  const draft = structuredClone(current);
  copyFields(draft, patch, ['name', 'rotMode', 'seed']);
  if (isObject(patch.tile)) copyFields(draft.tile, patch.tile, TILE_FIELDS);
  if ('designs' in patch) patchDesigns(draft, listOf(patch.designs, 'designs'));
  if ('walls' in patch) patchWalls(draft, listOf(patch.walls, 'walls'));
  return parseProject(draft);
}

function mergeWall(next: Wall, current: Wall | undefined): Wall {
  return current ? { ...next, photo: current.photo, tiles: current.tiles } : { ...next, photo: null, tiles: {} };
}

const mergeDesign = (next: Design, current: Design | undefined): Design =>
  ({ ...next, img: current?.name === next.name ? current.img : '' });

// L'IA ne voit ni les images ni les retouches : on garde celles des murs et des motifs qu'elle a conservés.
export function mergeAiProject(current: Project, next: Project): Project {
  return {
    ...next,
    designs: next.designs.map(d => mergeDesign(d, current.designs.find(c => c.key === d.key))),
    walls: next.walls.map(w => mergeWall(w, current.walls.find(c => c.id === w.id))),
  };
}

// Lit un projet complet ou une modification partielle, et renvoie le projet qui en résulte.
export function resolveConfig(current: Project, text: string): Project {
  const data = extractJson(text);
  const raw = isObject(data.state) ? data.state : data;
  const next = 'version' in raw ? mergeAiProject(current, parseProject(raw)) : applyPatch(current, raw);
  checkPlausible(next);
  return next;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function wallChanges(a: Wall, b: Wall): string | null {
  const parts: string[] = [];
  if (a.name !== b.name) parts.push(`renommé (avant : ${a.name})`);
  if (a.W !== b.W) parts.push(`largeur ${cm(b.W)} cm (avant : ${cm(a.W)})`);
  if (a.H !== b.H) parts.push(`hauteur ${cm(b.H)} cm (avant : ${cm(a.H)})`);
  if (!same(a.obstacles, b.obstacles)) parts.push(`éléments : ${b.obstacles.map(o => o.name).join(', ') || 'aucun'}`);
  if (!same(a.zone, b.zone) || a.zoneMode !== b.zoneMode) parts.push('zone à carreler modifiée');
  if (a.ox !== b.ox || a.oy !== b.oy) parts.push('grille déplacée');
  if (a.color !== b.color) parts.push('couleur du mur modifiée');
  if (b.calib && !same(a.calib, b.calib)) parts.push('calage photo proposé');
  return parts.length ? `${b.name} : ${parts.join(', ')}` : null;
}

function tileChanges(a: Project, b: Project): string[] {
  const lines: string[] = [];
  if (a.tile.F !== b.tile.F) lines.push(`Carreau de ${cm(b.tile.F)} cm (avant : ${cm(a.tile.F)})`);
  if (a.tile.joint !== b.tile.joint) lines.push(`Joint de ${cm(b.tile.joint * 10)} mm (avant : ${cm(a.tile.joint * 10)})`);
  if (a.tile.orient !== b.tile.orient) lines.push(b.tile.orient === 'flat' ? 'Carreaux pointes sur les côtés' : 'Carreaux pointes en haut');
  if (OTHER_TILE_FIELDS.some(f => a.tile[f] !== b.tile[f])) lines.push('Réglages du carreau modifiés');
  return lines;
}

function designChanges(a: Project, b: Project): string[] {
  const lines: string[] = [];
  for (const d of b.designs) {
    const old = a.designs.find(c => c.key === d.key);
    if (!old) lines.push(`Nouveau motif : ${d.key} ${d.name}`);
    else if (old.name !== d.name || old.color !== d.color || old.weight !== d.weight || String(old.colors) !== String(d.colors)) lines.push(`Motif ${d.key} modifié : ${d.name}`);
  }
  for (const d of a.designs) if (!b.designs.some(c => c.key === d.key)) lines.push(`Motif retiré : ${d.key} ${d.name}`);
  return lines;
}

export function describeChanges(a: Project, b: Project): string[] {
  const lines: string[] = [];
  if (a.name !== b.name) lines.push(`Projet : ${b.name}`);
  lines.push(...tileChanges(a, b), ...designChanges(a, b));
  if (a.rotMode !== b.rotMode || a.seed !== b.seed) lines.push('Répartition des motifs modifiée');
  const crops = b.designs.filter(d => d.crop && !same(d.crop, a.designs.find(c => c.key === d.key)?.crop)).length;
  if (crops) lines.push(`Découpe proposée pour ${crops} motif${crops > 1 ? 's' : ''}`);
  for (const w of b.walls) {
    const old = a.walls.find(c => c.id === w.id);
    const n = w.obstacles.length;
    if (!old) lines.push(`Nouveau pan : ${w.name}, ${cm(w.W)} × ${cm(w.H)} cm, ${n} élément${n > 1 ? 's' : ''}${w.calib ? ', calage photo proposé' : ''}`);
    else {
      const line = wallChanges(old, w);
      if (line) lines.push(line);
    }
  }
  for (const w of a.walls) if (!b.walls.some(c => c.id === w.id)) lines.push(`Pan retiré : ${w.name}`);
  return lines;
}
