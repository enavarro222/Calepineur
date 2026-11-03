// Projection du plan sur la photo calée sur 4 repères.
import { applyH, homography, mulH, type Homography } from './geom';
import type { CalibHint, CalibPoint, Point, Wall } from './types';

export const PHOTO_K = 6; // px par cm du calque projeté sur la photo

export function calibH(pts: CalibPoint[] | undefined): Homography | null {
  if (pts?.length !== 4) return null;
  return homography(pts.map((p): Point => [p.wx, p.wy]), pts.map((p): Point => [p.px, p.py]));
}

export const photoH = (wall: Wall): Homography | null => calibH(wall.photo?.pts);

export function calibPoints(calib: CalibHint[], w: number, h: number): CalibPoint[] {
  return calib.map(c => ({ wx: c.wx, wy: c.wy, px: c.u * w, py: c.v * h }));
}

export function isCalibUsable(calib: CalibHint[]): boolean {
  return homography(calib.map((c): Point => [c.wx, c.wy]), calib.map((c): Point => [c.u, c.v])) !== null;
}

// Matrice CSS du calque SVG d'un pan de hauteur H (px, y vers le bas) vers l'image affichée à l'échelle s.
export function calibMatrix(pts: CalibPoint[] | undefined, H: number, s: number): string | null {
  const Hw = calibH(pts);
  if (!Hw) return null;
  const A = [1 / PHOTO_K, 0, 0, 0, -1 / PHOTO_K, H, 0, 0, 1];
  const raw = mulH([s, 0, 0, 0, s, 0, 0, 0, 1], mulH(Hw, A));
  const M = raw.map(v => v / raw[8]!);
  return `matrix3d(${M[0]},${M[3]},0,${M[6]},${M[1]},${M[4]},0,${M[7]},0,0,1,0,${M[2]},${M[5]},0,${M[8]})`;
}

export const photoMatrix = (wall: Wall, s: number): string | null => calibMatrix(wall.photo?.pts, wall.H, s);

// Deux pans reliés par un angle partagent une arête : sur une même photo, elle doit tomber au même endroit pour les deux.
// Les deux repères du pan les plus proches de l'angle passent sur cette arête, en bas et en haut, projetés par le calage
// du voisin ; les deux autres restent où ils sont. `side` : côté du pan où se trouve le voisin.
export function joinCalib(pts: CalibPoint[], wall: Pick<Wall, 'W' | 'H'>, side: 'left' | 'right', near: CalibPoint[], neighbour: Pick<Wall, 'W' | 'H'>): CalibPoint[] | null {
  const Hn = calibH(near);
  if (!Hn || pts.length !== 4) return null;
  const ex = side === 'left' ? 0 : wall.W;
  const nx = side === 'left' ? neighbour.W : 0;
  const top = Math.min(wall.H, neighbour.H);
  const [a, b] = pts.map((p, k) => ({ k, d: Math.abs(p.wx - ex), wy: p.wy })).sort((u, v) => u.d - v.d || u.k - v.k);
  const [low, high] = a!.wy <= b!.wy ? [a!.k, b!.k] : [b!.k, a!.k];
  const onEdge = (wy: number): CalibPoint => {
    const [px, py] = applyH(Hn, [nx, wy]);
    return { wx: ex, wy, px, py };
  };
  const out = pts.map((p, k) => (k === low ? onEdge(0) : k === high ? onEdge(top) : { ...p }));
  return calibH(out) ? out : null;
}

// Repères de départ d'un pan sur une photo w × h : ses coins, dans un rectangle de la photo.
export function defaultCalib(wall: Pick<Wall, 'W' | 'H'>, w: number, h: number, u0 = 0.15, u1 = 0.85): CalibPoint[] {
  const H = Math.min(wall.H, 80);
  return [
    { wx: 0, wy: 0, px: w * u0, py: h * 0.75 },
    { wx: wall.W, wy: 0, px: w * u1, py: h * 0.75 },
    { wx: wall.W, wy: H, px: w * u1, py: h * 0.4 },
    { wx: 0, wy: H, px: w * u0, py: h * 0.4 },
  ];
}
