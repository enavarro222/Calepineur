// Projection du plan sur la photo calée sur 4 repères.
import { homography, mulH, type Homography } from './geom';
import type { CalibHint, CalibPoint, Point, Wall } from './types';

export const PHOTO_K = 6; // px par cm du calque projeté sur la photo

export function photoH(wall: Wall): Homography | null {
  const pts = wall.photo?.pts;
  if (pts?.length !== 4) return null;
  return homography(pts.map((p): Point => [p.wx, p.wy]), pts.map((p): Point => [p.px, p.py]));
}

export function calibPoints(calib: CalibHint[], w: number, h: number): CalibPoint[] {
  return calib.map(c => ({ wx: c.wx, wy: c.wy, px: c.u * w, py: c.v * h }));
}

export function isCalibUsable(calib: CalibHint[]): boolean {
  return homography(calib.map((c): Point => [c.wx, c.wy]), calib.map((c): Point => [c.u, c.v])) !== null;
}

// Matrice CSS du calque SVG (px, y vers le bas) vers l'image affichée à l'échelle s.
export function photoMatrix(wall: Wall, s: number): string | null {
  const Hw = photoH(wall);
  if (!Hw) return null;
  const A = [1 / PHOTO_K, 0, 0, 0, -1 / PHOTO_K, wall.H, 0, 0, 1];
  const raw = mulH([s, 0, 0, 0, s, 0, 0, 0, 1], mulH(Hw, A));
  const M = raw.map(v => v / raw[8]!);
  return `matrix3d(${M[0]},${M[3]},0,${M[6]},${M[1]},${M[4]},0,${M[7]},0,0,1,0,${M[2]},${M[5]},0,${M[8]})`;
}
