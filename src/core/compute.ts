// Calcul des carreaux d'un pan : quels emplacements sont posés, quelle part de chaque carreau reste après coupe.
import polygonClipping from 'polygon-clipping';
import { bbOverlap, bboxPts, closeRing, colLetters, mpArea, pointInRing, ringCrossesBB } from './geom';
import { latticeFor, type Lattice } from './lattice';
import type { BBox, MultiPolygon, Point, Project, Ring, Wall } from './types';

export interface WallObstacleArea {
  bb: BBox;
  poly: Ring[];
}

export interface WallAllowed {
  allowed: MultiPolygon;
  base: MultiPolygon; // mur moins les éléments, sans la zone : pour les carreaux ajoutés au pinceau en mode coupé
  obs: WallObstacleArea[];
  zone: Ring | null;
  gap: number;
}

export interface PlacedTile {
  key: string;
  q: number;
  r: number;
  c: Point;
  v: Point[];
  piece: MultiPolygon;
  area: number;
  frac: number;
  full: boolean;
  holes: boolean;
  forced: boolean;
  small: boolean;
  label: string;
}

export interface WallStats {
  n: number;
  full: number;
  cut: number;
  small: number;
  area: number;
  waste: number;
}

export interface WallComp {
  g: Lattice;
  tiles: PlacedTile[];
  byKey: Map<string, PlacedTile>;
  allowed: MultiPolygon;
  base: MultiPolygon;
  zone: Ring | null;
  ox: number;
  oy: number;
  stats: WallStats;
  qmin: number;
  rmin: number;
}

export function wallAllowed(project: Pick<Project, 'tile'>, wall: Wall): WallAllowed {
  const gap = project.tile.edgeGap || 0;
  const { W, H } = wall;
  let allowed: MultiPolygon = [[[[gap, gap], [W - gap, gap], [W - gap, H], [gap, H], [gap, gap]]]];
  const obs: WallObstacleArea[] = [];
  for (const o of wall.obstacles) {
    if (!(o.w > 0 && o.h > 0)) continue;
    const x0 = o.x - gap;
    const y0 = o.y - gap;
    const x1 = o.x + o.w + gap;
    const y1 = o.y + o.h + gap;
    obs.push({ bb: [x0, y0, x1, y1], poly: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
  }
  try {
    if (obs.length) allowed = polygonClipping.difference(allowed, ...obs.map(o => o.poly)) as MultiPolygon;
  } catch (e) {
    console.warn('obstacles', e);
  }
  const zone = wall.zone.length >= 3 ? closeRing(wall.zone) : null;
  const base = allowed;
  if (wall.zoneMode === 'cut' && zone) {
    try {
      allowed = polygonClipping.intersection(allowed, [zone]) as MultiPolygon;
    } catch (e) {
      console.warn('zone', e);
    }
  }
  return { allowed, base, obs, zone, gap };
}

export interface ComputeOverride {
  ox: number;
  oy: number;
  cache?: WallAllowed;
}

// ovr : décalage d'essai pour l'optimiseur, avec la zone autorisée déjà calculée.
export function computeWall(project: Pick<Project, 'tile'>, wall: Wall, ovr?: ComputeOverride): WallComp {
  const g = latticeFor(project.tile);
  const ox = ovr ? ovr.ox : wall.ox;
  const oy = ovr ? ovr.oy : wall.oy;
  const { allowed, base, obs, zone, gap } = ovr?.cache ?? wallAllowed(project, wall);
  const { W, H } = wall;
  const rg = g.range(W, H, ox, oy);
  const zoneBB = zone && bboxPts(zone);
  const organic = wall.zoneMode !== 'cut';
  const minFrac = (project.tile.minPiece || 0) / 100;
  const tiles: PlacedTile[] = [];
  const byKey = new Map<string, PlacedTile>();

  for (let q = rg.q0; q <= rg.q1; q++) {
    for (let r = rg.r0; r <= rg.r1; r++) {
      const key = `${q},${r}`;
      const st = wall.tiles[key]?.st;
      const c = g.center(q, r, ox, oy);
      let want: boolean;
      if (st === 'del') want = false;
      else if (st === 'add') want = true;
      else if (!zone) want = false;
      else if (organic) want = pointInRing(c, zone);
      else want = true;
      if (!want) continue;

      const v = g.verts(c[0], c[1]);
      const bb = bboxPts(v);
      if (bb[2] <= 0 || bb[0] >= W || bb[3] <= 0 || bb[1] >= H) continue;
      if (!organic && st !== 'add' && zone && zoneBB && !bbOverlap(bb, zoneBB)) continue;

      const forced = !organic && st === 'add';
      const inside = bb[0] >= gap - 1e-9 && bb[2] <= W - gap + 1e-9 && bb[1] >= gap - 1e-9 && bb[3] <= H + 1e-9
        && !obs.some(o => bbOverlap(bb, o.bb))
        && (organic || forced || (!!zone && v.every(p => pointInRing(p, zone)) && !ringCrossesBB(zone, bb)));
      let piece: MultiPolygon;
      if (inside) piece = [[closeRing(v)]];
      else {
        try {
          piece = polygonClipping.intersection([closeRing(v)], forced ? base : allowed) as MultiPolygon;
        } catch (e) {
          console.warn('clip', key, e);
          piece = [];
        }
      }
      const area = mpArea(piece);
      if (area < g.area * 0.004) continue;
      const frac = Math.min(1, area / g.area);
      const holes = piece.some(p => p.length > 1);
      const full = inside || (frac > 0.999 && !holes && piece.length === 1);
      const t: PlacedTile = { key, q, r, c, v, piece, area, frac, full, holes, forced, small: !full && frac < minFrac, label: '' };
      tiles.push(t);
      byKey.set(key, t);
    }
  }

  // étiquettes : lettre = colonne, chiffre = rang (comptés depuis le bas-gauche)
  let qmin = Infinity;
  let rmin = Infinity;
  for (const t of tiles) {
    if (t.q < qmin) qmin = t.q;
    if (t.r < rmin) rmin = t.r;
  }
  for (const t of tiles) t.label = colLetters(t.q - qmin) + (t.r - rmin + 1);

  const stats: WallStats = { n: tiles.length, full: 0, cut: 0, small: 0, area: 0, waste: 0 };
  for (const t of tiles) {
    if (t.full) stats.full++;
    else stats.cut++;
    if (t.small) stats.small++;
    stats.area += t.area;
  }
  stats.waste = stats.n - stats.area / g.area;
  return { g, tiles, byKey, allowed, base, zone, ox, oy, stats, qmin, rmin };
}

// Le calcul d'un pan ne dépend que de sa géométrie : peindre ou pivoter un carreau ne le refait pas.
const compCache = new Map<string, { sig: string; comp: WallComp }>();

function wallSignature(project: Pick<Project, 'tile'>, wall: Wall): string {
  const { F, joint, orient, edgeGap, minPiece } = project.tile;
  const brushed = Object.entries(wall.tiles).filter(([, a]) => a.st).map(([k, a]) => `${k}${a.st}`).sort();
  return JSON.stringify([F, joint, orient, edgeGap, minPiece, wall.W, wall.H, wall.ox, wall.oy, wall.zoneMode, wall.zone, wall.obstacles, brushed]);
}

export function computeWalls(project: Project): WallComp[] {
  return project.walls.map(wall => {
    const sig = wallSignature(project, wall);
    const hit = compCache.get(wall.id);
    if (hit?.sig === sig) return hit.comp;
    const comp = computeWall(project, wall);
    compCache.set(wall.id, { sig, comp });
    return comp;
  });
}
