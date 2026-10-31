// Polygones, homographie et petits utilitaires numériques.
import type { BBox, MultiPolygon, Point, Ring } from './types';

export function closeRing(pts: readonly Point[]): Ring {
  const r = pts.map(p => [p[0], p[1]] as Point);
  const a = r[0]!;
  const b = r[r.length - 1]!;
  if (a[0] !== b[0] || a[1] !== b[1]) r.push([a[0], a[1]]);
  return r;
}

export function ringArea(r: readonly Point[]): number {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % n]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function mpArea(mp: MultiPolygon): number {
  let a = 0;
  for (const poly of mp) poly.forEach((ring, i) => { a += (i ? -1 : 1) * Math.abs(ringArea(ring)); });
  return a;
}

export function ringCentroid(r: readonly Point[]): Point {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % n]!;
    const k = p[0] * q[1] - q[0] * p[1];
    a += k;
    cx += (p[0] + q[0]) * k;
    cy += (p[1] + q[1]) * k;
  }
  if (Math.abs(a) < 1e-9) return r[0]!;
  return [cx / (3 * a), cy / (3 * a)];
}

export function mpCentroid(mp: MultiPolygon): Point | null {
  let best: Ring | null = null;
  let ba = -1;
  for (const poly of mp) {
    const outer = poly[0]!;
    const a = Math.abs(ringArea(outer));
    if (a > ba) { ba = a; best = outer; }
  }
  return best ? ringCentroid(best) : null;
}

export function pointInRing(pt: Point, ring: readonly Point[]): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function bboxPts(pts: readonly Point[]): BBox {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

export const bbOverlap = (a: BBox, b: BBox): boolean => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

export function ringCrossesBB(ring: readonly Point[], bb: BBox): boolean {
  for (let i = 0; i < ring.length - 1; i++) {
    const s = bboxPts([ring[i]!, ring[i + 1]!]);
    if (s[0] <= bb[2] && s[2] >= bb[0] && s[1] <= bb[3] && s[3] >= bb[1]) return true;
  }
  return false;
}

export function distToSeg(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// ---- homographie (4 points) ----
export type Homography = number[]; // 9 coefficients, ligne par ligne

function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (Math.abs(M[p]![c]!) < 1e-12) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

export function homography(src: readonly Point[], dst: readonly Point[]): Homography | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]!;
    const [u, v] = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  return h ? [...h, 1] : null;
}

export function applyH(H: Homography, p: Point): Point {
  const [a, b, c, d, e, f, g, h, i] = H as [number, number, number, number, number, number, number, number, number];
  const w = g * p[0] + h * p[1] + i;
  return [(a * p[0] + b * p[1] + c) / w, (d * p[0] + e * p[1] + f) / w];
}

export function mulH(A: Homography, B: Homography): Homography {
  const C = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) C[i * 3 + j]! += A[i * 3 + k]! * B[k * 3 + j]!;
    }
  }
  return C;
}

export function invH(m: Homography): Homography | null {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) return null;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

// ---- divers ----
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function colLetters(index: number): string {
  let s = '';
  let i = index + 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

export const round1 = (v: number): number => Math.round(v * 10) / 10;
export const snap = (v: number, step = 0.5): number => Math.round(v / step) * step;
