import { describe, expect, it } from 'vitest';
import { computeWall } from './compute';
import { gridScore, optimizeGrid } from './optimize';
import { project, wall } from '../test/fixtures';

describe('optimizeGrid', () => {
  it('améliore une grille mal placée', () => {
    const p = project();
    const w = wall({ ox: 3.3, oy: 2.1 });
    const r = optimizeGrid(p, w, true)!;
    expect(gridScore(r.after)).toBeLessThan(gridScore(r.before));
    expect(computeWall(p, { ...w, ox: r.ox, oy: r.oy }).stats).toEqual(r.after);
  });

  it('ne touche pas à une grille déjà optimale', () => {
    const p = project();
    const w = wall({ ox: 3.3, oy: 2.1 });
    const first = optimizeGrid(p, w, false)!;
    expect(optimizeGrid(p, { ...w, ox: first.ox }, false)).toBeNull();
  });
});
