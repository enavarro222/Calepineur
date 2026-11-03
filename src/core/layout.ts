// Pans reliés par un angle : chaque pan prolonge le précédent, comme une crédence dépliée à plat.
import type { Wall } from './types';

type WallEdge = Pick<Wall, 'W' | 'ox' | 'oy' | 'joinPrev' | 'joinDy'>;

const RACCORD_TOLERANCE = 0.05; // cm

// Hauteur du bas du pan au-dessus du bas du précédent : un point à y sur ce pan est à y + joinDy sur le précédent.
export const joinDy = (w: Pick<Wall, 'joinDy'>): number => w.joinDy ?? 0;

// Le bord gauche du pan touche-t-il le bord droit du pan précédent ? Sans réglage, une grille raccordée vaut un angle.
export function joinsPrevious(walls: WallEdge[], i: number): boolean {
  const w = walls[i];
  const prev = walls[i - 1];
  if (!w || !prev) return false;
  if (w.joinPrev !== undefined) return w.joinPrev;
  return Math.abs(w.ox - (prev.ox - prev.W)) < RACCORD_TOLERANCE && Math.abs(w.oy - (prev.oy - joinDy(w))) < RACCORD_TOLERANCE;
}

export interface WallPlace {
  run: number; // suite de pans reliés
  x0: number; // abscisse du bord gauche du pan, dans sa suite dépliée
  y0: number; // hauteur de son bas, par rapport au bas du premier pan de la suite
}

export function unfold(walls: WallEdge[]): WallPlace[] {
  const places: WallPlace[] = [];
  walls.forEach((w, i) => {
    const prev = places[i - 1];
    places.push(prev && joinsPrevious(walls, i)
      ? { run: prev.run, x0: prev.x0 + walls[i - 1]!.W, y0: prev.y0 + joinDy(w) }
      : { run: (prev?.run ?? -1) + 1, x0: 0, y0: 0 });
  });
  return places;
}
