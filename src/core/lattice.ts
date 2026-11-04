// Réseau de pose. Toute la connaissance de la forme du carreau est ici : une autre forme
// ajoutera un autre constructeur derrière latticeFor, sans toucher au calcul des coupes.
import type { Point, TileSpec } from './types';

const SQ3 = Math.sqrt(3);
const mod = (a: number, n: number): number => ((a % n) + n) % n;

export interface LatticeNode {
  q: number;
  r: number;
  c: Point;
}

export interface LatticeRange {
  q0: number;
  q1: number;
  r0: number;
  r1: number;
}

export type Lattice = ReturnType<typeof hexLattice>;

function hexLattice(tile: TileSpec) {
  const F = tile.F;
  const j = tile.joint || 0;
  const R = F / SQ3; // rayon circonscrit = longueur d'un côté
  const d = F + j; // distance entre centres voisins
  const flat = tile.orient !== 'pointy';
  const base = flat ? 0 : 30; // angle du premier sommet (degrés)
  const px = flat ? d * SQ3 / 2 : d;
  const py = flat ? d : d * SQ3 / 2;

  function center(q: number, r: number, ox: number, oy: number): Point {
    return flat
      ? [ox + q * px, oy + r * d + (mod(q, 2) ? d / 2 : 0)]
      : [ox + q * d + (mod(r, 2) ? d / 2 : 0), oy + r * py];
  }

  function verts(cx: number, cy: number, rad = R): Point[] {
    const out: Point[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (base + 60 * i) * Math.PI / 180;
      out.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
    }
    return out;
  }

  function nearest(x: number, y: number, ox: number, oy: number): LatticeNode {
    let q0: number;
    let r0: number;
    if (flat) {
      q0 = Math.round((x - ox) / px);
      r0 = Math.round((y - oy - (mod(q0, 2) ? d / 2 : 0)) / d);
    } else {
      r0 = Math.round((y - oy) / py);
      q0 = Math.round((x - ox - (mod(r0, 2) ? d / 2 : 0)) / d);
    }
    let best: LatticeNode | null = null;
    let bd = Infinity;
    for (let q = q0 - 1; q <= q0 + 1; q++) {
      for (let r = r0 - 1; r <= r0 + 1; r++) {
        const c = center(q, r, ox, oy);
        const dd = (c[0] - x) ** 2 + (c[1] - y) ** 2;
        if (dd < bd) { bd = dd; best = { q, r, c }; }
      }
    }
    return best!;
  }

  function neighbors(q: number, r: number): Point[] {
    const out: Point[] = [];
    const c0 = center(q, r, 0, 0);
    for (let dq = -1; dq <= 1; dq++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (!dq && !dr) continue;
        const c = center(q + dq, r + dr, 0, 0);
        if (Math.abs(Math.hypot(c[0] - c0[0], c[1] - c0[1]) - d) < 1e-6 * d) out.push([q + dq, r + dr]);
      }
    }
    return out;
  }

  // Emplacements à deux pas au plus, avec leur éloignement : 1 = côte à côte, 2 = une colonne entre (même rangée
  // en flat, même colonne en pointy, à √3 pas), 3 = en ligne droite avec un carreau entre (2 pas).
  function near(q: number, r: number): [number, number, 1 | 2 | 3][] {
    const out: [number, number, 1 | 2 | 3][] = [];
    const c0 = center(q, r, 0, 0);
    for (let dq = -2; dq <= 2; dq++) {
      for (let dr = -2; dr <= 2; dr++) {
        if (!dq && !dr) continue;
        const c = center(q + dq, r + dr, 0, 0);
        const k = Math.hypot(c[0] - c0[0], c[1] - c0[1]) / d;
        if (k < 1.01) out.push([q + dq, r + dr, 1]);
        else if (k < 1.74) out.push([q + dq, r + dr, 2]);
        else if (k < 2.01) out.push([q + dq, r + dr, 3]);
      }
    }
    return out;
  }

  function range(W: number, H: number, ox: number, oy: number): LatticeRange {
    const m = 2;
    return {
      q0: Math.floor(-ox / px) - m,
      q1: Math.ceil((W - ox) / px) + m,
      r0: Math.floor(-oy / py) - m,
      r1: Math.ceil((H - oy) / py) + m,
    };
  }

  // Directions des alignements : vers les voisins directs, et entre deux carreaux décalés d'un rang.
  const axis = (deg: number): Point => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)];
  const nearAxes = (flat ? [30, 90, 150] : [0, 60, 120]).map(axis);
  const farAxes = (flat ? [0, 60, 120] : [30, 90, 150]).map(axis);

  return { F, j, R, d, flat, base, px, py, area: SQ3 / 2 * F * F, center, verts, nearest, neighbors, near, range, nearAxes, farAxes };
}

export const latticeFor = (tile: TileSpec): Lattice => hexLattice(tile);
