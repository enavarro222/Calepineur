import { describe, expect, it } from 'vitest';
import { near } from '../test/near';
import { latticeFor } from './lattice';
import { project } from '../test/fixtures';
import type { Orient } from './types';

const lattice = (orient: Orient) => latticeFor({ ...project().tile, orient });

describe.each<Orient>(['flat', 'pointy'])('réseau hexagonal %s', orient => {
  const g = lattice(orient);

  it('a 6 voisins à une distance d', () => {
    for (const [q, r] of [[0, 0], [1, 0], [0, 1], [3, -2]] as const) {
      const c = g.center(q, r, 0, 0);
      const ns = g.neighbors(q, r);
      expect(ns).toHaveLength(6);
      for (const [nq, nr] of ns) {
        const n = g.center(nq, nr, 0, 0);
        expect(Math.hypot(n[0] - c[0], n[1] - c[1])).toBeCloseTo(g.d, 6);
      }
    }
  });

  it('distingue la même rangée des biais à √3', () => {
    const c = g.center(3, -2, 0, 0);
    const ns = near(g, 3, -2);
    // 6 voisins, 2 à une colonne d'écart sur la même rangée, 4 à √3 en biais et 6 à deux pas en ligne droite
    expect([1, 2, 3].map(lvl => ns.filter(n => n[2] === lvl).length)).toEqual([6, 2, 10]);
    for (const [nq, nr, lvl] of ns) {
      const n = g.center(nq, nr, 0, 0);
      const k = Math.hypot(n[0] - c[0], n[1] - c[1]) / g.d;
      if (lvl === 1) expect(k).toBeCloseTo(1, 6);
      if (lvl === 2) {
        expect(k).toBeCloseTo(Math.sqrt(3), 6);
        expect(orient === 'flat' ? n[1] - c[1] : n[0] - c[0]).toBeCloseTo(0, 6);
      }
      if (lvl === 3) expect([Math.sqrt(3), 2].some(x => Math.abs(k - x) < 1e-6)).toBe(true);
    }
  });

  it('retrouve le carreau le plus proche', () => {
    const c = g.center(3, 2, 5, -4);
    const n = g.nearest(c[0] + 1, c[1] - 1, 5, -4);
    expect([n.q, n.r]).toEqual([3, 2]);
  });

  it('a la largeur plat à plat demandée', () => {
    const v = g.verts(0, 0);
    const across = orient === 'flat'
      ? Math.max(...v.map(p => p[1])) - Math.min(...v.map(p => p[1]))
      : Math.max(...v.map(p => p[0])) - Math.min(...v.map(p => p[0]));
    expect(across).toBeCloseTo(g.F, 6);
  });

  it('couvre tout le mur dans sa plage', () => {
    const rg = g.range(100, 60, 8, 7);
    for (const [x, y] of [[0, 0], [100, 60], [0, 60], [100, 0]] as const) {
      const n = g.nearest(x, y, 8, 7);
      expect(n.q).toBeGreaterThanOrEqual(rg.q0);
      expect(n.q).toBeLessThanOrEqual(rg.q1);
      expect(n.r).toBeGreaterThanOrEqual(rg.r0);
      expect(n.r).toBeLessThanOrEqual(rg.r1);
    }
  });
});

it('calcule la surface d\'un carreau', () => {
  expect(lattice('flat').area).toBeCloseTo(Math.sqrt(3) / 2 * 100, 6);
});
