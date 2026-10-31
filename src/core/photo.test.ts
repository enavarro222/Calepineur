import { describe, expect, it } from 'vitest';
import { applyH } from './geom';
import { calibPoints, isCalibUsable, PHOTO_K, photoH, photoMatrix } from './photo';
import { wall } from '../test/fixtures';
import type { WallPhoto } from './types';

const photo: WallPhoto = {
  src: 'img:a', opacity: 1, blend: true,
  pts: [
    { wx: 0, wy: 0, px: 100, py: 500 },
    { wx: 100, wy: 0, px: 900, py: 480 },
    { wx: 100, wy: 60, px: 880, py: 120 },
    { wx: 0, wy: 60, px: 120, py: 130 },
  ],
};

function parseMatrix(m: string): number[] {
  return m.slice('matrix3d('.length, -1).split(',').map(Number);
}

describe('photo', () => {
  it('sans repères, pas de projection', () => {
    expect(photoH(wall())).toBeNull();
    expect(photoMatrix(wall(), 1)).toBeNull();
  });

  it('place les repères sur la photo', () => {
    const H = photoH(wall({ photo }))!;
    const q = applyH(H, [100, 60]);
    expect(q[0]).toBeCloseTo(880, 6);
    expect(q[1]).toBeCloseTo(120, 6);
  });

  // Le calque SVG a l'origine en haut à gauche, à PHOTO_K px/cm : son coin bas-gauche est le repère (0, 0).
  it('projette le calque au bon endroit, à l\'échelle d\'affichage', () => {
    const w = wall({ photo });
    const s = 0.5;
    const m = parseMatrix(photoMatrix(w, s)!);
    const svgY = w.H * PHOTO_K;
    const px = m[12]! + m[4]! * svgY;
    const py = m[13]! + m[5]! * svgY;
    const d = m[15]! + m[7]! * svgY;
    expect(px / d).toBeCloseTo(100 * s, 6);
    expect(py / d).toBeCloseTo(500 * s, 6);
  });
});

describe('calage préparé', () => {
  const calib = [
    { wx: 0, wy: 0, u: 0.1, v: 0.8 }, { wx: 100, wy: 0, u: 0.9, v: 0.8 },
    { wx: 100, wy: 60, u: 0.9, v: 0.2 }, { wx: 0, wy: 60, u: 0.1, v: 0.2 },
  ];

  it('s\'adapte à la taille de l\'image', () => {
    expect(calibPoints(calib, 1000, 500)[2]).toEqual({ wx: 100, wy: 60, px: 900, py: 100 });
    expect(calibPoints(calib, 2000, 1000)[2]).toEqual({ wx: 100, wy: 60, px: 1800, py: 200 });
  });

  it('refuse des repères alignés', () => {
    expect(isCalibUsable(calib)).toBe(true);
    expect(isCalibUsable(calib.map((c, i) => ({ ...c, wx: i, wy: 0, u: i / 10, v: 0 })))).toBe(false);
  });
});
