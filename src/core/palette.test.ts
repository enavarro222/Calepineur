import { describe, expect, it } from 'vitest';
import { colorAffinity, colorChain, deltaE, designColors, extractPalette, hexToLab } from './palette';

// Image de test : des pixels RVBA, chaque couleur répétée selon sa part.
function pixels(parts: [number[], number][], noise = 0, seed = 1): number[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * noise;
  return parts.flatMap(([rgb, n]) => Array.from({ length: n }, () => [...rgb.map(v => Math.max(0, Math.min(255, v + rnd()))), 255]).flat());
}

const near = (hex: string, rgb: number[]) => deltaE(hexToLab(hex), hexToLab('#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('')));

describe('hexToLab', () => {
  it('place le blanc et le noir aux extrémités de la clarté', () => {
    expect(hexToLab('#ffffff')[0]).toBeCloseTo(100, 0);
    expect(hexToLab('#000000')[0]).toBeCloseTo(0, 5);
    expect(deltaE(hexToLab('#336699'), hexToLab('#336699'))).toBe(0);
  });
});

describe('designColors', () => {
  it('prend la teinte moyenne quand aucune couleur n\'est donnée', () => {
    expect(designColors({ color: '#123456' })).toEqual(['#123456']);
  });

  it('garde trois couleurs valides au plus', () => {
    expect(designColors({ color: '#123456', colors: ['#111111', 'rouge', '#222222', '#333333', '#444444'] })).toEqual(['#111111', '#222222', '#333333']);
  });
});

describe('colorAffinity', () => {
  it('va de 1 pour un motif avec lui-même à 0 sans couleur commune', () => {
    const a = colorAffinity([{ color: '', colors: ['#c03020', '#f0e0c0'] }, { color: '', colors: ['#2040b0'] }]);
    expect(a[0]![0]).toBeCloseTo(1, 6);
    expect(a[0]![1]).toBe(0);
    expect(a[1]![0]).toBe(0);
  });

  it('compte une couleur secondaire partagée, moins qu\'une dominante', () => {
    const navy = '#2a3140';
    const sage = '#7d9488';
    const sand = '#b8a58a';
    const [g, e, a] = [{ color: '', colors: [navy, sage] }, { color: '', colors: [sage, navy] }, { color: '', colors: [sand, sage] }];
    const m = colorAffinity([g, e, a]);
    expect(m[0]![1]).toBeGreaterThan(0.9); // mêmes couleurs, dans un autre ordre
    expect(m[0]![2]).toBeGreaterThan(0.2);
    expect(m[0]![2]).toBeLessThan(m[1]![2]!);
  });
});

describe('colorChain', () => {
  it('range les motifs du plus sombre au plus clair, selon leur dominante', () => {
    const colors = ['#e8dcc0', '#202830', '#a0ad92', '#58707a', '#c8bfa0', '#3c4a52', '#7a9488'];
    const chain = colorChain(colors.map(c => ({ color: '#808080', colors: [c, '#ffffff'] })));
    expect(chain).toEqual([1, 5, 3, 6, 2, 4, 0]);
  });

  it('suit la teinte quand la clarté ne change pas', () => {
    const chain = colorChain(['#b04040', '#40a040', '#8a7a30'].map(c => ({ color: c })));
    expect(chain[1]).toBe(2); // le jaune-brun est entre le rouge et le vert
  });
});

describe('extractPalette', () => {
  it('trouve la dominante puis la secondaire', () => {
    const found = extractPalette(pixels([[[60, 70, 90], 600], [[190, 170, 140], 300], [[120, 150, 130], 100]], 6));
    expect(found).toHaveLength(3);
    expect(near(found[0]!, [60, 70, 90])).toBeLessThan(5);
    expect(near(found[1]!, [190, 170, 140])).toBeLessThan(5);
    expect(near(found[2]!, [120, 150, 130])).toBeLessThan(5);
  });

  it('ne voit qu\'une couleur dans un uni, même avec du grain', () => {
    const found = extractPalette(pixels([[[180, 120, 90], 2000]], 10));
    expect(found).toHaveLength(1);
    expect(near(found[0]!, [180, 120, 90])).toBeLessThan(4);
  });

  it('écarte les touches trop petites et les pixels transparents', () => {
    const rgba = pixels([[[40, 40, 40], 970], [[250, 20, 20], 30]]);
    rgba.push(...Array.from({ length: 1000 }, () => [0, 255, 0, 0]).flat());
    expect(extractPalette(rgba)).toHaveLength(1);
    expect(extractPalette([])).toEqual([]);
  });
});
