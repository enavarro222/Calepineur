// Pans reliés par un angle : chaque pan prolonge le précédent, comme une crédence dépliée à plat.
import type { Wall } from './types';

type WallEdge = Pick<Wall, 'W' | 'ox' | 'oy' | 'joinPrev'>;

const RACCORD_TOLERANCE = 0.05; // cm

// Le bord gauche du pan touche-t-il le bord droit du pan précédent ? Sans réglage, une grille raccordée vaut un angle.
export function joinsPrevious(walls: WallEdge[], i: number): boolean {
  const w = walls[i];
  const prev = walls[i - 1];
  if (!w || !prev) return false;
  if (w.joinPrev !== undefined) return w.joinPrev;
  return Math.abs(w.ox - (prev.ox - prev.W)) < RACCORD_TOLERANCE && Math.abs(w.oy - prev.oy) < RACCORD_TOLERANCE;
}

export interface WallPlace {
  run: number; // suite de pans reliés
  x0: number; // abscisse du bord gauche du pan, dans sa suite dépliée
}

export function unfold(walls: WallEdge[]): WallPlace[] {
  const places: WallPlace[] = [];
  walls.forEach((_, i) => {
    const prev = places[i - 1];
    places.push(prev && joinsPrevious(walls, i) ? { run: prev.run, x0: prev.x0 + walls[i - 1]!.W } : { run: (prev?.run ?? -1) + 1, x0: 0 });
  });
  return places;
}
