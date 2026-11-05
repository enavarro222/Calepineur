// Harmonie d'une répartition : un score pour voir les défauts, et une recherche par échanges pour les réduire.
// Échanger deux carreaux d'un même pan garde les quantités exactes, au total comme par pan.
//
// Le but est un aspect naturel, pas un écartement maximal : sur un réseau hexagonal, écarter au mieux les motifs
// identiques ou alterner clair et sombre mène à un pavage périodique, qui saute aux yeux. Le coût ne récompense donc
// jamais la régularité. Il pénalise les défauts et toute répétition à pas constant, et s'annule une fois ceux-ci
// évités : la recherche continue alors au hasard parmi les solutions sans défaut.
//
// Les styles « vagues » et « dégradé » jouent avec les couleurs : des voisins qui partagent une couleur, et chaque
// motif attiré vers une zone selon sa place dans la chaîne des couleurs. La zone visée est une cible lisse
// (ondulations ou pente) ramenée en rangs, pour que chaque motif y trouve exactement sa part. Les échanges se font
// alors entre pans : le total commandé ne change pas, la part de chaque pan oui.
import { produce } from 'immer';
import type { WallComp } from './compute';
import { hashStr, mulberry32 } from './geom';
import { unfold } from './layout';
import { colorAffinity, colorChain } from './palette';
import type { HarmonyStyle, Point, Project } from './types';

export type DefectType = 'adjacent' | 'gap' | 'line' | 'pattern' | 'clump' | 'tone' | 'clash';

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

export interface HarmonyReport {
  score: number; // de 0 à 100
  counts: Record<DefectType, number>;
  defects: Defect[];
}

export type Assignment = Record<number, Record<string, string>>; // pan → emplacement → motif

interface Cell {
  wall: number;
  key: string;
  c: Point;
  u: Point; // position dans la suite de pans reliés par un angle, dépliée à plat
  run: number;
  gx: number; // abscisse le long de la suite des pans
  frac: number;
  locked: boolean;
  design: number;
}

interface Pair {
  a: number;
  b: number;
  same: number; // coût si les deux carreaux ont le même motif
  tone: number; // coût si leurs teintes s'écartent de la moyenne du même côté
  adjacent: boolean;
  gap: boolean; // à une colonne d'écart
}

// Trois carreaux à pas constant : c'est ce que l'œil lit comme une ligne, ou comme une trame quand elle se répète.
interface Line {
  a: number;
  b: number;
  c: number;
  same: number; // coût si les trois ont le même motif
  tone: number; // coût si les trois sont du même côté de la teinte moyenne
  axis: boolean; // ligne droite de carreaux proches
  shown: boolean; // assez courte pour être signalée comme défaut
}

interface Model {
  cells: Cell[];
  pairs: Pair[];
  lines: Line[];
  ring1: number[][];
  ring2: number[][];
  toneZ: number[]; // teinte de chaque motif, en écarts à la moyenne des carreaux posés
  pairsOf: number[][];
  linesOf: number[][];
  style: HarmonyStyle;
  affinity: number[][]; // parenté de couleur entre motifs
  chain: number[]; // motifs du plus sombre au plus clair
  rank: number[]; // place de chaque motif dans la chaîne des couleurs, de 0 (sombre) à 1 (clair)
  step: number; // distance entre carreaux voisins
}

const ADJACENT_COST = 12;
const NEAR_COST = 0.5;
// Deux motifs identiques à une colonne d'écart (√3 pas : même rangée en flat) se lisent comme une paire alignée.
// Plus fort, il pousserait vers un pavage régulier ; les styles de couleur gardent leur réglage.
const ONE_COLUMN_COST = 1;
const SQ3 = Math.sqrt(3);
const TONE_COST = 0.35;
const LINE_COST = 4;
const PATTERN_COST = 3;
const TONE_LINE_COST = 0.35;
const PATTERN_RADIUS = 4.4; // pas le plus long pris en compte, en distance entre carreaux voisins
const PATTERN_SHOWN = 3.1;
const TONE_LINE_RADIUS = 2.1;
const AXIS_STEPS = [1, Math.sqrt(3), 2];
const RING2_RADIUS = 2.1; // en distance entre carreaux voisins
const FULL_RING1 = 6;
const SPLIT_TILE = 0.5; // en distance entre voisins : en dessous, deux morceaux d'un même emplacement
const SPOT_TOLERANCE = 0.2;
const VISIBLE_FRAC = 0.2; // en dessous, le morceau se voit trop peu pour compter comme défaut
const TONE_MIN_SPREAD = 0.05;
const TONE_Z = 0.6;
const TONE_PATCH = 4;
const TONE_RUN = 4;
const CLUMP_MIN = 4;
const SAME_BOOST = 8; // avec une cible de couleur, deux voisins identiques deviennent tentants : on les interdit plus fort
const COLOR_COST = 4;
const TARGET_COST = 22;
const CLASH_MAX = 0.2; // parenté sous laquelle deux voisins n'ont pas de couleur commune
const WAVES = 6;
// Une colonne d'écart pèse peu : avec peu de motifs, on ne peut pas toutes les éviter.
const DEFECT_POINTS: Record<DefectType, number> = { adjacent: 3, gap: 0.5, line: 2, pattern: 1, clump: 1, tone: 1, clash: 0.25 };
const SCORE_SLOPE = 3;
const PROPOSALS = 4;

export function colorTone(color: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return 0.5;
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map(h => parseInt(h, 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toneScores(project: Project, cells: Cell[]): number[] {
  const tones = project.designs.map(d => colorTone(d.color));
  const placed = cells.filter(c => c.design >= 0).map(c => tones[c.design]!);
  if (!placed.length) return tones.map(() => 0);
  const mean = placed.reduce((a, b) => a + b, 0) / placed.length;
  const spread = Math.sqrt(placed.reduce((a, b) => a + (b - mean) ** 2, 0) / placed.length);
  return tones.map(t => (spread < TONE_MIN_SPREAD ? 0 : (t - mean) / spread));
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
        locked: !!a?.lk, design: index.get(a?.d ?? '') ?? -1,
      };
    });
  });
}

// Place de chaque motif le long de la chaîne des couleurs, au milieu de sa part des carreaux posés.
function chainRanks(project: Project, cells: Cell[], chain: number[]): number[] {
  const count = project.designs.map(() => 0);
  for (const c of cells) if (c.design >= 0) count[c.design]!++;
  const total = Math.max(1, count.reduce((a, b) => a + b, 0));
  const rank = project.designs.map(() => 0);
  let done = 0;
  for (const d of chain) {
    rank[d] = (done + count[d]! / 2) / total;
    done += count[d]!;
  }
  return rank;
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

function buildLines(runCells: number[], cells: Cell[], d: number, lines: Line[]): void {
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
      const f = Math.min(ca.frac, cb.frac, cells[c]!.frac);
      const axis = AXIS_STEPS.some(k => Math.abs(step - k) < 0.01);
      lines.push({
        a, b, c, axis,
        same: f * (axis ? LINE_COST : PATTERN_COST / step),
        tone: step <= TONE_LINE_RADIUS ? TONE_LINE_COST : 0,
        shown: step <= PATTERN_SHOWN,
      });
    }
  }
}

function buildModel(project: Project, comps: WallComp[], style: HarmonyStyle): Model {
  const cells = buildCells(project, comps);
  const affinity = colorAffinity(project.designs);
  const chain = colorChain(project.designs);
  const toneZ = toneScores(project, cells);
  const pairs: Pair[] = [];
  const lines: Line[] = [];
  const ring1: number[][] = cells.map(() => []);
  const ring2: number[][] = cells.map(() => []);

  // Les voisinages suivent la suite dépliée des pans : deux carreaux de part et d'autre d'un angle sont voisins.
  const d = comps[0]?.g.d ?? 1;
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
        const f = Math.min(ca.frac, cb.frac);
        const near = 1 / dist ** 2;
        const gap = Math.abs(dist - SQ3) < 0.1;
        const same = dist < 1.1 ? ADJACENT_COST : gap && style === 'natural' ? ONE_COLUMN_COST : NEAR_COST * near;
        pairs.push({ a, b, same: f * same, tone: TONE_COST * near, adjacent: dist < 1.1, gap });
        ring2[a]!.push(b);
        ring2[b]!.push(a);
        if (dist < 1.1) {
          ring1[a]!.push(b);
          ring1[b]!.push(a);
        }
      }
    }
    buildLines(runCells, cells, d, lines);
  }

  const pairsOf: number[][] = cells.map(() => []);
  pairs.forEach((p, i) => { pairsOf[p.a]!.push(i); pairsOf[p.b]!.push(i); });
  const linesOf: number[][] = cells.map(() => []);
  lines.forEach((l, i) => { linesOf[l.a]!.push(i); linesOf[l.b]!.push(i); linesOf[l.c]!.push(i); });
  return { cells, pairs, lines, ring1, ring2, toneZ, pairsOf, linesOf, style, affinity, chain, rank: chainRanks(project, cells, chain), step: d };
}

// ---- rapport ----
const isVisible = (c: Cell): boolean => c.frac >= VISIBLE_FRAC && c.design >= 0;
const ref = (c: Cell): TileRef => ({ wall: c.wall, key: c.key });

function clumpDefects(m: Model, project: Project): Defect[] {
  const total = project.designs.map(() => 0);
  for (const c of m.cells) if (c.design >= 0) total[c.design]!++;
  const seen = new Set<number>();
  const found = m.cells
    .map((c, i) => ({ i, same: m.ring2[i]!.filter(j => m.cells[j]!.design === c.design && isVisible(m.cells[j]!)) }))
    .filter(({ i }) => isVisible(m.cells[i]!))
    .sort((a, b) => b.same.length - a.same.length);
  const defects: Defect[] = [];
  for (const { i, same } of found) {
    const c = m.cells[i]!;
    const around = m.ring2[i]!.length + 1;
    const expected = around * total[c.design]! / m.cells.length;
    if (same.length + 1 < Math.max(CLUMP_MIN, 1.8 * expected) || seen.has(i)) continue;
    const group = [i, ...same];
    group.forEach(g => seen.add(g));
    defects.push({ type: 'clump', cells: group.map(g => ref(m.cells[g]!)) });
  }
  return defects;
}

const sideOf = (z: number): number => (z > TONE_Z ? 1 : z < -TONE_Z ? -1 : 0);

function toneRuns(m: Model, side: (i: number) => number): Defect[] {
  const next = new Map(m.lines.filter(l => l.tone > 0).map(l => [`${l.a},${l.b}`, l]));
  const hasBefore = new Set(m.lines.filter(l => l.tone > 0).map(l => `${l.b},${l.c}`));
  const defects: Defect[] = [];
  for (const l of next.values()) {
    const s = side(l.a);
    if (!s || side(l.b) !== s || side(l.c) !== s) continue;
    if (hasBefore.has(`${l.a},${l.b}`)) {
      const before = m.lines.find(x => x.b === l.a && x.c === l.b);
      if (before && side(before.a) === s) continue;
    }
    const run = [l.a, l.b, l.c];
    for (let n = next.get(`${l.b},${l.c}`); n && side(n.c) === s; n = next.get(`${n.b},${n.c}`)) run.push(n.c);
    if (run.length >= TONE_RUN) defects.push({ type: 'tone', cells: run.map(i => ref(m.cells[i]!)) });
  }
  return defects;
}

function toneDefects(m: Model): Defect[] {
  const defects: Defect[] = [];
  const side = (i: number): number => {
    const c = m.cells[i]!;
    return isVisible(c) ? sideOf(m.toneZ[c.design]!) : 0;
  };
  const seen = new Set<number>();
  m.cells.forEach((_, start) => {
    const s = side(start);
    if (!s || seen.has(start)) return;
    const patch = [start];
    seen.add(start);
    for (let k = 0; k < patch.length; k++) {
      for (const n of m.ring1[patch[k]!]!) {
        if (side(n) === s && !seen.has(n)) {
          seen.add(n);
          patch.push(n);
        }
      }
    }
    if (patch.length >= TONE_PATCH) defects.push({ type: 'tone', cells: patch.map(i => ref(m.cells[i]!)) });
  });
  return [...defects, ...toneRuns(m, side)];
}

function clashDefects(m: Model): Defect[] {
  const defects: Defect[] = [];
  m.ring1.forEach((ns, a) => {
    for (const b of ns) {
      const ca = m.cells[a]!;
      const cb = m.cells[b]!;
      if (a < b && ca.design !== cb.design && isVisible(ca) && isVisible(cb) && m.affinity[ca.design]![cb.design]! < CLASH_MAX) {
        defects.push({ type: 'clash', cells: [ref(ca), ref(cb)] });
      }
    }
  });
  return defects;
}

function report(m: Model, project: Project): HarmonyReport {
  const cells = m.cells;
  const defects: Defect[] = [];
  m.ring1.forEach((ns, a) => {
    for (const b of ns) {
      const ca = cells[a]!;
      const cb = cells[b]!;
      if (a < b && ca.design === cb.design && isVisible(ca) && isVisible(cb)) defects.push({ type: 'adjacent', cells: [ref(ca), ref(cb)] });
    }
  });
  for (const p of m.pairs) {
    const [ca, cb] = [cells[p.a]!, cells[p.b]!];
    if (p.gap && ca.design === cb.design && isVisible(ca) && isVisible(cb)) defects.push({ type: 'gap', cells: [ref(ca), ref(cb)] });
  }
  for (const l of m.lines) {
    const [a, b, c] = [cells[l.a]!, cells[l.b]!, cells[l.c]!];
    if (l.shown && a.design === b.design && b.design === c.design && isVisible(a) && isVisible(b) && isVisible(c)) {
      defects.push({ type: l.axis ? 'line' : 'pattern', cells: [ref(a), ref(b), ref(c)] });
    }
  }
  // Dans les styles de couleur, les taches de teinte et les amas sont voulus ; on signale plutôt les voisins sans
  // couleur commune.
  if (m.style === 'natural') defects.push(...clumpDefects(m, project), ...toneDefects(m));
  else defects.push(...clashDefects(m));
  const counts: Record<DefectType, number> = { adjacent: 0, gap: 0, line: 0, pattern: 0, clump: 0, tone: 0, clash: 0 };
  let points = 0;
  for (const d of defects) {
    counts[d.type]++;
    points += DEFECT_POINTS[d.type];
  }
  const score = cells.length ? Math.round(100 * Math.exp(-SCORE_SLOPE * points / cells.length)) : 100;
  return { score, counts, defects };
}

export function harmonyReport(project: Project, comps: WallComp[]): HarmonyReport {
  return report(buildModel(project, comps, project.style ?? 'natural'), project);
}

// ---- recherche par échanges ----
const pairCost = (m: Model, p: Pair, d: number[]): number => {
  const a = d[p.a]!;
  const b = d[p.b]!;
  if (a < 0 || b < 0) return 0;
  if (m.style !== 'natural') return a === b ? p.same * SAME_BOOST : p.adjacent ? COLOR_COST * (1 - m.affinity[a]![b]!) : 0;
  // Jamais de bonus pour un clair à côté d'un sombre : cela produirait un damier.
  return (a === b ? p.same : 0) + p.tone * Math.max(0, m.toneZ[a]! * m.toneZ[b]!);
};

function lineCost(m: Model, l: Line, d: number[]): number {
  const [a, b, c] = [d[l.a]!, d[l.b]!, d[l.c]!];
  if (a < 0 || b < 0 || c < 0) return 0;
  if (a === b && b === c) return l.same;
  if (m.style !== 'natural') return 0;
  const s = sideOf(m.toneZ[a]!);
  return s && s === sideOf(m.toneZ[b]!) && s === sideOf(m.toneZ[c]!) ? l.tone : 0;
}

function costAround(m: Model, i: number, j: number, d: number[], target: number[] | null): number {
  let e = target ? TARGET_COST * ((m.rank[d[i]!]! - target[i]!) ** 2 + (m.rank[d[j]!]! - target[j]!) ** 2) : 0;
  for (const k of m.pairsOf[i]!) e += pairCost(m, m.pairs[k]!, d);
  for (const k of m.pairsOf[j]!) {
    const p = m.pairs[k]!;
    if (p.a !== i && p.b !== i) e += pairCost(m, p, d);
  }
  for (const k of m.linesOf[i]!) e += lineCost(m, m.lines[k]!, d);
  for (const k of m.linesOf[j]!) {
    const l = m.lines[k]!;
    if (l.a !== i && l.b !== i && l.c !== i) e += lineCost(m, l, d);
  }
  return e;
}

// Un carreau de bord a moins de voisins, donc moins de contraintes : sans cette règle, les teintes marquées
// migreraient vers le pourtour et laisseraient le centre pâle. Le mélange de départ a déjà le bon équilibre.
function shiftsTone(m: Model, i: number, j: number, d: number[]): boolean {
  return m.ring1[i]!.length < FULL_RING1 !== m.ring1[j]!.length < FULL_RING1
    && sideOf(m.toneZ[d[i]!]!) !== sideOf(m.toneZ[d[j]!]!);
}

// Cible lisse, ramenée en rangs de 0 à 1 : chaque motif y trouve une bande à la mesure de sa quantité.
function styleTarget(m: Model, k: number, seed: string): number[] | null {
  if (m.style === 'natural' || !m.cells.length) return null;
  const rng = mulberry32(hashStr(`${seed}:cible`));
  const ys = m.cells.map(c => c.c[1]);
  const span = Math.max(1, Math.max(...m.cells.map(c => c.gx)) - Math.min(...m.cells.map(c => c.gx)), Math.max(...ys) - Math.min(...ys));
  let raw: number[];
  if (m.style === 'gradient') {
    const dir = GRADIENT_DIRECTIONS[k % GRADIENT_DIRECTIONS.length]!;
    raw = m.cells.map(c => dir.x * c.gx + dir.y * c.c[1] + (rng() - 0.5) * span * 0.04);
  } else {
    const waves = Array.from({ length: WAVES }, () => {
      const len = m.step * (6 + rng() * 10); // une ondulation tous les 6 à 16 carreaux
      const th = (rng() - 0.5) * 1.1;
      return { kx: 2 * Math.PI * Math.cos(th) / len, ky: 2 * Math.PI * Math.sin(th) / len, ph: rng() * 2 * Math.PI, a: len };
    });
    raw = m.cells.map(c => waves.reduce((s, w) => s + w.a * Math.sin(w.kx * c.gx + w.ky * c.c[1] + w.ph), 0));
  }
  const order = raw.map((_, i) => i).sort((a, b) => raw[a]! - raw[b]!);
  const target = new Array<number>(raw.length);
  order.forEach((i, r) => { target[i] = order.length > 1 ? r / (order.length - 1) : 0.5; });
  return target;
}

const GRADIENT_DIRECTIONS = [
  { x: 1, y: 0, label: (a: string, b: string) => `${a} à gauche, ${b} à droite` },
  { x: -1, y: 0, label: (a: string, b: string) => `${b} à gauche, ${a} à droite` },
  { x: 0, y: 1, label: (a: string, b: string) => `${a} en bas, ${b} en haut` },
  { x: 1, y: 1.5, label: (a: string, b: string) => `En diagonale : ${a} en bas à gauche, ${b} en haut à droite` },
];

function search(m: Model, seed: string, target: number[] | null): number[] {
  const rng = mulberry32(hashStr(seed));
  const d = m.cells.map(c => c.design);
  const colorful = m.style !== 'natural';
  const byWall = new Map<number, number[]>();
  m.cells.forEach((c, i) => {
    const group = colorful ? 0 : c.wall;
    if (!c.locked && c.design >= 0) byWall.set(group, [...(byWall.get(group) ?? []), i]);
  });
  const movable = [...byWall.values()].filter(cells => cells.length > 1).flat();
  if (!movable.length) return d;
  const steps = colorful ? Math.min(90000, movable.length * 700) : Math.min(40000, movable.length * 300);
  const startT = colorful ? 4 : 3;
  const endT = colorful ? 0.05 : 0.08;
  for (let s = 0; s < steps; s++) {
    const i = movable[Math.floor(rng() * movable.length)]!;
    const mates = byWall.get(colorful ? 0 : m.cells[i]!.wall)!;
    const j = mates[Math.floor(rng() * mates.length)]!;
    if (d[i] === d[j] || (!colorful && shiftsTone(m, i, j, d))) continue;
    const before = costAround(m, i, j, d, target);
    [d[i], d[j]] = [d[j]!, d[i]!];
    const delta = costAround(m, i, j, d, target) - before;
    const T = startT * (endT / startT) ** (s / steps);
    if (delta > 0 && rng() >= Math.exp(-delta / T)) [d[i], d[j]] = [d[j]!, d[i]!];
  }
  // Finition : un carreau encore collé à son double essaie chaque échange possible et garde le meilleur.
  for (const i of movable) {
    if (!m.ring1[i]!.some(n => d[n] === d[i] && isVisible(m.cells[n]!))) continue;
    const mates = byWall.get(colorful ? 0 : m.cells[i]!.wall)!;
    let best = -1;
    let bestDelta = 0;
    for (const j of mates) {
      if (d[i] === d[j] || (!colorful && shiftsTone(m, i, j, d))) continue;
      const before = costAround(m, i, j, d, target);
      [d[i], d[j]] = [d[j]!, d[i]!];
      const delta = costAround(m, i, j, d, target) - before;
      [d[i], d[j]] = [d[j]!, d[i]!];
      if (delta < bestDelta) {
        bestDelta = delta;
        best = j;
      }
    }
    if (best >= 0) [d[i], d[best]] = [d[best]!, d[i]!];
  }
  return d;
}

export function applyAssignment(project: Project, assignment: Assignment): void {
  for (const [wall, keys] of Object.entries(assignment)) {
    const tiles = project.walls[Number(wall)]!.tiles;
    for (const [key, design] of Object.entries(keys)) {
      const t = tiles[key] ?? (tiles[key] = {});
      t.d = design;
    }
  }
}

export interface Proposal {
  assignment: Assignment;
  project: Project;
  report: HarmonyReport;
  style: HarmonyStyle;
  variant: number; // sens du dégradé
  label: string;
}

// Retient le style choisi : Mélanger en tire ensuite de nouvelles variantes.
export function applyStyle(project: Project, style: HarmonyStyle, variant: number): void {
  project.style = style;
  if (style === 'gradient') project.styleVariant = variant;
  else delete project.styleVariant;
}

// Plusieurs recherches indépendantes : la meilleure note n'est pas forcément la plus belle, l'œil choisit.
// Pour le dégradé, chaque proposition prend un sens différent.
// first : numéro de la première proposition, qui fixe aussi le sens du dégradé.
export function harmonyProposals(project: Project, comps: WallComp[], style: HarmonyStyle = project.style ?? 'natural', count = PROPOSALS, first = 0): Proposal[] {
  const m = buildModel(project, comps, style);
  const name = (i: number | undefined): string => {
    const d = i === undefined ? undefined : project.designs[i];
    return d ? d.name || d.key : '';
  };
  const ends = [name(m.chain[0]), name(m.chain[m.chain.length - 1])] as const;
  const proposals = Array.from({ length: count }, (_, n): Proposal => {
    const k = first + n;
    const seed = `harmonie:${style}:${project.seed}:${k}`;
    const d = search(m, seed, styleTarget(m, k, seed));
    const assignment: Assignment = {};
    m.cells.forEach((c, i) => {
      const design = project.designs[d[i]!];
      if (design) (assignment[c.wall] ??= {})[c.key] = design.key;
    });
    const variant = style === 'gradient' ? k % GRADIENT_DIRECTIONS.length : 0;
    const next = produce(project, draft => {
      applyAssignment(draft, assignment);
      applyStyle(draft, style, variant);
    });
    const label = style === 'gradient' ? GRADIENT_DIRECTIONS[variant]!.label(ends[0], ends[1]) : '';
    return { assignment, project: next, report: harmonyReport(next, comps), style, variant, label };
  });
  // L'ordre des sens du dégradé parle de lui-même ; les autres propositions vont de la meilleure note à la moins bonne.
  return style === 'gradient' ? proposals : proposals.sort((a, b) => b.report.score - a.report.score);
}
