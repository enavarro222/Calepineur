import { describe, expect, it } from 'vitest';
import {
  applyH, bbOverlap, bboxPts, closeRing, colLetters, distToSeg, hashStr, homography, invH, mpArea, mpCentroid, mulberry32, mulH,
  pointInRing, ringArea, ringCentroid, round1, snap,
} from './geom';
import type { MultiPolygon, Point } from './types';

const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe('polygones', () => {
  it('ferme un anneau une seule fois', () => {
    const ring = closeRing(square);
    expect(ring).toHaveLength(5);
    expect(closeRing(ring)).toHaveLength(5);
  });

  it('calcule aire et centre', () => {
    expect(ringArea(square)).toBe(100);
    expect(ringCentroid(square)).toEqual([5, 5]);
  });

  it('retire les trous de la surface', () => {
    const hole: Point[] = [[2, 2], [4, 2], [4, 4], [2, 4]];
    const mp: MultiPolygon = [[closeRing(square), closeRing(hole)]];
    expect(mpArea(mp)).toBe(96);
  });

  it('prend le plus grand morceau pour le centre', () => {
    const small: Point[] = [[20, 20], [21, 20], [21, 21], [20, 21]];
    expect(mpCentroid([[closeRing(small)], [closeRing(square)]])).toEqual([5, 5]);
    expect(mpCentroid([])).toBeNull();
  });

  it('teste l\'appartenance à un polygone', () => {
    expect(pointInRing([5, 5], square)).toBe(true);
    expect(pointInRing([15, 5], square)).toBe(false);
  });

  it('gère les boîtes englobantes', () => {
    expect(bboxPts(square)).toEqual([0, 0, 10, 10]);
    expect(bbOverlap([0, 0, 2, 2], [1, 1, 3, 3])).toBe(true);
    expect(bbOverlap([0, 0, 2, 2], [2, 0, 3, 3])).toBe(false);
  });

  it('mesure la distance à un segment', () => {
    expect(distToSeg([5, 3], [0, 0], [10, 0])).toBe(3);
    expect(distToSeg([13, 4], [0, 0], [10, 0])).toBe(5);
    expect(distToSeg([3, 4], [0, 0], [0, 0])).toBe(5);
  });
});

describe('homographie', () => {
  const src: Point[] = [[0, 0], [100, 0], [100, 50], [0, 50]];
  const dst: Point[] = [[12, 200], [310, 190], [300, 40], [20, 55]];

  it('envoie les 4 repères sur leur image', () => {
    const H = homography(src, dst)!;
    src.forEach((p, i) => {
      const q = applyH(H, p);
      expect(q[0]).toBeCloseTo(dst[i]![0], 6);
      expect(q[1]).toBeCloseTo(dst[i]![1], 6);
    });
  });

  it('s\'inverse', () => {
    const H = homography(src, dst)!;
    const back = applyH(invH(H)!, applyH(H, [37, 21]));
    expect(back[0]).toBeCloseTo(37, 6);
    expect(back[1]).toBeCloseTo(21, 6);
  });

  it('compose comme l\'application successive', () => {
    const H = homography(src, dst)!;
    const K = [2, 0, 5, 0, 3, -1, 0, 0, 1];
    const a = applyH(mulH(K, H), [40, 10]);
    const b = applyH(K, applyH(H, [40, 10]));
    expect(a[0]).toBeCloseTo(b[0], 6);
    expect(a[1]).toBeCloseTo(b[1], 6);
  });

  it('refuse des repères alignés', () => {
    expect(homography([[0, 0], [1, 0], [2, 0], [3, 0]], dst)).toBeNull();
  });
});

describe('utilitaires', () => {
  it('nomme les colonnes comme un tableur', () => {
    expect(['A', 'Z', 'AA', 'AB'].map((_, i) => colLetters([0, 25, 26, 27][i]!))).toEqual(['A', 'Z', 'AA', 'AB']);
  });

  it('tire une suite reproductible', () => {
    const a = mulberry32(hashStr('x'));
    const b = mulberry32(hashStr('x'));
    expect([a(), a()]).toEqual([b(), b()]);
    expect(a()).toBeLessThan(1);
  });

  it('arrondit et cale', () => {
    expect(round1(1.26)).toBe(1.3);
    expect(snap(1.3)).toBe(1.5);
  });
});
