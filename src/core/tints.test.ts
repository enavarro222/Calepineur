import { describe, expect, it } from 'vitest';
import { computeWalls } from './compute';
import { ensureAssigned } from './designs';
import { hasTints, tintBalance, tintColor, tintFit, wallStarts } from './tints';
import type { Design, TintSpot } from './types';
import { project, wall } from '../test/fixtures';

const RED = '#b03a2e';
const BLUE = '#2e4f8f';
const design = (key: string, color: string): Design => ({ key, name: key, img: '', color, weight: 1 });
const two = (spots: TintSpot[], sharpness = 0.3) => project({
  designs: [design('R', RED), design('B', BLUE)],
  walls: [wall({ id: 'w1', W: 100 }), wall({ id: 'w2', W: 100 })],
  tints: { spots, sharpness },
});

describe('Mes teintes', () => {
  it('met les pans bout à bout', () => {
    expect(wallStarts([{ W: 100 }, { W: 60 }, { W: 20 }])).toEqual([0, 100, 160]);
  });

  it('ne demande rien sans repère, ni pour un pan supprimé', () => {
    expect(tintFit(two([]), [{ gx: 0, y: 0 }])).toBeNull();
    expect(hasTints(two([{ wall: 'disparu', x: 0, y: 0, color: RED }]))).toBe(false);
  });

  it('attire chaque motif vers le repère de sa couleur, d\'un pan à l\'autre', () => {
    const p = two([{ wall: 'w1', x: 10, y: 30, color: RED }, { wall: 'w2', x: 90, y: 30, color: BLUE }]);
    const [left, right] = tintFit(p, [{ gx: 10, y: 30 }, { gx: 190, y: 30 }])!;
    expect(left![0]).toBeGreaterThan(0.9);
    expect(left![1]).toBeLessThan(0.1);
    expect(right![1]).toBeGreaterThan(0.9);
    expect(right![0]).toBeLessThan(0.1);
  });

  it('fond les teintes, plus ou moins franchement', () => {
    const spots = [{ wall: 'w1', x: 0, y: 30, color: '#000000' }, { wall: 'w2', x: 100, y: 30, color: '#ffffff' }];
    const grey = (sharpness: number, gx: number) => parseInt(tintColor(two(spots, sharpness), { gx, y: 30 })!.slice(1, 3), 16);
    expect(grey(0.3, 0)).toBe(0);
    expect(grey(0.3, 100)).toBeGreaterThan(120);
    expect(grey(0.3, 100)).toBeLessThan(135);
    // au quart du chemin : une transition franche reste près de la couleur du repère le plus proche
    expect(grey(1, 50)).toBeLessThan(grey(0, 50));
  });

  it('compare la part demandée de chaque teinte aux carreaux disponibles', () => {
    const p = two([{ wall: 'w1', x: 50, y: 30, color: RED }, { wall: 'w2', x: 50, y: 30, color: BLUE }]);
    const comps = computeWalls(p);
    ensureAssigned(p, comps);
    const b = tintBalance(p, comps);
    expect(b.map(x => x.color)).toEqual([RED, BLUE]);
    expect(b[0]!.wanted + b[1]!.wanted).toBeCloseTo(1, 6);
    expect(b[0]!.available + b[1]!.available).toBeCloseTo(1, 6);
    expect(b[0]!.wanted).toBeCloseTo(0.5, 1);
  });
});
