// Harmonie d'une répartition : un score pour voir les défauts, et une recherche par échanges pour les réduire.
// Échanger deux carreaux garde les quantités exactes : la commande ne change pas.
import { produce } from 'immer';
import type { WallComp } from './compute';
import { hashStr, mulberry32 } from './geom';
import type { Point, Project } from './types';

export type DefectType = 'adjacent' | 'line' | 'clump' | 'tone';

export interface Defect {
  type: DefectType;
  wall: number;
  keys: string[];
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
  frac: number;
  locked: boolean;
  design: number;
}

interface Pair {
  a: number;
  b: number;
  same: number; // coût si les deux carreaux ont le même motif
  tone: number; // coût si leurs teintes s'écartent de la moyenne du même côté
}

interface Line {
  a: number;
  b: number;
  c: number;
  cost: number;
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
}

const ADJACENT_COST = 12;
const NEAR_COST = 1.6;
const TONE_COST = 0.9;
const LINE_COST = 4;
const RING2_RADIUS = 2.1; // en distance entre carreaux voisins
const VISIBLE_FRAC = 0.2; // en dessous, le morceau se voit trop peu pour compter comme défaut
const TONE_MIN_SPREAD = 0.05;
const TONE_Z = 0.6;
const TONE_PATCH = 4;
const CLUMP_MIN = 4;
const DEFECT_POINTS: Record<DefectType, number> = { adjacent: 3, line: 2, clump: 1, tone: 1 };
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
  return project.walls.flatMap((w, wall) => comps[wall]!.tiles.map((t): Cell => {
    const a = w.tiles[t.key];
    return { wall, key: t.key, c: t.c, frac: t.frac, locked: !!a?.lk, design: index.get(a?.d ?? '') ?? -1 };
  }));
}

function buildLines(comp: WallComp, wallCells: number[], at: Map<string, number>, lines: Line[], cells: Cell[]): void {
  const g = comp.g;
  const steps = [...g.nearAxes.flatMap(a => [g.d, 2 * g.d].map(k => [a, k] as const)), ...g.farAxes.map(a => [a, g.d * Math.sqrt(3)] as const)];
  const nodeAt = (x: number, y: number): number | undefined => {
    const n = g.nearest(x, y, comp.ox, comp.oy);
    return at.get(`${n.q},${n.r}`);
  };
  for (const a of wallCells) {
    const [x, y] = cells[a]!.c;
    for (const [axis, k] of steps) {
      const b = nodeAt(x + axis[0] * k, y + axis[1] * k);
      const c = nodeAt(x + 2 * axis[0] * k, y + 2 * axis[1] * k);
      if (b === undefined || c === undefined) continue;
      lines.push({ a, b, c, cost: LINE_COST * Math.min(cells[a]!.frac, cells[b]!.frac, cells[c]!.frac) });
    }
  }
}

function buildModel(project: Project, comps: WallComp[]): Model {
  const cells = buildCells(project, comps);
  const toneZ = toneScores(project, cells);
  const pairs: Pair[] = [];
  const lines: Line[] = [];
  const ring1: number[][] = cells.map(() => []);
  const ring2: number[][] = cells.map(() => []);

  comps.forEach((comp, wall) => {
    const wallCells = cells.flatMap((c, i) => (c.wall === wall ? [i] : []));
    const at = new Map(wallCells.map(i => [cells[i]!.key, i]));
    const d = comp.g.d;
    for (let x = 0; x < wallCells.length; x++) {
      for (let y = x + 1; y < wallCells.length; y++) {
        const a = wallCells[x]!;
        const b = wallCells[y]!;
        const ca = cells[a]!;
        const cb = cells[b]!;
        const dist = Math.hypot(ca.c[0] - cb.c[0], ca.c[1] - cb.c[1]) / d;
        if (dist > RING2_RADIUS) continue;
        const f = Math.min(ca.frac, cb.frac);
        const near = 1 / dist ** 2;
        pairs.push({ a, b, same: f * (dist < 1.1 ? ADJACENT_COST : NEAR_COST * near), tone: f * TONE_COST * near });
        ring2[a]!.push(b);
        ring2[b]!.push(a);
        if (dist < 1.1) {
          ring1[a]!.push(b);
          ring1[b]!.push(a);
        }
      }
    }
    buildLines(comp, wallCells, at, lines, cells);
  });

  const pairsOf: number[][] = cells.map(() => []);
  pairs.forEach((p, i) => { pairsOf[p.a]!.push(i); pairsOf[p.b]!.push(i); });
  const linesOf: number[][] = cells.map(() => []);
  lines.forEach((l, i) => { linesOf[l.a]!.push(i); linesOf[l.b]!.push(i); linesOf[l.c]!.push(i); });
  return { cells, pairs, lines, ring1, ring2, toneZ, pairsOf, linesOf };
}

// ---- rapport ----
const isVisible = (c: Cell): boolean => c.frac >= VISIBLE_FRAC && c.design >= 0;

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
    defects.push({ type: 'clump', wall: c.wall, keys: group.map(g => m.cells[g]!.key) });
  }
  return defects;
}

function toneDefects(m: Model): Defect[] {
  const defects: Defect[] = [];
  const side = (i: number): number => {
    const c = m.cells[i]!;
    if (!isVisible(c)) return 0;
    const z = m.toneZ[c.design]!;
    return z > TONE_Z ? 1 : z < -TONE_Z ? -1 : 0;
  };
  const seen = new Set<number>();
  m.cells.forEach((c, start) => {
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
    if (patch.length >= TONE_PATCH) defects.push({ type: 'tone', wall: c.wall, keys: patch.map(i => m.cells[i]!.key) });
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
      if (a < b && ca.design === cb.design && isVisible(ca) && isVisible(cb)) defects.push({ type: 'adjacent', wall: ca.wall, keys: [ca.key, cb.key] });
    }
  });
  for (const l of m.lines) {
    const [a, b, c] = [cells[l.a]!, cells[l.b]!, cells[l.c]!];
    if (a.design === b.design && b.design === c.design && isVisible(a) && isVisible(b) && isVisible(c)) {
      defects.push({ type: 'line', wall: a.wall, keys: [a.key, b.key, c.key] });
    }
  }
  defects.push(...clumpDefects(m, project), ...toneDefects(m));
  const counts: Record<DefectType, number> = { adjacent: 0, line: 0, clump: 0, tone: 0 };
  let points = 0;
  for (const d of defects) {
    counts[d.type]++;
    points += DEFECT_POINTS[d.type];
  }
  const score = cells.length ? Math.round(100 * Math.exp(-SCORE_SLOPE * points / cells.length)) : 100;
  return { score, counts, defects };
}

export function harmonyReport(project: Project, comps: WallComp[]): HarmonyReport {
  return report(buildModel(project, comps), project);
}

// ---- recherche par échanges ----
const pairCost = (m: Model, p: Pair, d: number[]): number => {
  const a = d[p.a]!;
  const b = d[p.b]!;
  if (a < 0 || b < 0) return 0;
  return (a === b ? p.same : 0) + p.tone * m.toneZ[a]! * m.toneZ[b]!;
};

const lineCost = (l: Line, d: number[]): number => (d[l.a]! >= 0 && d[l.a] === d[l.b] && d[l.b] === d[l.c] ? l.cost : 0);

function costAround(m: Model, i: number, j: number, d: number[]): number {
  let e = 0;
  for (const k of m.pairsOf[i]!) e += pairCost(m, m.pairs[k]!, d);
  for (const k of m.pairsOf[j]!) {
    const p = m.pairs[k]!;
    if (p.a !== i && p.b !== i) e += pairCost(m, p, d);
  }
  for (const k of m.linesOf[i]!) e += lineCost(m.lines[k]!, d);
  for (const k of m.linesOf[j]!) {
    const l = m.lines[k]!;
    if (l.a !== i && l.b !== i && l.c !== i) e += lineCost(l, d);
  }
  return e;
}

function search(m: Model, seed: string): number[] {
  const rng = mulberry32(hashStr(seed));
  const d = m.cells.map(c => c.design);
  const movable = m.cells.flatMap((c, i) => (c.locked || c.design < 0 ? [] : [i]));
  if (movable.length < 2) return d;
  const steps = Math.min(60000, movable.length * 400);
  const startT = 3;
  const endT = 0.08;
  for (let s = 0; s < steps; s++) {
    const i = movable[Math.floor(rng() * movable.length)]!;
    const j = movable[Math.floor(rng() * movable.length)]!;
    if (d[i] === d[j]) continue;
    const before = costAround(m, i, j, d);
    [d[i], d[j]] = [d[j]!, d[i]!];
    const delta = costAround(m, i, j, d) - before;
    const T = startT * (endT / startT) ** (s / steps);
    if (delta > 0 && rng() >= Math.exp(-delta / T)) [d[i], d[j]] = [d[j]!, d[i]!];
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
}

// Plusieurs recherches indépendantes : la meilleure note n'est pas forcément la plus belle, l'œil choisit.
export function harmonyProposals(project: Project, comps: WallComp[], count = PROPOSALS): Proposal[] {
  const m = buildModel(project, comps);
  return Array.from({ length: count }, (_, k): Proposal => {
    const d = search(m, `harmonie:${project.seed}:${k}`);
    const assignment: Assignment = {};
    m.cells.forEach((c, i) => {
      const design = project.designs[d[i]!];
      if (design) (assignment[c.wall] ??= {})[c.key] = design.key;
    });
    const next = produce(project, draft => applyAssignment(draft, assignment));
    return { assignment, project: next, report: harmonyReport(next, comps) };
  }).sort((a, b) => b.report.score - a.report.score);
}
