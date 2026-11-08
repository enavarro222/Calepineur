// Harmonie d'une répartition : une note pour voir les défauts, et une recherche par échanges pour les réduire.
// Les défauts et leurs points sont définis une seule fois (voir rules.ts) : la recherche minimise exactement ce que
// la note compte. Échanger deux carreaux garde les quantités exactes.
//
// Le but est un aspect naturel, pas un écartement maximal : sur un réseau hexagonal, écarter au mieux les motifs
// identiques ou alterner clair et sombre mène à un pavage périodique, qui saute aux yeux. Rien ne récompense donc la
// régularité : une fois les défauts évités, la recherche continue au hasard parmi les solutions sans défaut.
//
// Les styles de couleur ajoutent un seul terme, qui n'est pas un défaut : le placement, ce que coûte chaque motif à
// chaque carreau. Pour les vagues et le dégradé, chaque motif est attiré vers une zone selon sa place dans la chaîne
// des couleurs ; la zone visée est une cible lisse (ondulations ou pente) ramenée en rangs, pour que chaque motif y
// trouve exactement sa part. Pour « Mes teintes », chaque motif est attiré par les repères qui ont ses couleurs (voir
// tints.ts). Les échanges se font alors entre pans : le total commandé ne change pas, la part de chaque pan oui.
import { produce } from 'immer';
import type { WallComp } from './compute';
import { hashStr, mulberry32 } from './geom';
import { colorChain } from './palette';
import { buildModel, DEFECT_POINTS, findDefects, localPoints, type Cell, type DefectType, type Model } from './rules';
import { tintFit, wallStarts } from './tints';
import type { HarmonyStyle, Project } from './types';

export { colorTone, defectsOnWall, type Defect, type DefectType, type TileRef, type WallDefect } from './rules';

export interface HarmonyReport {
  score: number; // de 0 à 100
  counts: Record<DefectType, number>;
  defects: ReturnType<typeof findDefects>;
}

export type Assignment = Record<number, Record<string, string>>; // pan → emplacement → motif

const SCORE_SLOPE = 3;
const PROPOSALS = 4;
// Écart d'un carreau à sa zone, au carré (rangs de 0 à 1). Assez fort pour que le dégradé suive les couleurs, assez
// faible pour qu'un voisin identique coûte toujours plus qu'un carreau mal placé.
const PLACEMENT_POINTS = 2;
// Part des couleurs d'un motif que les repères ne demandent pas, de 0 à 1.
const TINT_POINTS = 2;
const WAVES = 6;
const FULL_RING1 = 6;
const FINISH_TRIES = 60;

function reportOf(m: Model, d: number[]): HarmonyReport {
  const defects = findDefects(m, d);
  const counts: Record<DefectType, number> = { adjacent: 0, gap: 0, line: 0, pattern: 0, clump: 0, tone: 0, clash: 0 };
  let points = 0;
  for (const x of defects) {
    counts[x.type]++;
    points += DEFECT_POINTS[x.type];
  }
  const score = m.cells.length ? Math.round(100 * Math.exp(-SCORE_SLOPE * points / m.cells.length)) : 100;
  return { score, counts, defects };
}

export function harmonyReport(project: Project, comps: WallComp[]): HarmonyReport {
  const m = buildModel(project, comps, project.style ?? 'natural');
  return reportOf(m, m.designs);
}

// ---- styles de couleur ----

// Place de chaque motif le long de la chaîne des couleurs, au milieu de sa part des carreaux posés.
function chainRanks(project: Project, cells: Cell[]): number[] {
  const count = project.designs.map(() => 0);
  for (const c of cells) if (c.design >= 0) count[c.design]!++;
  const total = Math.max(1, count.reduce((a, b) => a + b, 0));
  const rank = project.designs.map(() => 0);
  let done = 0;
  for (const d of colorChain(project.designs)) {
    rank[d] = (done + count[d]! / 2) / total;
    done += count[d]!;
  }
  return rank;
}

const GRADIENT_DIRECTIONS = [
  { x: 1, y: 0, label: (a: string, b: string) => `${a} à gauche, ${b} à droite` },
  { x: -1, y: 0, label: (a: string, b: string) => `${b} à gauche, ${a} à droite` },
  { x: 0, y: 1, label: (a: string, b: string) => `${a} en bas, ${b} en haut` },
  { x: 1, y: 1.5, label: (a: string, b: string) => `En diagonale : ${a} en bas à gauche, ${b} en haut à droite` },
];

// Cible lisse, ramenée en rangs de 0 à 1 : chaque motif y trouve une bande à la mesure de sa quantité.
function styleTarget(m: Model, style: HarmonyStyle, k: number, seed: string): number[] | null {
  if ((style !== 'waves' && style !== 'gradient') || !m.cells.length) return null;
  const rng = mulberry32(hashStr(`${seed}:cible`));
  const ys = m.cells.map(c => c.c[1]);
  const span = Math.max(1, Math.max(...m.cells.map(c => c.gx)) - Math.min(...m.cells.map(c => c.gx)), Math.max(...ys) - Math.min(...ys));
  let raw: number[];
  if (style === 'gradient') {
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

// Placement : ce que coûte chaque motif à chaque carreau (cost[i * n + motif]), ou rien en style Naturel.
interface Goal {
  cost: Float64Array | null;
  n: number;
}

function styleGoal(project: Project, m: Model, style: HarmonyStyle, k: number, seed: string): Goal {
  const n = project.designs.length;
  const cost = new Float64Array(m.cells.length * n);
  if (style === 'tints') {
    const starts = wallStarts(project.walls);
    const fit = tintFit(project, m.cells.map(c => ({ gx: starts[c.wall]! + c.c[0], y: c.c[1] })));
    if (!fit) return { cost: null, n };
    fit.forEach((f, i) => f.forEach((x, d) => { cost[i * n + d] = TINT_POINTS * (1 - x); }));
    return { cost, n };
  }
  const target = styleTarget(m, style, k, seed);
  if (!target) return { cost: null, n };
  const rank = chainRanks(project, m.cells);
  target.forEach((t, i) => rank.forEach((r, d) => { cost[i * n + d] = PLACEMENT_POINTS * (r - t) ** 2; }));
  return { cost, n };
}

// ---- recherche par échanges ----

const placement = (g: Goal, d: number[], i: number): number => (g.cost ? g.cost[i * g.n + d[i]!]! : 0);

const costAround = (m: Model, g: Goal, d: number[], i: number, j: number): number =>
  localPoints(m, d, i, j) + placement(g, d, i) + placement(g, d, j);

// Un carreau de bord a moins de voisins, donc moins de contraintes : sans cette règle, les teintes marquées
// migreraient vers le pourtour et laisseraient le centre pâle. Le mélange de départ a déjà le bon équilibre.
function shiftsTone(m: Model, i: number, j: number, d: number[]): boolean {
  return m.ring1[i]!.length < FULL_RING1 !== m.ring1[j]!.length < FULL_RING1 && m.side[d[i]!] !== m.side[d[j]!];
}

// Recuit simulé : un échange qui fait baisser les points est gardé, un échange qui les fait monter l'est parfois,
// de moins en moins souvent. perWall : échanges limités à chaque pan, pour garder la part de chaque pan.
function search(m: Model, seed: string, goal: Goal, perWall: boolean): number[] {
  const rng = mulberry32(hashStr(seed));
  const d = m.designs.slice();
  const colorful = m.colorful;
  const groups = new Map<number, number[]>();
  m.cells.forEach((c, i) => {
    const group = perWall ? c.wall : 0;
    if (!c.locked && c.design >= 0) groups.set(group, [...(groups.get(group) ?? []), i]);
  });
  const movable = [...groups.values()].filter(cells => cells.length > 1).flat();
  if (!movable.length) return d;
  const mates = (i: number): number[] => groups.get(perWall ? m.cells[i]!.wall : 0)!;
  const blocked = (i: number, j: number): boolean => d[i] === d[j] || (!colorful && shiftsTone(m, i, j, d));
  const steps = colorful ? Math.min(90000, movable.length * 700) : Math.min(40000, movable.length * 300);
  const startT = colorful ? 0.25 : 0.75;
  const endT = colorful ? 0.004 : 0.02;
  for (let s = 0; s < steps; s++) {
    const i = movable[Math.floor(rng() * movable.length)]!;
    const all = mates(i);
    const j = all[Math.floor(rng() * all.length)]!;
    if (blocked(i, j)) continue;
    const before = costAround(m, goal, d, i, j);
    [d[i], d[j]] = [d[j]!, d[i]!];
    const delta = costAround(m, goal, d, i, j) - before;
    const T = startT * (endT / startT) ** (s / steps);
    if (delta > 0 && rng() >= Math.exp(-delta / T)) [d[i], d[j]] = [d[j]!, d[i]!];
  }
  // Finition : un carreau encore pris dans un défaut essaie des échanges et garde le meilleur.
  for (const i of movable) {
    if (!localPoints(m, d, i)) continue;
    let best = -1;
    let bestDelta = 0;
    const all = mates(i);
    for (let n = 0; n < Math.min(FINISH_TRIES, all.length); n++) {
      const j = all.length <= FINISH_TRIES ? all[n]! : all[Math.floor(rng() * all.length)]!;
      if (blocked(i, j)) continue;
      const before = costAround(m, goal, d, i, j);
      [d[i], d[j]] = [d[j]!, d[i]!];
      const delta = costAround(m, goal, d, i, j) - before;
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

const seedOf = (project: Project, style: HarmonyStyle, k: number): string => `harmonie:${style}:${project.seed}:${k}`;

function toAssignment(project: Project, m: Model, d: number[]): Assignment {
  const assignment: Assignment = {};
  m.cells.forEach((c, i) => {
    const design = project.designs[d[i]!];
    if (design) (assignment[c.wall] ??= {})[c.key] = design.key;
  });
  return assignment;
}

// Une répartition dans le style voulu, à partir de celle du projet. k : numéro de la variante, qui fixe aussi le sens
// du dégradé. Mélanger s'en sert avec perWall à false : il ne garde que le total de chaque motif.
export function arrange(project: Project, comps: WallComp[], style: HarmonyStyle, k: number, perWall = style === 'natural'): Assignment {
  const m = buildModel(project, comps, style);
  const seed = seedOf(project, style, k);
  const d = search(m, seed, styleGoal(project, m, style, k, seed), perWall);
  return toAssignment(project, m, d);
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
  const chain = colorChain(project.designs);
  const name = (i: number | undefined): string => {
    const d = i === undefined ? undefined : project.designs[i];
    return d ? d.name || d.key : '';
  };
  const ends = [name(chain[0]), name(chain[chain.length - 1])] as const;
  const proposals = Array.from({ length: count }, (_, n): Proposal => {
    const k = first + n;
    const seed = seedOf(project, style, k);
    const d = search(m, seed, styleGoal(project, m, style, k, seed), style === 'natural');
    const assignment = toAssignment(project, m, d);
    const variant = style === 'gradient' ? k % GRADIENT_DIRECTIONS.length : 0;
    const next = produce(project, draft => {
      applyAssignment(draft, assignment);
      applyStyle(draft, style, variant);
    });
    const label = style === 'gradient' ? GRADIENT_DIRECTIONS[variant]!.label(ends[0], ends[1]) : '';
    return { assignment, project: next, report: reportOf(m, d), style, variant, label };
  });
  // L'ordre des sens du dégradé parle de lui-même ; les autres propositions vont de la meilleure note à la moins bonne.
  return style === 'gradient' ? proposals : proposals.sort((a, b) => b.report.score - a.report.score);
}
