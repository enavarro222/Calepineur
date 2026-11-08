// Répartition des motifs, reproductible. Les défauts à éviter sont ceux de la note d'harmonie (voir rules.ts) :
// Mélanger, le remplissage des nouveaux carreaux et Remplacer les comptent de la même façon qu'Harmoniser.
import type { WallComp } from './compute';
import { hashStr, mulberry32 } from './geom';
import { applyAssignment, arrange } from './harmony';
import { buildModel, localPoints } from './rules';
import type { Design, Project } from './types';

export function designMap(project: Pick<Project, 'designs'>): Map<string, Design> {
  return new Map(project.designs.map(d => [d.key, d]));
}

export function pickRot(project: Pick<Project, 'rotMode'>, rng: () => number): number {
  if (project.rotMode === '60') return Math.floor(rng() * 6);
  if (project.rotMode === '180') return rng() < 0.5 ? 0 : 3;
  return 0;
}

// Motifs à répartir, selon les poids. Sans aucun poids, le premier motif.
function usableDesigns(project: Project): number[] {
  const ds = project.designs.map((d, i) => (d.weight > 0 ? i : -1)).filter(i => i >= 0);
  return ds.length || !project.designs.length ? ds : [0];
}

const weightOf = (project: Project, i: number): number => project.designs[i]!.weight || 1;

// Donne un motif aux carreaux qui n'en ont pas encore (ou dont le motif a été supprimé), un par un : le moins de
// points de défaut avec les carreaux déjà posés, puis le motif le plus en retard sur sa part.
export function ensureAssigned(project: Project, comps: WallComp[]): void {
  const dm = designMap(project);
  const missing = project.walls.some((w, i) => comps[i]!.tiles.some(t => !dm.has(w.tiles[t.key]?.d ?? '')));
  if (!missing || !project.designs.length) return;
  const usable = usableDesigns(project);
  const m = buildModel(project, comps, project.style ?? 'natural');
  const d = m.designs;
  const counts = project.designs.map(() => 0);
  for (const x of d) if (x >= 0) counts[x]!++;
  m.cells.forEach((c, i) => {
    if (d[i]! >= 0) return;
    const w = project.walls[c.wall]!;
    const rng = mulberry32(hashStr(`${project.seed}:${w.id}:${c.key}`));
    let best = -1;
    let bp = Infinity;
    let bs = Infinity;
    for (const k of usable) {
      d[i] = k;
      const p = localPoints(m, d, i);
      const s = (counts[k]! + rng() * 1.5) / weightOf(project, k);
      if (p < bp || (p === bp && s < bs)) { bp = p; bs = s; best = k; }
    }
    d[i] = best;
    if (best >= 0) counts[best]!++;
    const a = w.tiles[c.key] ?? (w.tiles[c.key] = {});
    a.d = project.designs[best]?.key ?? null;
    if (a.rot == null) a.rot = pickRot(project, rng);
  });
}

// Autre motif pour un carreau, tiré au hasard parmi les bons : le moins de points de défaut, puis l'écart aux poids,
// tous pans confondus. Un tirage pondéré plutôt que le meilleur à coup sûr : recliquer propose autre chose. null s'il
// n'y a pas d'autre motif.
const REPLACE_SPREAD = 1.2; // avance sur sa part, en carreaux, qui divise par e la chance d'un motif face au meilleur
const MAX_BALANCE = 2; // en carreaux : au-delà, l'écart aux poids ne compte pas plus

export function proposeReplacement(project: Project, comps: WallComp[], wall: number, key: string, rng: () => number): string | null {
  const m = buildModel(project, comps, project.style ?? 'natural');
  const i = m.cells.findIndex(c => c.wall === wall && c.key === key);
  const current = i >= 0 ? m.cells[i]!.design : -1;
  const ds = project.designs.map((x, k) => (x.weight > 0 && k !== current ? k : -1)).filter(k => k >= 0);
  if (i < 0 || !ds.length) return null;
  const d = m.designs;
  const counts = project.designs.map(() => 0);
  d.forEach((x, n) => { if (x >= 0 && n !== i) counts[x]!++; });
  const total = counts.reduce((a, b) => a + b, 0);
  const weights = ds.reduce((a, k) => a + project.designs[k]!.weight, 0) + Math.max(0, project.designs[current]?.weight ?? 0);
  const cost = ds.map(k => {
    d[i] = k;
    const ahead = counts[k]! + 1 - (total + 1) * project.designs[k]!.weight / weights; // carreau remplacé compris
    return { k, points: localPoints(m, d, i), balance: Math.max(-MAX_BALANCE, Math.min(MAX_BALANCE, ahead)) };
  });
  const least = Math.min(...cost.map(x => x.points));
  const ok = cost.filter(x => x.points === least);
  const best = Math.min(...ok.map(x => x.balance));
  const odds = ok.map(x => Math.exp(-(x.balance - best) / REPLACE_SPREAD));
  let r = rng() * odds.reduce((a, b) => a + b, 0);
  for (let n = 0; n < ok.length; n++) {
    r -= odds[n]!;
    if (r <= 0) return project.designs[ok[n]!.k]!.key;
  }
  return project.designs[ok[ok.length - 1]!.k]!.key;
}

// Quantités de chaque motif pour n carreaux, au plus près des poids, carreaux gardés compris.
function quotas(project: Project, kept: number[], n: number): number[] {
  const usable = usableDesigns(project);
  const q = project.designs.map(() => 0);
  if (!usable.length) return q;
  for (let k = 0; k < n; k++) {
    let best = usable[0]!;
    for (const x of usable) {
      if ((kept[x]! + q[x]! + 1) / weightOf(project, x) < (kept[best]! + q[best]! + 1) / weightOf(project, best)) best = x;
    }
    q[best]!++;
  }
  return q;
}

// Nouvelle répartition : les quantités suivent les poids, posées au hasard, puis la même recherche qu'Harmoniser, dans
// le style retenu, sans défaut si possible. Garde les carreaux verrouillés à la main si keepLocked.
export function shuffleDesigns(project: Project, comps: WallComp[], keepLocked: boolean): void {
  const rng = mulberry32(hashStr(`shuffle:${project.seed}`));
  const index = new Map(project.designs.map((d, i) => [d.key, i]));
  const kept = project.designs.map(() => 0);
  const movable: { wall: number; key: string }[] = [];
  project.walls.forEach((w, i) => comps[i]!.tiles.forEach(t => {
    const a = w.tiles[t.key];
    const d = a?.d ? index.get(a.d) : undefined;
    if (keepLocked && a?.lk && d !== undefined) kept[d]!++;
    else movable.push({ wall: i, key: t.key });
  }));
  const q = quotas(project, kept, movable.length);
  const bag = q.flatMap((n, k) => Array<number>(n).fill(k));
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  movable.forEach(({ wall, key }, n) => {
    const tiles = project.walls[wall]!.tiles;
    const a = tiles[key] ?? (tiles[key] = {});
    delete a.lk;
    a.d = project.designs[bag[n] ?? -1]?.key ?? null;
    a.rot = pickRot(project, rng);
  });
  const style = project.style ?? 'natural';
  applyAssignment(project, arrange(project, comps, style, project.styleVariant ?? 0, false));
}

// Supprime les entrées de carreaux inutiles (emplacements hors zone sans réglage manuel).
export function pruneTiles(project: Project, comps: WallComp[]): void {
  project.walls.forEach((w, i) => {
    for (const k of Object.keys(w.tiles)) {
      const a = w.tiles[k]!;
      if (!comps[i]!.byKey.has(k) && !a.st && !a.lk) delete w.tiles[k];
    }
  });
}
