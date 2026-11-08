import { describe, expect, it } from 'vitest';
import { near } from '../test/near';
import { computeWalls } from './compute';
import { ensureAssigned, pickRot, proposeReplacement, pruneTiles, shuffleDesigns } from './designs';
import { harmonyReport } from './harmony';
import { DEFECT_POINTS } from './rules';
import { mulberry32 } from './geom';
import { project, wall } from '../test/fixtures';
import type { Project } from './types';

function assigned(over: Partial<Project> = {}) {
  const p = project(over);
  const comps = computeWalls(p);
  ensureAssigned(p, comps);
  return { p, comps };
}

// Morceau assez grand pour compter dans la note et les répartitions.
const seen = (c: { byKey: Map<string, { frac: number }> }, key: string): boolean => (c.byKey.get(key)?.frac ?? 0) >= 0.2;

const countByDesign = (p: Project): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const w of p.walls) for (const a of Object.values(w.tiles)) if (a.d) out[a.d] = (out[a.d] ?? 0) + 1;
  return out;
};

describe('ensureAssigned', () => {
  it('donne un motif connu à chaque carreau', () => {
    const { p, comps } = assigned();
    for (const t of comps[0]!.tiles) expect(['A', 'B', 'C']).toContain(p.walls[0]!.tiles[t.key]?.d);
  });

  // Un carreau a 6 voisins : à partir de 7 motifs, il reste toujours un choix libre. Comme dans la note, les miettes
  // (moins de 20 % d'un carreau) ne comptent pas.
  it('évite deux motifs identiques côte à côte', () => {
    const designs = 'ABCDEFG'.split('').map(key => ({ key, name: key, img: '', color: '#000000', weight: 1 }));
    const { p, comps } = assigned({ designs });
    const w = p.walls[0]!;
    const c = comps[0]!;
    for (const t of c.tiles) {
      for (const [q, r] of c.g.neighbors(t.q, t.r)) {
        const n = w.tiles[`${q},${r}`];
        if (n && seen(c, `${q},${r}`) && seen(c, t.key)) expect(n.d).not.toBe(w.tiles[t.key]!.d);
      }
    }
  });

  it('équilibre les quantités', () => {
    const counts = Object.values(countByDesign(assigned().p));
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(4);
  });

  it('respecte les poids', () => {
    const base = project();
    base.designs[0]!.weight = 2;
    base.designs[2]!.weight = 0;
    const { p } = assigned({ designs: base.designs });
    const counts = countByDesign(p);
    expect(counts.C).toBeUndefined();
    expect(counts.A!).toBeGreaterThan(counts.B!);
  });

  it('est reproductible', () => {
    expect(assigned().p.walls[0]!.tiles).toEqual(assigned().p.walls[0]!.tiles);
  });

  it('remplace un motif supprimé et garde les autres', () => {
    const { p, comps } = assigned();
    const tiles = p.walls[0]!.tiles;
    const keys = Object.keys(tiles);
    tiles[keys[0]!]!.d = 'disparu';
    const kept = tiles[keys[1]!]!.d;
    ensureAssigned(p, comps);
    expect(['A', 'B', 'C']).toContain(tiles[keys[0]!]!.d);
    expect(tiles[keys[1]!]!.d).toBe(kept);
  });
});

describe('remplissage des nouveaux carreaux', () => {
  const points = (r: ReturnType<typeof harmonyReport>) => r.defects.reduce((s, d) => s + DEFECT_POINTS[d.type], 0);

  it('choisit le motif qui crée le moins de points de défaut, comme la note', () => {
    const designs = 'ABCDE'.split('').map(key => ({ key, name: key, img: '', color: '#000000', weight: 1 }));
    const { p, comps } = assigned({ designs, walls: [wall({ W: 120, H: 70 })] });
    const t = comps[0]!.tiles.find(x => x.full && x.c[0] > 40 && x.c[1] > 25)!;
    const cost = (d: string) => {
      p.walls[0]!.tiles[t.key]!.d = d;
      return points(harmonyReport(p, comps));
    };
    const least = Math.min(...'ABCDE'.split('').map(cost));
    p.walls[0]!.tiles[t.key]!.d = 'disparu';
    ensureAssigned(p, comps);
    expect(cost(p.walls[0]!.tiles[t.key]!.d!)).toBe(least);
  });

  it('retombe sur le premier motif si tous les poids sont nuls', () => {
    const base = project();
    base.designs.forEach(d => { d.weight = 0; });
    const { p } = assigned({ designs: base.designs });
    expect(Object.keys(countByDesign(p))).toEqual(['A']);
  });
});

describe('pickRot', () => {
  it('suit le mode de rotation', () => {
    expect(pickRot({ rotMode: 'none' }, () => 0.9)).toBe(0);
    expect(pickRot({ rotMode: '180' }, () => 0.9)).toBe(3);
    expect(pickRot({ rotMode: '60' }, () => 0.99)).toBe(5);
  });
});

describe('shuffleDesigns', () => {
  // Deux motifs identiques sur une même rangée avec une seule colonne entre eux sautent aux yeux.
  it('évite les motifs identiques à une colonne d\'écart, sans changer les quantités', () => {
    const designs = 'ABCDEFG'.split('').map(key => ({ key, name: key, img: '', color: '#000000', weight: 1 }));
    const zone: [number, number][] = [[-10, -10], [-10, 100], [210, 100], [210, -10]];
    const { p, comps } = assigned({ designs, walls: [wall({ W: 200, H: 90, zone })] });
    const c = comps[0]!;
    const w = p.walls[0]!;
    for (const seed of [1, 2, 3]) {
      p.seed = seed;
      shuffleDesigns(p, comps, false);
      const same = [0, 0, 0, 0];
      for (const t of c.tiles) {
        for (const [q, r, lvl] of near(c.g, t.q, t.r)) {
          const k = `${q},${r}`;
          if (seen(c, k) && seen(c, t.key) && w.tiles[k]!.d === w.tiles[t.key]!.d) same[lvl] = (same[lvl] ?? 0) + 1;
        }
      }
      // chaque paire est vue des deux côtés ; un mélange sans cette règle en laisse une centaine
      expect(same[1]).toBe(0);
      expect(same[2]! / 2).toBeLessThanOrEqual(12);
      const counts = Object.values(countByDesign(p));
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it('suit les poids au carreau près', () => {
    const base = project();
    base.designs[0]!.weight = 2;
    const { p, comps } = assigned({ designs: base.designs });
    shuffleDesigns(p, comps, false);
    const counts = countByDesign(p);
    const n = comps[0]!.tiles.length;
    expect(Math.abs(counts.A! - n / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(counts.B! - counts.C!)).toBeLessThanOrEqual(1);
  });

  it('suit le style retenu', () => {
    const CHAIN = ['#202830', '#3c4a52', '#58707a', '#7a9488', '#a0ad92', '#c8bfa0', '#e8dcc0'];
    const designs = CHAIN.map((color, i) => ({ key: 'ABCDEFG'[i]!, name: 'ABCDEFG'[i]!, img: '', color, weight: 1 }));
    const { p, comps } = assigned({ designs, walls: [wall({ W: 200, H: 60, zone: [[-10, -10], [-10, 70], [210, 70], [210, -10]] })], style: 'gradient', styleVariant: 0 });
    shuffleDesigns(p, comps, false);
    const side = (left: boolean) => {
      const ts = comps[0]!.tiles.filter(t => (t.c[0] < 70) === left && (t.c[0] > 130) !== left);
      return ts.reduce((s, t) => s + 'ABCDEFG'.indexOf(p.walls[0]!.tiles[t.key]!.d!), 0) / ts.length;
    };
    expect(side(true)).toBeLessThan(side(false) - 2);
  });

  it('garde les carreaux verrouillés', () => {
    const { p, comps } = assigned();
    const key = comps[0]!.tiles[5]!.key;
    p.walls[0]!.tiles[key] = { d: 'C', lk: true };
    p.seed = 99;
    shuffleDesigns(p, comps, true);
    expect(p.walls[0]!.tiles[key]).toEqual({ d: 'C', lk: true });
  });

  it('peut tout remélanger', () => {
    const { p, comps } = assigned();
    const key = comps[0]!.tiles[5]!.key;
    p.walls[0]!.tiles[key] = { d: 'C', lk: true };
    shuffleDesigns(p, comps, false);
    expect(p.walls[0]!.tiles[key]!.lk).toBeUndefined();
  });
});

describe('pruneTiles', () => {
  it('oublie les entrées hors zone sans réglage manuel', () => {
    const { p, comps } = assigned();
    Object.assign(p.walls[0]!.tiles, {
      '99,99': { d: 'A' },
      '98,98': { d: 'A', lk: true },
      '97,97': { st: 'del' },
    });
    pruneTiles(p, comps);
    const tiles = p.walls[0]!.tiles;
    expect(tiles['99,99']).toBeUndefined();
    expect(tiles['98,98']).toBeDefined();
    expect(tiles['97,97']).toBeDefined();
  });
});

it('compte plusieurs pans ensemble', () => {
  const { p } = assigned({ walls: [wall(), wall({ id: 'w2' })] });
  expect(Object.keys(p.walls[1]!.tiles).length).toBeGreaterThan(0);
});

describe('proposeReplacement', () => {
  const seven = () => 'ABCDEFG'.split('').map(key => ({ key, name: key, img: '', color: '#000000', weight: 1 }));

  it('propose un autre motif, sans voisin identique ni colonne d\'écart quand c\'est possible', () => {
    const { p, comps } = assigned({ designs: [...seven(), { key: 'H', name: 'H', img: '', color: '#000000', weight: 1 }] });
    const c = comps[0]!;
    const w = p.walls[0]!;
    const t = c.tiles.find(x => x.full && near(c.g, x.q, x.r).every(([q, r]) => seen(c, `${q},${r}`)))!;
    // voisins : D à H ; à une colonne d'écart : A, et aucun autre A ; le carreau : B. Seul C ne se répète pas à proximité.
    for (const a of Object.values(w.tiles)) if (a.d === 'A') a.d = 'B';
    w.tiles[t.key]!.d = 'B';
    let n = 0;
    for (const [q, r, lvl] of near(c.g, t.q, t.r)) {
      if (lvl === 1) w.tiles[`${q},${r}`]!.d = 'DEFGH'[n++ % 5]!;
      if (lvl === 2) w.tiles[`${q},${r}`]!.d = 'A';
    }
    const rng = mulberry32(7);
    for (let k = 0; k < 30; k++) expect(proposeReplacement(p, comps, 0, t.key, rng)).toBe('C');
    // sans C, mieux vaut A à une colonne d'écart qu'un voisin identique
    p.designs.find(d => d.key === 'C')!.weight = 0;
    for (let k = 0; k < 30; k++) expect(proposeReplacement(p, comps, 0, t.key, rng)).toBe('A');
  });

  it('varie d\'un tirage à l\'autre', () => {
    const { p, comps } = assigned({ designs: seven() });
    const t = comps[0]!.tiles.find(x => x.full)!;
    const rng = mulberry32(3);
    const seen = new Set(Array.from({ length: 40 }, () => proposeReplacement(p, comps, 0, t.key, rng)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('jamais un motif de poids nul, et rien s\'il n\'y a pas d\'autre choix', () => {
    const { p, comps } = assigned();
    const t = comps[0]!.tiles[0]!;
    p.designs.forEach(d => { d.weight = d.key === p.walls[0]!.tiles[t.key]!.d ? 1 : 0; });
    expect(proposeReplacement(p, comps, 0, t.key, mulberry32(1))).toBeNull();
  });
});
