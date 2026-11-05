// Répartition des motifs : équilibrée selon les poids, sans deux motifs identiques côte à côte ni, autant que possible,
// alignés à une colonne d'écart, reproductible.
import type { PlacedTile, WallComp } from './compute';
import { hashStr, mulberry32 } from './geom';
import type { Design, Project, Wall } from './types';

export function designMap(project: Pick<Project, 'designs'>): Map<string, Design> {
  return new Map(project.designs.map(d => [d.key, d]));
}

// Gêne d'un motif répété selon l'éloignement (voir Lattice.near) : côte à côte quasi interdit, puis aligné à une
// colonne d'écart, ce qui saute aux yeux, puis en ligne droite avec un carreau entre. Écarter plus fort la colonne
// d'écart ferait doubler les lignes droites quand il y a peu de motifs.
const ADJACENT_PENALTY = 1000;
const NEAR_PENALTY = [0, ADJACENT_PENALTY, 30, 8] as const;
// Au tirage, le reste de la gêne compte comme une avance sur l'équilibre (10 = un carreau), plafonnée pour que les
// poids gardent le dernier mot. Les échanges qui suivent ne changent plus les quantités.
const PENALTY_PER_TILE = 10;
const MAX_ADVANCE = 2;
const SHUFFLE_TRIES = 3;
const SPREAD_PASSES = 15;
const SWAP_TRIES = 40;

// pen : gêne de chaque motif à l'emplacement à remplir. Jamais un voisin identique si on peut l'éviter ; ensuite
// la gêne restante s'ajoute à l'équilibre des poids.
export function pickDesign(
  project: Pick<Project, 'designs'>,
  counts: Record<string, number>,
  pen: Record<string, number>,
  rng: () => number,
): string | null {
  const ds = project.designs.filter(d => d.weight > 0);
  if (!ds.length) return project.designs[0]?.key ?? null;
  let best = ds[0]!;
  let bp = Infinity;
  let bs = Infinity;
  for (const d of ds) {
    const total = pen[d.key] ?? 0;
    const p = total >= ADJACENT_PENALTY ? 1 : 0; // un voisin identique ou plusieurs : à éviter pareil
    const soft = Math.min(MAX_ADVANCE, (total % ADJACENT_PENALTY) / PENALTY_PER_TILE);
    const s = ((counts[d.key] ?? 0) + rng() * 1.5) / d.weight + soft;
    if (p < bp || (p === bp && s < bs)) { bp = p; bs = s; best = d; }
  }
  return best.key;
}

export function pickRot(project: Pick<Project, 'rotMode'>, rng: () => number): number {
  if (project.rotMode === '60') return Math.floor(rng() * 6);
  if (project.rotMode === '180') return rng() < 0.5 ? 0 : 3;
  return 0;
}

// Emplacements posés autour de t, avec la gêne d'un motif répété.
function nearKeys(comp: WallComp, t: PlacedTile): [string, number][] {
  const out: [string, number][] = [];
  for (const [q, r, lvl] of comp.g.near(t.q, t.r)) {
    const k = `${q},${r}`;
    if (comp.byKey.has(k)) out.push([k, NEAR_PENALTY[lvl]]);
  }
  return out;
}

export function penaltiesFor(wall: Wall, comp: WallComp, t: PlacedTile): Record<string, number> {
  const pen: Record<string, number> = {};
  for (const [k, p] of nearKeys(comp, t)) {
    const d = wall.tiles[k]?.d;
    if (d) pen[d] = (pen[d] ?? 0) + p;
  }
  return pen;
}

// Autre motif pour un carreau, tiré au hasard parmi les bons : jamais un voisin identique si on peut l'éviter, puis
// la gêne des répétitions proches et l'écart aux poids, tous pans confondus. Un tirage pondéré plutôt que le meilleur
// à coup sûr : recliquer propose autre chose. null s'il n'y a pas d'autre motif.
const REPLACE_SPREAD = 12; // gêne qui divise par e la chance d'un motif face au meilleur
const MAX_BALANCE = 2; // en carreaux : au-delà, l'écart aux poids ne compte pas plus

export function proposeReplacement(project: Project, comps: WallComp[], wall: number, key: string, rng: () => number): string | null {
  const w = project.walls[wall]!;
  const t = comps[wall]!.byKey.get(key);
  const current = w.tiles[key]?.d;
  const ds = project.designs.filter(d => d.weight > 0 && d.key !== current);
  if (!t || !ds.length) return null;
  const counts: Record<string, number> = {};
  let total = 0;
  project.walls.forEach((x, i) => comps[i]!.tiles.forEach(p => {
    if (x === w && p.key === key) return;
    const d = x.tiles[p.key]?.d;
    if (d) { bump(counts, d); total++; }
  }));
  const weights = ds.reduce((a, d) => a + d.weight, 0) + (project.designs.find(d => d.key === current)?.weight ?? 0);
  const pen = penaltiesFor(w, comps[wall]!, t);
  const cost = ds.map(d => {
    const near = pen[d.key] ?? 0;
    // avance du motif sur sa part, carreau remplacé compris
    const ahead = (counts[d.key] ?? 0) + 1 - (total + 1) * d.weight / weights;
    const balance = PENALTY_PER_TILE * Math.max(-MAX_BALANCE, Math.min(MAX_BALANCE, ahead));
    return { key: d.key, tier: near >= ADJACENT_PENALTY ? 1 : 0, c: (near % ADJACENT_PENALTY) + balance };
  });
  const tier = Math.min(...cost.map(x => x.tier));
  const ok = cost.filter(x => x.tier === tier);
  const best = Math.min(...ok.map(x => x.c));
  const odds = ok.map(x => Math.exp(-(x.c - best) / REPLACE_SPREAD));
  let r = rng() * odds.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ok.length; i++) {
    r -= odds[i]!;
    if (r <= 0) return ok[i]!.key;
  }
  return ok[ok.length - 1]!.key;
}

// Le mélange travaille sur des tableaux à part : le projet est souvent un brouillon immer, lent à lire en boucle.
interface Slots {
  des: (string | null)[]; // motif de chaque emplacement posé, tous pans confondus
  near: [number, number][][]; // emplacements proches et gêne d'une répétition
}

const slotCost = (s: Slots, i: number): number => {
  let c = 0;
  const d = s.des[i];
  if (!d) return 0;
  for (const [n, p] of s.near[i]!) if (s.des[n] === d) c += p;
  return c;
};

// Réduit les répétitions proches en échangeant deux à deux les motifs des emplacements mobiles : les quantités par
// motif ne changent pas. Chaque emplacement gênant essaie quelques partenaires au hasard. Renvoie la gêne restante.
function spreadDesigns(s: Slots, movable: number[], rng: () => number): number {
  const order = movable.slice();
  const swap = (i: number, j: number): void => { [s.des[i], s.des[j]] = [s.des[j]!, s.des[i]!]; };
  for (let pass = 0; pass < SPREAD_PASSES; pass++) {
    let improved = false;
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    for (const i of order) {
      if (!slotCost(s, i)) continue;
      let best = -1;
      let bestDelta = 0;
      for (let n = 0; n < SWAP_TRIES; n++) {
        const j = movable[Math.floor(rng() * movable.length)]!;
        if (j === i || s.des[j] === s.des[i]) continue;
        const before = slotCost(s, i) + slotCost(s, j);
        swap(i, j);
        const delta = slotCost(s, i) + slotCost(s, j) - before;
        swap(i, j);
        if (delta < bestDelta) { bestDelta = delta; best = j; }
      }
      if (best >= 0) {
        swap(i, best);
        improved = true;
      }
    }
    if (!improved) break;
  }
  return movable.reduce((c, i) => c + slotCost(s, i), 0);
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
      a.d = pickDesign(project, counts, penaltiesFor(w, comp, t), rng);
      if (a.rot == null) a.rot = pickRot(project, rng);
      bump(counts, a.d);
    }
  });
}

// Nouvelle répartition aléatoire (garde les carreaux verrouillés à la main si keepLocked).
// Plusieurs essais : on garde celui qui répète le moins les motifs proches.
export function shuffleDesigns(project: Project, comps: WallComp[], keepLocked: boolean): void {
  const rng = mulberry32(hashStr(`shuffle:${project.seed}`));
  const dm = designMap(project);
  const counts0: Record<string, number> = {};
  const s: Slots = { des: [], near: [] };
  const movable: number[] = [];
  const index = comps.map(() => new Map<string, number>());
  project.walls.forEach((w, i) => comps[i]!.tiles.forEach(t => {
    const a = w.tiles[t.key];
    const kept = keepLocked && a?.lk && a.d && dm.has(a.d) ? a.d : null;
    index[i]!.set(t.key, s.des.length);
    if (kept) bump(counts0, kept);
    else movable.push(s.des.length);
    s.des.push(kept);
  }));
  comps.forEach((comp, i) => comp.tiles.forEach(t => {
    s.near[index[i]!.get(t.key)!] = nearKeys(comp, t).map(([k, p]) => [index[i]!.get(k)!, p]);
  }));

  let best: (string | null)[] = [];
  let bestCost = Infinity;
  for (let attempt = 0; attempt < SHUFFLE_TRIES && bestCost > 0; attempt++) {
    const counts = { ...counts0 };
    for (const i of movable) s.des[i] = null;
    const order = movable.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    for (const i of order) {
      const pen: Record<string, number> = {};
      for (const [n, p] of s.near[i]!) {
        const d = s.des[n];
        if (d) pen[d] = (pen[d] ?? 0) + p;
      }
      s.des[i] = pickDesign(project, counts, pen, rng);
      bump(counts, s.des[i]);
    }
    const cost = spreadDesigns(s, movable, rng);
    if (cost < bestCost) {
      bestCost = cost;
      best = s.des.slice();
    }
  }

  const isMovable = new Set(movable);
  project.walls.forEach((w, i) => comps[i]!.tiles.forEach(t => {
    const j = index[i]!.get(t.key)!;
    if (!isMovable.has(j)) return;
    const a = w.tiles[t.key] ?? (w.tiles[t.key] = {});
    delete a.lk;
    a.d = best[j] ?? null;
    a.rot = pickRot(project, rng);
  }));
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
