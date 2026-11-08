// Défauts d'une répartition. Une seule définition sert partout : la note et les défauts surlignés, la recherche
// d'Harmoniser, Mélanger, le remplissage des nouveaux carreaux et Remplacer. Ce qui coûte est exactement ce qui se
// voit : chaque défaut vaut ses points, et rien d'autre ne compte, hormis la zone visée par un style de couleur.
//
// Chaque règle ne regarde que deux ou trois carreaux proches, ou un carreau et ceux qui l'entourent à deux pas :
// changer un motif ne remet en cause que les défauts qui le touchent, ce qui garde les recherches rapides.
import type { WallComp } from './compute';
import { unfold } from './layout';
import { colorAffinity } from './palette';
import type { HarmonyStyle, Point, Project } from './types';

export type DefectType = 'adjacent' | 'gap' | 'line' | 'pattern' | 'clump' | 'tone' | 'clash';

// Une colonne d'écart, un amas ou deux voisins sans couleur commune pèsent peu : avec peu de motifs, on ne peut pas
// tous les éviter.
export const DEFECT_POINTS: Record<DefectType, number> = { adjacent: 3, gap: 0.5, line: 1, pattern: 0.25, clump: 0.25, tone: 0.25, clash: 0.25 };

export interface TileRef {
  wall: number;
  key: string;
}

// Un défaut peut passer l'angle entre deux pans : chaque carreau dit à quel pan il appartient.
export interface Defect {
  type: DefectType;
  cells: TileRef[];
}

// Ce qu'un pan montre d'un défaut : ses propres carreaux.
export interface WallDefect {
  type: DefectType;
  keys: string[];
}

export function defectsOnWall(defects: Defect[], wall: number): WallDefect[] {
  return defects.flatMap(d => {
    const keys = d.cells.filter(c => c.wall === wall).map(c => c.key);
    return keys.length ? [{ type: d.type, keys }] : [];
  });
}

const SQ3 = Math.sqrt(3);
const VISIBLE_FRAC = 0.2; // en dessous, le morceau se voit trop peu pour compter
const SPLIT_TILE = 0.5; // en distance entre voisins : en dessous, deux morceaux d'un même emplacement
const SPOT_TOLERANCE = 0.2;
const RING2_RADIUS = 2.1; // autour d'un carreau, à deux pas
const PATTERN_RADIUS = 3.1; // pas le plus long d'une répétition régulière
const AXIS_STEPS = [1, SQ3, 2]; // pas d'un alignement : côte à côte, une colonne entre, un carreau entre
const CLUMP_MIN = 4; // carreaux d'un même motif, celui du centre compris, pour faire un amas
const CLUMP_RATIO = 1.8; // … et nettement plus que sa part
const TONE_MIN_SPREAD = 0.05;
const TONE_Z = 0.6; // en écarts à la moyenne : au-delà, un motif est franchement clair ou sombre
const CLASH_MAX = 0.2; // parenté sous laquelle deux voisins n'ont pas de couleur commune

export interface Cell {
  wall: number;
  key: string;
  c: Point;
  u: Point; // position dans la suite de pans reliés par un angle, dépliée à plat
  run: number;
  gx: number; // abscisse le long de la suite des pans
  frac: number;
  visible: boolean;
  locked: boolean;
  design: number; // -1 : pas encore de motif
}

// Carreaux qui peuvent former un défaut ensemble :
//  near : deux voisins directs (identiques, ou sans couleur commune dans un style de couleur)
//  gap : deux carreaux sur une même rangée, une colonne entre
//  axis : trois carreaux alignés à pas de 1, √3 ou 2
//  step : trois carreaux à un autre pas constant, jusqu'à 3,1
//  patch : quatre voisins serrés en losange, pour les taches de teinte
//  run : quatre voisins en ligne droite, pour les lignes de teinte
interface Group {
  kind: 'near' | 'gap' | 'axis' | 'step' | 'patch' | 'run';
  cells: number[];
}

export interface Model {
  cells: Cell[];
  designs: number[]; // motif actuel de chaque carreau
  colorful: boolean; // style de couleur : voisins sans couleur commune comptés, taches et amas voulus
  groups: Group[];
  groupsOf: number[][];
  ring1: number[][];
  ring2: number[][];
  side: number[]; // -1 sombre, 1 clair, 0 entre les deux, pour chaque motif
  share: number[]; // part de chaque motif parmi les carreaux
  affinity: number[][]; // parenté de couleur entre motifs
  step: number; // distance entre carreaux voisins
  gMark: Int32Array;
  cMark: Int32Array;
  tick: number;
}

export function colorTone(color: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return 0.5;
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map(h => parseInt(h, 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Clair ou sombre par rapport à la moyenne des carreaux posés ; rien si tous les motifs se ressemblent.
function toneSides(project: Project, cells: Cell[]): number[] {
  const tones = project.designs.map(d => colorTone(d.color));
  const placed = cells.filter(c => c.design >= 0).map(c => tones[c.design]!);
  if (!placed.length) return tones.map(() => 0);
  const mean = placed.reduce((a, b) => a + b, 0) / placed.length;
  const spread = Math.sqrt(placed.reduce((a, b) => a + (b - mean) ** 2, 0) / placed.length);
  return tones.map(t => {
    const z = spread < TONE_MIN_SPREAD ? 0 : (t - mean) / spread;
    return z > TONE_Z ? 1 : z < -TONE_Z ? -1 : 0;
  });
}

// Part de chaque motif : celle des carreaux posés, ou celle des poids tant que rien n'est posé.
function designShares(project: Project, cells: Cell[]): number[] {
  const count = project.designs.map(() => 0);
  for (const c of cells) if (c.design >= 0) count[c.design]!++;
  const placed = count.reduce((a, b) => a + b, 0);
  if (placed) return count.map(n => n / placed);
  const w = project.designs.map(d => Math.max(0, d.weight));
  const total = w.reduce((a, b) => a + b, 0) || 1;
  return w.map(x => x / total);
}

function buildCells(project: Project, comps: WallComp[]): Cell[] {
  const index = new Map(project.designs.map((d, i) => [d.key, i]));
  const places = unfold(project.walls);
  let offset = 0;
  return project.walls.flatMap((w, wall) => {
    const x0 = offset;
    offset += w.W;
    const { run, x0: ux, y0: uy } = places[wall]!;
    return comps[wall]!.tiles.map((t): Cell => {
      const a = w.tiles[t.key];
      return {
        wall, key: t.key, c: t.c, u: [ux + t.c[0], uy + t.c[1]], run, gx: x0 + t.c[0], frac: t.frac,
        visible: t.frac >= VISIBLE_FRAC, locked: !!a?.lk, design: index.get(a?.d ?? '') ?? -1,
      };
    });
  });
}

// Retrouve le carreau posé à un endroit de la suite dépliée, même de l'autre côté d'un angle.
function spotFinder(runCells: number[], cells: Cell[], d: number): (x: number, y: number) => number | undefined {
  const q = d / 2;
  const grid = new Map<string, number[]>();
  for (const i of runCells) {
    const k = `${Math.round(cells[i]!.u[0] / q)},${Math.round(cells[i]!.u[1] / q)}`;
    grid.set(k, [...(grid.get(k) ?? []), i]);
  }
  return (x, y) => {
    const gx = Math.round(x / q);
    const gy = Math.round(y / q);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const hit = grid.get(`${gx + dx},${gy + dy}`)?.find(i => Math.hypot(cells[i]!.u[0] - x, cells[i]!.u[1] - y) < SPOT_TOLERANCE * d);
        if (hit !== undefined) return hit;
      }
    }
    return undefined;
  };
}

// Trois carreaux à pas constant : c'est ce que l'œil lit comme une ligne, ou comme une trame quand elle se répète.
function addLines(runCells: number[], cells: Cell[], d: number, groups: Group[]): void {
  const spot = spotFinder(runCells, cells, d);
  for (const a of runCells) {
    const ca = cells[a]!;
    for (const b of runCells) {
      const cb = cells[b]!;
      const vx = cb.u[0] - ca.u[0];
      const vy = cb.u[1] - ca.u[1];
      const step = Math.hypot(vx, vy) / d;
      if (a === b || step < SPLIT_TILE || step > PATTERN_RADIUS || vx < -1e-6 || (Math.abs(vx) < 1e-6 && vy < 0)) continue;
      const c = spot(cb.u[0] + vx, cb.u[1] + vy);
      if (c === undefined || c === a || c === b) continue;
      const axis = AXIS_STEPS.some(k => Math.abs(step - k) < 0.01);
      groups.push({ kind: axis ? 'axis' : 'step', cells: [a, b, c] });
      const next = Math.abs(step - 1) < 0.01 ? spot(cells[c]!.u[0] + vx, cells[c]!.u[1] + vy) : undefined;
      if (next !== undefined && next !== a && next !== b && next !== c) groups.push({ kind: 'run', cells: [a, b, c, next] });
    }
  }
}

export function buildModel(project: Project, comps: WallComp[], style: HarmonyStyle): Model {
  const cells = buildCells(project, comps);
  const g = comps[0]?.g;
  const d = g?.d ?? 1;
  const groups: Group[] = [];
  const ring1: number[][] = cells.map(() => []);
  const ring2: number[][] = cells.map(() => []);

  // Les voisinages suivent la suite dépliée des pans : deux carreaux de part et d'autre d'un angle sont voisins.
  const runs = new Map<number, number[]>();
  cells.forEach((c, i) => runs.set(c.run, [...(runs.get(c.run) ?? []), i]));
  for (const runCells of runs.values()) {
    for (let x = 0; x < runCells.length; x++) {
      for (let y = x + 1; y < runCells.length; y++) {
        const a = runCells[x]!;
        const b = runCells[y]!;
        const ca = cells[a]!;
        const cb = cells[b]!;
        const dist = Math.hypot(ca.u[0] - cb.u[0], ca.u[1] - cb.u[1]) / d;
        // deux morceaux du même emplacement, coupé par l'angle : ce sont deux coupes, pas deux voisins
        if (dist > RING2_RADIUS || dist < SPLIT_TILE) continue;
        ring2[a]!.push(b);
        ring2[b]!.push(a);
        if (dist < 1.1) {
          ring1[a]!.push(b);
          ring1[b]!.push(a);
          groups.push({ kind: 'near', cells: [a, b] });
        } else if (Math.abs(dist - SQ3) < 0.1 && g?.isRow(ca.u[0] - cb.u[0], ca.u[1] - cb.u[1])) {
          groups.push({ kind: 'gap', cells: [a, b] });
        }
      }
    }
    addLines(runCells, cells, d, groups);
  }
  // losange : deux voisins et les deux carreaux qui les touchent tous les deux
  ring1.forEach((ns, b) => {
    for (const c of ns) {
      if (c < b) continue;
      const both = ns.filter(x => ring1[c]!.includes(x));
      if (both.length === 2) groups.push({ kind: 'patch', cells: [both[0]!, b, c, both[1]!] });
    }
  });

  const groupsOf: number[][] = cells.map(() => []);
  groups.forEach((x, i) => { for (const c of x.cells) groupsOf[c]!.push(i); });
  return {
    cells, designs: cells.map(c => c.design), colorful: style !== 'natural', groups, groupsOf, ring1, ring2,
    side: toneSides(project, cells), share: designShares(project, cells), affinity: colorAffinity(project.designs), step: d,
    gMark: new Int32Array(groups.length), cMark: new Int32Array(cells.length), tick: 0,
  };
}

const shows = (m: Model, d: number[], i: number): boolean => d[i]! >= 0 && m.cells[i]!.visible;

// Les motifs d'abord : la plupart des groupes n'ont rien en commun, et sont écartés dès la première comparaison.
function groupDefect(m: Model, g: Group, d: number[]): DefectType | null {
  const cs = g.cells;
  const da = d[cs[0]!]!;
  if (da < 0) return null;
  let type: DefectType | null;
  switch (g.kind) {
    case 'near': {
      const db = d[cs[1]!]!;
      type = da === db ? 'adjacent' : m.colorful && db >= 0 && m.affinity[da]![db]! < CLASH_MAX ? 'clash' : null;
      break;
    }
    case 'gap':
      type = da === d[cs[1]!] ? 'gap' : null;
      break;
    case 'axis':
    case 'step':
      type = da === d[cs[1]!] && da === d[cs[2]!] ? (g.kind === 'axis' ? 'line' : 'pattern') : null;
      break;
    default: {
      // dans les styles de couleur, les taches de teinte sont voulues
      const s = m.side[da]!;
      type = 'tone';
      if (m.colorful || !s) return null;
      for (let k = 1; k < cs.length; k++) {
        const x = d[cs[k]!]!;
        if (x < 0 || m.side[x] !== s) return null;
      }
    }
  }
  if (!type) return null;
  for (let k = 0; k < cs.length; k++) if (!m.cells[cs[k]!]!.visible) return null;
  return type;
}

// Amas : autour d'un carreau, à deux pas, nettement plus de carreaux de son motif que sa part ne le voudrait.
// Dans les styles de couleur, les amas sont voulus.
function isClump(m: Model, d: number[], i: number): boolean {
  if (m.colorful || !shows(m, d, i)) return false;
  const di = d[i]!;
  const ring = m.ring2[i]!;
  let same = 1;
  for (const n of ring) if (d[n] === di && m.cells[n]!.visible) same++;
  return same >= Math.max(CLUMP_MIN, CLUMP_RATIO * (ring.length + 1) * m.share[di]!);
}

// Un amas touche x s'il est centré sur x, ou sur un carreau proche du même motif : seuls les amas des motifs en jeu
// (a, b) peuvent changer quand x change de motif.
function aroundPoints(m: Model, d: number[], x: number, t: number, a: number, b: number): number {
  let e = 0;
  for (const k of m.groupsOf[x]!) {
    if (m.gMark[k] === t) continue;
    m.gMark[k] = t;
    const type = groupDefect(m, m.groups[k]!, d);
    if (type) e += DEFECT_POINTS[type];
  }
  if (m.colorful) return e;
  if (m.cMark[x] !== t) {
    m.cMark[x] = t;
    if (isClump(m, d, x)) e += DEFECT_POINTS.clump;
  }
  for (const c of m.ring2[x]!) {
    if (m.cMark[c] === t || (d[c] !== a && d[c] !== b)) continue;
    m.cMark[c] = t;
    if (isClump(m, d, c)) e += DEFECT_POINTS.clump;
  }
  return e;
}

// Points des défauts qui touchent i, et j s'il est donné : ce qu'un échange ou un nouveau motif peut changer. Pour un
// échange, les mêmes défauts sont comptés avant et après : la différence est exactement celle de la note.
export function localPoints(m: Model, d: number[], i: number, j = -1): number {
  const t = ++m.tick;
  const a = d[i]!;
  const b = j >= 0 ? d[j]! : a;
  return aroundPoints(m, d, i, t, a, b) + (j >= 0 ? aroundPoints(m, d, j, t, a, b) : 0);
}

export function findDefects(m: Model, d: number[]): Defect[] {
  const ref = (i: number): TileRef => ({ wall: m.cells[i]!.wall, key: m.cells[i]!.key });
  const defects: Defect[] = [];
  for (const g of m.groups) {
    const type = groupDefect(m, g, d);
    if (type) defects.push({ type, cells: g.cells.map(ref) });
  }
  m.cells.forEach((_, i) => {
    if (isClump(m, d, i)) defects.push({ type: 'clump', cells: [i, ...m.ring2[i]!.filter(n => d[n] === d[i] && m.cells[n]!.visible)].map(ref) });
  });
  return defects;
}
