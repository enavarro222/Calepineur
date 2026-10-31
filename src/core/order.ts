// Quantités à commander.
import type { WallComp } from './compute';
import type { Lattice } from './lattice';
import type { Project, TileSpec } from './types';

export interface DesignOrder {
  walls: { full: number; cut: number }[];
  total: number;
  order: number;
}

export interface OrderCounts {
  per: Record<string, DesignOrder>;
  total: number;
  toOrder: number;
}

export function orderCounts(project: Project, comps: WallComp[]): OrderCounts {
  const per: Record<string, DesignOrder> = {};
  project.designs.forEach(d => {
    per[d.key] = { walls: project.walls.map(() => ({ full: 0, cut: 0 })), total: 0, order: 0 };
  });
  project.walls.forEach((w, i) => comps[i]!.tiles.forEach(t => {
    const d = w.tiles[t.key]?.d;
    const p = d ? per[d] : undefined;
    if (!p) return;
    p.walls[i]![t.full ? 'full' : 'cut']++;
    p.total++;
  }));
  const waste = (project.tile.waste || 0) / 100;
  let total = 0;
  let toOrder = 0;
  for (const p of Object.values(per)) {
    p.order = p.total ? Math.ceil(p.total * (1 + waste)) : 0;
    total += p.total;
    toOrder += p.order;
  }
  return { per, total, toOrder };
}

export interface BoxCount {
  perBox: number;
  boxes: number;
  spare: number;
}

// La taille de boîte vient du nombre de carreaux ou, à défaut, de la surface par boîte.
export function boxCount(tile: TileSpec, g: Lattice, toOrder: number): BoxCount | null {
  const perBox = tile.perBox > 0 ? tile.perBox : tile.m2PerBox > 0 ? Math.floor(tile.m2PerBox * 1e4 / g.area) : 0;
  if (!perBox) return null;
  const boxes = Math.ceil(toOrder / perBox);
  return { perBox, boxes, spare: boxes * perBox - toOrder };
}
