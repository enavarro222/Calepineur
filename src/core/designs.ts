// Répartition des motifs : équilibrée selon les poids, sans deux motifs identiques côte à côte, reproductible.
import type { PlacedTile, WallComp } from './compute';
import { hashStr, mulberry32 } from './geom';
import type { Design, Project, Wall } from './types';

export function designMap(project: Pick<Project, 'designs'>): Map<string, Design> {
  return new Map(project.designs.map(d => [d.key, d]));
}

export function pickDesign(
  project: Pick<Project, 'designs'>,
  counts: Record<string, number>,
  banned: Set<string>,
  rng: () => number,
): string | null {
  const ds = project.designs.filter(d => d.weight > 0);
  if (!ds.length) return project.designs[0]?.key ?? null;
  let cand = ds.filter(d => !banned.has(d.key));
  if (!cand.length) cand = ds;
  let best = cand[0]!;
  let bs = Infinity;
  for (const d of cand) {
    const s = ((counts[d.key] ?? 0) + rng() * 1.5) / d.weight;
    if (s < bs) { bs = s; best = d; }
  }
  return best.key;
}

export function pickRot(project: Pick<Project, 'rotMode'>, rng: () => number): number {
  if (project.rotMode === '60') return Math.floor(rng() * 6);
  if (project.rotMode === '180') return rng() < 0.5 ? 0 : 3;
  return 0;
}

export function bannedFor(wall: Wall, comp: WallComp, t: PlacedTile): Set<string> {
  const banned = new Set<string>();
  for (const [q, r] of comp.g.neighbors(t.q, t.r)) {
    const k = `${q},${r}`;
    const n = wall.tiles[k];
    if (n?.d && comp.byKey.has(k)) banned.add(n.d);
  }
  return banned;
}

const bump = (counts: Record<string, number>, key: string | null | undefined): void => {
  if (key) counts[key] = (counts[key] ?? 0) + 1;
};

// Donne un motif aux carreaux qui n'en ont pas encore (ou dont le motif a été supprimé).
export function ensureAssigned(project: Project, comps: WallComp[]): void {
  const dm = designMap(project);
  const counts: Record<string, number> = {};
  project.walls.forEach((w, i) => comps[i]!.tiles.forEach(t => {
    const d = w.tiles[t.key]?.d;
    if (d && dm.has(d)) bump(counts, d);
  }));
  project.walls.forEach((w, i) => {
    const comp = comps[i]!;
    for (const t of comp.tiles) {
      const a = w.tiles[t.key] ?? (w.tiles[t.key] = {});
      if (a.d && dm.has(a.d)) continue;
      const rng = mulberry32(hashStr(`${project.seed}:${w.id}:${t.key}`));
      a.d = pickDesign(project, counts, bannedFor(w, comp, t), rng);
      if (a.rot == null) a.rot = pickRot(project, rng);
      bump(counts, a.d);
    }
  });
}

// Nouvelle répartition aléatoire (garde les carreaux verrouillés à la main si keepLocked).
export function shuffleDesigns(project: Project, comps: WallComp[], keepLocked: boolean): void {
  const rng = mulberry32(hashStr(`shuffle:${project.seed}`));
  const dm = designMap(project);
  const counts: Record<string, number> = {};
  const todo: [number, PlacedTile][] = [];
  project.walls.forEach((w, i) => comps[i]!.tiles.forEach(t => {
    const a = w.tiles[t.key] ?? (w.tiles[t.key] = {});
    if (keepLocked && a.lk && a.d && dm.has(a.d)) bump(counts, a.d);
    else {
      delete a.d;
      delete a.lk;
      todo.push([i, t]);
    }
  }));
  for (let i = todo.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [todo[i], todo[j]] = [todo[j]!, todo[i]!];
  }
  for (const [i, t] of todo) {
    const w = project.walls[i]!;
    const a = w.tiles[t.key]!;
    a.d = pickDesign(project, counts, bannedFor(w, comps[i]!, t), rng);
    a.rot = pickRot(project, rng);
    bump(counts, a.d);
  }
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
