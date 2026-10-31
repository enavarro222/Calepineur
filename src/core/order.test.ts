import { describe, expect, it } from 'vitest';
import { computeWalls } from './compute';
import { ensureAssigned } from './designs';
import { latticeFor } from './lattice';
import { boxCount, orderCounts } from './order';
import { project, wall } from '../test/fixtures';

function setup(waste: number) {
  const p = project({ walls: [wall(), wall({ id: 'w2' })] });
  p.tile.waste = waste;
  const comps = computeWalls(p);
  ensureAssigned(p, comps);
  return { p, comps };
}

describe('orderCounts', () => {
  it('compte chaque carreau posé, coupé ou non', () => {
    const { p, comps } = setup(0);
    const oc = orderCounts(p, comps);
    expect(oc.total).toBe(comps[0]!.stats.n + comps[1]!.stats.n);
    expect(oc.toOrder).toBe(oc.total);
    const a = oc.per.A!;
    expect(a.walls.reduce((s, x) => s + x.full + x.cut, 0)).toBe(a.total);
  });

  it('arrondit la marge au carreau supérieur, par motif', () => {
    const { p, comps } = setup(10);
    const oc = orderCounts(p, comps);
    for (const o of Object.values(oc.per)) expect(o.order).toBe(Math.ceil(o.total * 1.1));
    expect(oc.toOrder).toBeGreaterThan(oc.total);
  });

  it('ignore un motif sans carreau', () => {
    const { p, comps } = setup(10);
    p.designs.push({ key: 'Z', name: 'Vide', img: '', color: '#000000', weight: 0 });
    expect(orderCounts(p, comps).per.Z).toMatchObject({ total: 0, order: 0 });
  });
});

describe('boxCount', () => {
  const tile = project().tile;
  const g = latticeFor(tile);

  it('reste vide sans conditionnement', () => {
    expect(boxCount(tile, g, 50)).toBeNull();
  });

  it('arrondit à la boîte supérieure', () => {
    expect(boxCount({ ...tile, perBox: 20 }, g, 50)).toEqual({ perBox: 20, boxes: 3, spare: 10 });
  });

  it('déduit la boîte de la surface', () => {
    expect(boxCount({ ...tile, m2PerBox: 1 }, g, 10)?.perBox).toBe(Math.floor(1e4 / g.area));
  });
});
