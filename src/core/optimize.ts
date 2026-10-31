// Recherche du décalage de grille qui gâche le moins de carreaux et évite les petites coupes.
import { computeWall, wallAllowed, type WallStats } from './compute';
import { latticeFor } from './lattice';
import type { Project, Wall } from './types';

export const gridScore = (s: WallStats): number => s.waste + 1.2 * s.small + 0.05 * s.cut;

export interface GridResult {
  ox: number;
  oy: number;
  before: WallStats;
  after: WallStats;
}

export function optimizeGrid(project: Project, wall: Wall, both: boolean): GridResult | null {
  const g = latticeFor(project.tile);
  const cache = wallAllowed(project, wall);
  const perX = g.flat ? g.px : g.d;
  const perY = g.flat ? g.d : g.py;
  const NX = both ? 16 : 40;
  const NY = both ? 12 : 1;
  let best: { sc: number; ox: number; oy: number; stats: WallStats } | null = null;
  for (let a = 0; a < NX; a++) {
    for (let b = 0; b < NY; b++) {
      const ox = wall.ox - perX / 2 + perX * a / NX;
      const oy = both ? wall.oy - perY / 2 + perY * b / NY : wall.oy;
      const { stats } = computeWall(project, wall, { ox, oy, cache });
      const sc = gridScore(stats);
      if (!best || sc < best.sc - 1e-6) best = { sc, ox, oy, stats };
    }
  }
  const before = computeWall(project, wall).stats;
  if (!best || gridScore(before) <= best.sc + 1e-6) return null;
  return { ox: best.ox, oy: best.oy, before, after: best.stats };
}
