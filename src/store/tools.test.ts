import { beforeEach, describe, expect, it } from 'vitest';
import { commit, getComps, getProject, getUi, replaceProject, resetStore, setUi, undo, useStore, type Tool } from './store';
import { hoverInfo, isDragging, moveDrag, press, release, type StagePoint } from './tools';
import { project, wall } from '../test/fixtures';
import type { Point, Wall } from '../core/types';

const LEFT = { button: 0, altKey: false };
const RIGHT = { button: 2, altKey: false };
const at = (w: Point): StagePoint => ({ w, tol: 3 });
const zone: Point[] = [[-10, -10], [-10, 30], [110, 30], [110, -10]];

function use(tool: Tool, over: Partial<Wall> = {}) {
  replaceProject(project({ walls: [wall({ zone, ...over })] }));
  useStore.setState({ past: [], future: [] });
  setUi({ tool });
}

const stats = () => getComps()[0]!.stats;
const tiles = () => getProject().walls[0]!.tiles;
const keyAt = (x: number, y: number) => {
  const c = getComps()[0]!;
  const n = c.g.nearest(x, y, c.ox, c.oy);
  return `${n.q},${n.r}`;
};

beforeEach(() => {
  release();
  resetStore();
});

describe('Peindre', () => {
  it('peint et verrouille un carreau', () => {
    use('paint');
    setUi({ design: 'C' });
    press(0, at([20, 15]), LEFT);
    release();
    expect(tiles()[keyAt(20, 15)]).toMatchObject({ d: 'C', lk: true });
  });

  it('peint tout le tracé en une seule annulation', () => {
    use('paint');
    setUi({ design: 'C' });
    press(0, at([10, 15]), LEFT);
    for (const x of [20, 30, 40]) moveDrag(0, at([x, 15]));
    release();
    expect(tiles()[keyAt(40, 15)]?.d).toBe('C');
    expect(useStore.getState().past).toHaveLength(1);
    undo();
    expect(tiles()[keyAt(40, 15)]?.lk).toBeUndefined();
  });

  it('ignore le clic droit et l\'extérieur du mur', () => {
    use('paint');
    expect(press(0, at([20, 15]), RIGHT)).toBe(false);
    press(0, at([500, 500]), LEFT);
    release();
    expect(Object.values(tiles()).some(a => a.lk)).toBe(false);
  });
});

describe('Pivoter', () => {
  it('tourne par 60° et fait le tour', () => {
    use('rotate');
    const key = keyAt(20, 15);
    press(0, at([20, 15]), LEFT);
    expect(tiles()[key]).toMatchObject({ rot: 1, lk: true });
    for (let n = 0; n < 5; n++) press(0, at([20, 15]), LEFT);
    expect(tiles()[key]?.rot).toBe(0);
  });

  it('ne capture pas le pointeur', () => {
    use('rotate');
    expect(press(0, at([20, 15]), LEFT)).toBe(false);
  });
});

describe('Échanger', () => {
  const designAt = (x: number, y: number) => tiles()[keyAt(x, y)]?.d;

  it('intervertit deux carreaux et les verrouille', () => {
    use('swap');
    useStore.setState({ past: [] });
    const [a, b] = [designAt(20, 15), designAt(60, 15)];
    expect(a).not.toBe(b);
    expect(press(0, at([20, 15]), LEFT)).toBe(false);
    expect(getUi().swapFrom?.key).toBe(keyAt(20, 15));
    press(0, at([60, 15]), LEFT);
    expect([designAt(20, 15), designAt(60, 15)]).toEqual([b, a]);
    expect(tiles()[keyAt(20, 15)]?.lk).toBe(true);
    expect(tiles()[keyAt(60, 15)]?.lk).toBe(true);
    expect(getUi().swapFrom).toBeNull();
    expect(useStore.getState().past).toHaveLength(1);
  });

  it('garde les quantités', () => {
    use('swap');
    const counts = () => Object.values(tiles()).map(t => t.d).sort();
    const before = counts();
    press(0, at([20, 15]), LEFT);
    press(0, at([60, 15]), LEFT);
    expect(counts()).toEqual(before);
  });

  it('échange aussi la rotation', () => {
    use('swap');
    commit(p => { p.walls[0]!.tiles[keyAt(20, 15)]!.rot = 2; });
    press(0, at([20, 15]), LEFT);
    press(0, at([60, 15]), LEFT);
    expect(tiles()[keyAt(60, 15)]?.rot).toBe(2);
  });

  it('s\'annule d\'un coup', () => {
    use('swap');
    const a = designAt(20, 15);
    press(0, at([20, 15]), LEFT);
    press(0, at([60, 15]), LEFT);
    undo();
    expect(designAt(20, 15)).toBe(a);
  });

  it('désélectionne avec un second clic sur le même carreau', () => {
    use('swap');
    press(0, at([20, 15]), LEFT);
    press(0, at([20, 15]), LEFT);
    expect(getUi().swapFrom).toBeNull();
  });

  it('ignore les emplacements vides', () => {
    use('swap');
    press(0, at([20, 50]), LEFT);
    expect(getUi().swapFrom).toBeNull();
  });

  it('signale deux motifs identiques', () => {
    use('swap');
    const key = keyAt(60, 15);
    commit(p => { p.walls[0]!.tiles[key]!.d = p.walls[0]!.tiles[keyAt(20, 15)]!.d; });
    const past = useStore.getState().past.length;
    press(0, at([20, 15]), LEFT);
    press(0, at([60, 15]), LEFT);
    expect(useStore.getState().toast?.msg).toMatch(/même motif/);
    expect(useStore.getState().past).toHaveLength(past);
  });
});

describe('Pinceau zone', () => {
  it('retire en partant d\'un carreau posé', () => {
    use('toggle');
    const n = stats().n;
    press(0, at([20, 15]), LEFT);
    moveDrag(0, at([40, 15]));
    release();
    expect(stats().n).toBeLessThan(n - 1);
  });

  it('ajoute en partant d\'un emplacement vide', () => {
    use('toggle');
    const n = stats().n;
    press(0, at([20, 50]), LEFT);
    moveDrag(0, at([40, 50]));
    release();
    expect(stats().n).toBeGreaterThan(n + 1);
  });

  it('retire toujours au clic droit', () => {
    use('toggle');
    const n = stats().n;
    press(0, at([20, 15]), RIGHT);
    release();
    expect(stats().n).toBe(n - 1);
    expect(tiles()[keyAt(20, 15)]?.st).toBe('del');
  });

  it('un clic contraire annule la retouche sans en créer une autre', () => {
    use('toggle');
    const n = stats().n;
    press(0, at([20, 15]), LEFT);
    release();
    const key = keyAt(20, 15);
    press(0, at([20, 15]), LEFT);
    release();
    expect(stats().n).toBe(n);
    expect(tiles()[key]?.st).toBeUndefined();
  });

  it('reste annulable d\'un coup', () => {
    use('toggle');
    const n = stats().n;
    press(0, at([20, 50]), LEFT);
    moveDrag(0, at([60, 50]));
    release();
    undo();
    expect(stats().n).toBe(n);
  });
});

describe('Contour zone', () => {
  it('déplace un point, calé au demi-centimètre', () => {
    use('zone');
    expect(press(0, at([-10, 30]), LEFT)).toBe(true);
    moveDrag(0, at([5.2, 44.9]));
    release();
    expect(getProject().walls[0]!.zone[1]).toEqual([5, 45]);
  });

  it('limite la position autour du mur', () => {
    use('zone');
    press(0, at([-10, 30]), LEFT);
    moveDrag(0, at([-500, 500]));
    release();
    expect(getProject().walls[0]!.zone[1]).toEqual([-30, 90]);
  });

  it('ajoute un point en tirant un milieu', () => {
    use('zone');
    press(0, at([50, 30]), LEFT);
    moveDrag(0, at([50, 45]));
    release();
    const z = getProject().walls[0]!.zone;
    expect(z).toHaveLength(5);
    expect(z[2]).toEqual([50, 45]);
  });

  it('supprime un point au clic droit, mais garde un triangle', () => {
    use('zone');
    press(0, at([-10, 30]), RIGHT);
    expect(getProject().walls[0]!.zone).toHaveLength(3);
    press(0, at([110, 30]), RIGHT);
    expect(getProject().walls[0]!.zone).toHaveLength(3);
  });

  it('ignore un clic loin du contour', () => {
    use('zone');
    expect(press(0, at([50, 10]), LEFT)).toBe(false);
  });
});

describe('Éléments', () => {
  const obstacles = [{ name: 'Prise', x: 40, y: 10, w: 20, h: 10 }];

  it('déplace un élément', () => {
    use('obst', { obstacles });
    expect(press(0, at([50, 15]), LEFT)).toBe(true);
    moveDrag(0, at([60, 25]));
    release();
    expect(getProject().walls[0]!.obstacles[0]).toMatchObject({ x: 50, y: 20, w: 20, h: 10 });
  });

  it('redimensionne par un coin, même en le retournant', () => {
    use('obst', { obstacles });
    press(0, at([60, 20]), LEFT);
    moveDrag(0, at([30, 5]));
    release();
    expect(getProject().walls[0]!.obstacles[0]).toMatchObject({ x: 30, y: 5, w: 10, h: 5 });
  });

  it('ignore un clic à côté', () => {
    use('obst', { obstacles });
    expect(press(0, at([5, 50]), LEFT)).toBe(false);
  });
});

describe('Grille', () => {
  it('décale la grille du déplacement', () => {
    use('grid');
    press(0, at([20, 15]), LEFT);
    moveDrag(0, at([23, 13]));
    release();
    expect(getProject().walls[0]).toMatchObject({ ox: 11, oy: 5 });
  });
});

describe('Caler la photo', () => {
  const photo = {
    src: 'img:a', opacity: 1, blend: true,
    pts: [
      { wx: 0, wy: 0, px: 100, py: 500 }, { wx: 100, wy: 0, px: 900, py: 500 },
      { wx: 100, wy: 60, px: 900, py: 100 }, { wx: 0, wy: 60, px: 100, py: 100 },
    ],
  };

  it('déplace le repère le plus proche', () => {
    use('calib', { photo });
    expect(press(0, { w: null, tol: 0, nat: [104, 498], s: 1 }, LEFT)).toBe(true);
    moveDrag(0, { w: null, tol: 0, nat: [120.04, 480.06], s: 1 });
    release();
    expect(getProject().walls[0]!.photo!.pts[0]).toMatchObject({ px: 120, py: 480.1 });
  });

  it('exige de cliquer près d\'une pastille', () => {
    use('calib', { photo });
    expect(press(0, { w: null, tol: 0, nat: [500, 300], s: 1 }, LEFT)).toBe(false);
    expect(isDragging()).toBe(false);
  });
});

describe('Survol', () => {
  it('décrit le carreau survolé', () => {
    use('paint');
    const h = hoverInfo(0, at([20, 15]), false)!;
    expect(h.label).toMatch(/^[A-Z]+\d+$/);
    expect(h.text).toContain('entier');
    expect(h.points).toHaveLength(6);
  });

  it('montre les emplacements vides au pinceau seulement', () => {
    use('paint');
    expect(hoverInfo(0, at([20, 50]), false)?.points).toBeNull();
    setUi({ tool: 'toggle' });
    expect(hoverInfo(0, at([20, 50]), false)?.text).toContain('emplacement vide');
  });

  it('ne dit rien pendant le calage', () => {
    use('calib');
    expect(hoverInfo(0, at([20, 15]), false)).toBeNull();
  });
});

it('une action ordinaire pendant un tracé n\'est pas perdue', () => {
  use('paint');
  press(0, at([20, 15]), LEFT);
  commit(p => { p.name = 'Pendant'; });
  release();
  expect(getProject().name).toBe('Pendant');
});
