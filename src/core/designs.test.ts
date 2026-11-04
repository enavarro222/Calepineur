import { describe, expect, it } from 'vitest';
import { computeWalls } from './compute';
import { ensureAssigned, pickDesign, pickRot, pruneTiles, shuffleDesigns } from './designs';
import { project, wall } from '../test/fixtures';
import type { Project } from './types';

function assigned(over: Partial<Project> = {}) {
  const p = project(over);
  const comps = computeWalls(p);
  ensureAssigned(p, comps);
  return { p, comps };
}

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

  // Un carreau a 6 voisins : à partir de 7 motifs, il reste toujours un choix libre.
  it('évite deux motifs identiques côte à côte', () => {
    const designs = 'ABCDEFG'.split('').map(key => ({ key, name: key, img: '', color: '#000000', weight: 1 }));
    const { p, comps } = assigned({ designs });
    const w = p.walls[0]!;
    const c = comps[0]!;
    for (const t of c.tiles) {
      for (const [q, r] of c.g.neighbors(t.q, t.r)) {
        const n = w.tiles[`${q},${r}`];
        if (n && c.byKey.has(`${q},${r}`)) expect(n.d).not.toBe(w.tiles[t.key]!.d);
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

describe('pickDesign', () => {
  const rng = () => 0;

  it('choisit le moins utilisé', () => {
    expect(pickDesign(project(), { A: 5, B: 1, C: 5 }, {}, rng)).toBe('B');
  });

  it('accepte un voisin identique plutôt que rien', () => {
    expect(pickDesign(project(), {}, { A: 1000, B: 1000, C: 1000 }, rng)).toBeTruthy();
  });

  it('écarte un voisin identique même au prix de l\'équilibre', () => {
    expect(pickDesign(project(), { A: 9, B: 0, C: 0 }, { B: 1000, C: 1000 }, rng)).toBe('A');
  });

  it('préfère, à équilibre égal, le motif le moins répété autour', () => {
    expect(pickDesign(project(), {}, { B: 30, C: 8 }, rng)).toBe('A');
    expect(pickDesign(project(), {}, { A: 30, B: 8 }, rng)).toBe('C');
  });

  it('retombe sur le premier motif si tous les poids sont nuls', () => {
    const p = project();
    p.designs.forEach(d => { d.weight = 0; });
    expect(pickDesign(p, {}, {}, rng)).toBe('A');
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
        for (const [q, r, lvl] of c.g.near(t.q, t.r)) {
          const k = `${q},${r}`;
          if (c.byKey.has(k) && w.tiles[k]!.d === w.tiles[t.key]!.d) same[lvl] = (same[lvl] ?? 0) + 1;
        }
      }
      // chaque paire est vue des deux côtés ; un mélange sans cette règle en laisse une centaine
      expect(same[1]).toBe(0);
      expect(same[2]! / 2).toBeLessThanOrEqual(12);
      const counts = Object.values(countByDesign(p));
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(4);
    }
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
