import type { Lattice } from '../core/lattice';

// Emplacements à deux pas au plus autour de (q, r), avec leur éloignement : 1 = côte à côte, 2 = une colonne entre sur
// la même rangée, 3 = à √3 en biais ou en ligne droite avec un carreau entre.
export function near(g: Lattice, q: number, r: number): [number, number, 1 | 2 | 3][] {
  const out: [number, number, 1 | 2 | 3][] = [];
  const c0 = g.center(q, r, 0, 0);
  for (let dq = -2; dq <= 2; dq++) {
    for (let dr = -2; dr <= 2; dr++) {
      if (!dq && !dr) continue;
      const c = g.center(q + dq, r + dr, 0, 0);
      const k = Math.hypot(c[0] - c0[0], c[1] - c0[1]) / g.d;
      if (k < 1.01) out.push([q + dq, r + dr, 1]);
      else if (k < 1.74) out.push([q + dq, r + dr, g.isRow(c[0] - c0[0], c[1] - c0[1]) ? 2 : 3]);
      else if (k < 2.01) out.push([q + dq, r + dr, 3]);
    }
  }
  return out;
}
