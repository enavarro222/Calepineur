import { describe, expect, it } from 'vitest';
import { computeWall, computeWalls } from './compute';
import { project, wall } from '../test/fixtures';
import type { Wall } from './types';

const compute = (over: Partial<Wall> = {}) => computeWall(project(), wall(over));

describe('computeWall', () => {
  it('pose tout le mur quand la zone le déborde', () => {
    const c = compute();
    expect(c.stats.n).toBeGreaterThan(40);
    expect(c.stats.full + c.stats.cut).toBe(c.stats.n);
    // la surface carrelée ne dépasse jamais le mur, et le couvre presque (joints mis à part)
    expect(c.stats.area).toBeLessThan(100 * 60);
    expect(c.stats.area).toBeGreaterThan(100 * 60 * 0.9);
  });

  it('coupe les carreaux aux bords du mur', () => {
    for (const t of compute().tiles) {
      for (const poly of t.piece) for (const ring of poly) for (const [x, y] of ring) {
        expect(x).toBeGreaterThanOrEqual(-1e-9);
        expect(x).toBeLessThanOrEqual(100 + 1e-9);
        expect(y).toBeGreaterThanOrEqual(-1e-9);
        expect(y).toBeLessThanOrEqual(60 + 1e-9);
      }
    }
  });

  it('respecte le retrait aux bords durs', () => {
    const p = project();
    p.tile.edgeGap = 1;
    const c = computeWall(p, wall());
    const minY = Math.min(...c.tiles.flatMap(t => t.piece.flat(2).map(q => q[1])));
    expect(minY).toBeGreaterThanOrEqual(1 - 1e-9);
  });

  it('ne pose rien dans un élément', () => {
    const c = compute({ obstacles: [{ name: 'Fenêtre', x: 30, y: 20, w: 40, h: 30 }] });
    for (const t of c.tiles) {
      for (const [x, y] of t.piece.flat(2)) {
        expect(x > 30 + 1e-6 && x < 70 - 1e-6 && y > 20 + 1e-6 && y < 50 - 1e-6).toBe(false);
      }
    }
  });

  it('garde des carreaux entiers en bord organique', () => {
    const zone: Wall['zone'] = [[-10, -10], [-10, 30], [110, 30], [110, -10]];
    const c = compute({ zone });
    const top = c.tiles.filter(t => t.c[1] > 25 && t.c[0] > 10 && t.c[0] < 90);
    expect(top.length).toBeGreaterThan(0);
    expect(top.every(t => t.full)).toBe(true);
    expect(Math.max(...c.tiles.map(t => t.c[1]))).toBeLessThanOrEqual(30);
  });

  it('recoupe sur le contour en bord coupé net', () => {
    const zone: Wall['zone'] = [[-10, -10], [-10, 30], [110, 30], [110, -10]];
    const c = compute({ zone, zoneMode: 'cut' });
    const maxY = Math.max(...c.tiles.flatMap(t => t.piece.flat(2).map(q => q[1])));
    expect(maxY).toBeCloseTo(30, 6);
    expect(c.stats.cut).toBeGreaterThan(0);
  });

  it('n\'étiquette qu\'une fois chaque carreau, depuis le bas-gauche', () => {
    const c = compute();
    expect(new Set(c.tiles.map(t => t.label)).size).toBe(c.tiles.length);
    const first = c.tiles.find(t => t.q === c.qmin && t.r === c.rmin);
    expect(first?.label).toBe('A1');
  });

  it('signale les petites coupes selon le seuil', () => {
    const p = project();
    p.tile.minPiece = 60;
    const c = computeWall(p, wall());
    expect(c.stats.small).toBe(c.tiles.filter(t => !t.full && t.frac < 0.6).length);
    expect(c.stats.small).toBeGreaterThan(0);
  });

  it('retourne un pan vide sans zone', () => {
    expect(compute({ zone: [] }).stats.n).toBe(0);
  });
});

describe('retouches au pinceau', () => {
  const emptySlot = (zoneMode: Wall['zoneMode']) => {
    const zone: Wall['zone'] = [[-10, -10], [-10, 30], [110, 30], [110, -10]];
    const c = computeWall(project(), wall({ zone, zoneMode }));
    const { q, r } = c.g.nearest(50, 50, c.ox, c.oy);
    return { zone, key: `${q},${r}`, n: c.stats.n };
  };

  it('retire un carreau', () => {
    const before = compute();
    const key = before.tiles[10]!.key;
    const c = compute({ tiles: { [key]: { st: 'del' } } });
    expect(c.stats.n).toBe(before.stats.n - 1);
    expect(c.byKey.has(key)).toBe(false);
  });

  it('ajoute un carreau en bord organique', () => {
    const { zone, key, n } = emptySlot('organic');
    const c = compute({ zone, tiles: { [key]: { st: 'add' } } });
    expect(c.stats.n).toBe(n + 1);
    expect(c.byKey.get(key)?.forced).toBe(false);
  });

  // Régression : en coupé net, un carreau ajouté était recoupé par la zone et disparaissait.
  it('garde entier un carreau ajouté hors zone en coupé net', () => {
    const { zone, key, n } = emptySlot('cut');
    const c = compute({ zone, zoneMode: 'cut', tiles: { [key]: { st: 'add' } } });
    const t = c.byKey.get(key);
    expect(c.stats.n).toBe(n + 1);
    expect(t?.forced).toBe(true);
    expect(t?.frac).toBeCloseTo(1, 6);
  });

  it('recoupe quand même un carreau ajouté par les éléments', () => {
    const { zone, key } = emptySlot('cut');
    const obstacles = [{ name: 'Prise', x: 50, y: 50, w: 20, h: 20 }];
    const c = compute({ zone, zoneMode: 'cut', obstacles, tiles: { [key]: { st: 'add' } } });
    expect(c.byKey.get(key)?.frac ?? 0).toBeLessThan(1);
  });
});

describe('computeWalls', () => {
  it('réutilise le calcul si seule la décoration change', () => {
    const p = project();
    const [a] = computeWalls(p);
    const painted = project({ walls: [wall({ tiles: { '0,0': { d: 'B', lk: true } } })] });
    expect(computeWalls(painted)[0]).toBe(a);
  });

  it('recalcule quand la géométrie change', () => {
    const [a] = computeWalls(project());
    const [b] = computeWalls(project({ walls: [wall({ tiles: { '0,0': { st: 'del' } } })] }));
    expect(b).not.toBe(a);
    expect(b!.stats.n).toBe(a!.stats.n - 1);
  });
});
