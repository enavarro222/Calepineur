import { describe, expect, it } from 'vitest';
import { computeWalls } from './compute';
import { demoProject } from './demo';
import { ensureAssigned } from './designs';
import { applyAssignment, colorTone, harmonyProposals, harmonyReport } from './harmony';
import { latticeFor } from './lattice';
import { orderCounts } from './order';
import type { Design, Project } from './types';
import { project, wall } from '../test/fixtures';

const design = (key: string, color = '#808080'): Design => ({ key, name: key, img: '', color, weight: 1 });
const seven = (): Design[] => 'ABCDEFG'.split('').map(k => design(k));

function ready(over: Partial<Project> = {}) {
  const p = project({ designs: seven(), ...over });
  const comps = computeWalls(p);
  ensureAssigned(p, comps);
  return { p, comps };
}

// Mur uni : chaque carreau a le motif demandé, pour construire un défaut précis.
function paintAll(p: Project, comps: ReturnType<typeof computeWalls>, pick: (q: number, r: number) => string) {
  for (const t of comps[0]!.tiles) p.walls[0]!.tiles[t.key] = { d: pick(t.q, t.r) };
}

describe('colorTone', () => {
  it('va du noir au blanc', () => {
    expect(colorTone('#000000')).toBe(0);
    expect(colorTone('#ffffff')).toBeCloseTo(1, 6);
  });

  it('tient compte de la luminosité perçue', () => {
    expect(colorTone('#00ff00')).toBeGreaterThan(colorTone('#0000ff'));
  });

  it('reste neutre sur une couleur illisible', () => {
    expect(colorTone('rouge')).toBe(0.5);
  });
});

describe('harmonyReport', () => {
  it('note 100 un projet vide', () => {
    const p = project({ walls: [wall({ zone: [] })] });
    expect(harmonyReport(p, computeWalls(p)).score).toBe(100);
  });

  it('repère deux voisins identiques', () => {
    const { p, comps } = ready();
    paintAll(p, comps, (q, r) => 'ABCDEFG'[((q + 2 * r) % 7 + 7) % 7]!);
    const clean = harmonyReport(p, comps);
    expect(clean.counts.adjacent).toBe(0);

    const a = comps[0]!.tiles.find(t => t.full)!;
    const [q, r] = comps[0]!.g.neighbors(a.q, a.r).find(([nq, nr]) => comps[0]!.byKey.get(`${nq},${nr}`)?.full)!;
    p.walls[0]!.tiles[`${q},${r}`]!.d = p.walls[0]!.tiles[a.key]!.d;
    const r2 = harmonyReport(p, comps);
    expect(r2.counts.adjacent).toBeGreaterThan(0);
    expect(r2.defects.filter(d => d.type === 'adjacent').some(d => d.keys.includes(a.key))).toBe(true);
    expect(r2.score).toBeLessThan(clean.score);
  });

  it('repère un alignement espacé d\'un carreau', () => {
    const { p, comps } = ready();
    const c = comps[0]!;
    paintAll(p, comps, (q, r) => 'BCDEFG'[((q + 2 * r) % 6 + 6) % 6]!);
    const g = c.g;
    const t = c.tiles.find(x => x.c[0] > 30 && x.c[0] < 70 && x.c[1] > 20 && x.c[1] < 40)!;
    const keys = [0, 1, 2].map(k => {
      const n = g.nearest(t.c[0] + g.farAxes[0]![0] * g.d * Math.sqrt(3) * k, t.c[1] + g.farAxes[0]![1] * g.d * Math.sqrt(3) * k, c.ox, c.oy);
      return `${n.q},${n.r}`;
    });
    for (const k of keys) p.walls[0]!.tiles[k]!.d = 'A';
    expect(harmonyReport(p, comps).defects.filter(d => d.type === 'line').map(d => d.keys)).toContainEqual(keys);
  });

  it('repère un amas', () => {
    const { p, comps } = ready();
    const c = comps[0]!;
    const near = c.tiles.filter(t => Math.hypot(t.c[0] - 50, t.c[1] - 30) < 16);
    expect(near.length).toBeGreaterThan(4);
    paintAll(p, comps, (q, r) => 'BCDEFG'[((q + 2 * r) % 6 + 6) % 6]!);
    for (const t of near) p.walls[0]!.tiles[t.key]!.d = 'A';
    expect(harmonyReport(p, comps).counts.clump).toBeGreaterThan(0);
  });

  it('repère une tache sombre sans doublon de motif', () => {
    const designs = [...'ABCD'.split('').map(k => design(k, '#101010')), ...'EFGH'.split('').map(k => design(k, '#f0f0f0'))];
    const { p, comps } = ready({ designs });
    paintAll(p, comps, (q, r) => (q < 5 ? 'ABCD' : 'EFGH')[((q + 2 * r) % 4 + 4) % 4]!);
    expect(harmonyReport(p, comps).counts.tone).toBeGreaterThan(0);
  });

  it('ignore les teintes si tous les motifs se ressemblent', () => {
    const { p, comps } = ready();
    expect(harmonyReport(p, comps).counts.tone).toBe(0);
  });

  it('ignore les tout petits morceaux', () => {
    const { p, comps } = ready({ walls: [wall({ W: 100, H: 60, ox: -4, oy: 1 })] });
    const c = comps[0]!;
    paintAll(p, comps, (q, r) => 'ABCDEFG'[((q + 2 * r) % 7 + 7) % 7]!);
    const crumb = c.tiles.find(t => t.frac < 0.2 && c.g.neighbors(t.q, t.r).some(([q, r]) => c.byKey.has(`${q},${r}`)))!;
    const [q, r] = c.g.neighbors(crumb.q, crumb.r).find(([nq, nr]) => c.byKey.has(`${nq},${nr}`))!;
    p.walls[0]!.tiles[crumb.key]!.d = p.walls[0]!.tiles[`${q},${r}`]!.d;
    expect(harmonyReport(p, comps).defects.filter(d => d.keys.includes(crumb.key))).toEqual([]);
  });

  it('suit l\'orientation du carreau', () => {
    const base = project();
    base.tile.orient = 'pointy';
    const { p, comps } = ready({ tile: base.tile });
    expect(latticeFor(p.tile).nearAxes[0]).toEqual([1, 0]);
    expect(harmonyReport(p, comps).score).toBeGreaterThan(0);
  });
});

describe('harmonyProposals', () => {
  const demo = () => {
    const p = demoProject();
    const comps = computeWalls(p);
    ensureAssigned(p, comps);
    return { p, comps };
  };

  it('améliore la note', () => {
    const { p, comps } = demo();
    const before = harmonyReport(p, comps).score;
    const [best] = harmonyProposals(p, comps);
    expect(best!.report.score).toBeGreaterThan(before);
  });

  it('garde exactement les quantités', () => {
    const { p, comps } = demo();
    const before = orderCounts(p, comps);
    for (const { project: next } of harmonyProposals(p, comps)) {
      const after = orderCounts(next, comps);
      for (const d of p.designs) expect(after.per[d.key]!.total).toBe(before.per[d.key]!.total);
      expect(after.toOrder).toBe(before.toOrder);
    }
  });

  it('ne déplace pas les carreaux verrouillés', () => {
    const { p, comps } = demo();
    const keys = comps[0]!.tiles.slice(0, 12).map(t => t.key);
    for (const k of keys) p.walls[0]!.tiles[k]!.lk = true;
    for (const { assignment } of harmonyProposals(p, comps)) {
      for (const k of keys) expect(assignment[0]![k]).toBe(p.walls[0]!.tiles[k]!.d);
    }
  });

  it('propose plusieurs solutions différentes, de la meilleure à la moins bonne', () => {
    const { p, comps } = demo();
    const props = harmonyProposals(p, comps);
    expect(props).toHaveLength(4);
    expect(new Set(props.map(x => JSON.stringify(x.assignment))).size).toBe(4);
    const scores = props.map(x => x.report.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('est reproductible', () => {
    const { p, comps } = demo();
    expect(harmonyProposals(p, comps, 1)[0]!.assignment).toEqual(harmonyProposals(p, comps, 1)[0]!.assignment);
  });

  it('ne modifie pas le projet d\'origine', () => {
    const { p, comps } = demo();
    const before = JSON.stringify(p);
    harmonyProposals(p, comps, 1);
    expect(JSON.stringify(p)).toBe(before);
  });

  it('supprime voisins identiques et alignements avec 7 motifs', () => {
    const { p, comps } = ready();
    const [best] = harmonyProposals(p, comps);
    expect(best!.report.counts.adjacent).toBe(0);
    expect(best!.report.counts.line).toBe(0);
  });

  it('reste rapide sur un grand projet', () => {
    const big = project({ designs: seven(), walls: [wall({ W: 500, H: 150, zone: [[-10, -10], [-10, 160], [510, 160], [510, -10]] })] });
    const comps = computeWalls(big);
    ensureAssigned(big, comps);
    expect(comps[0]!.stats.n).toBeGreaterThan(800);
    const start = performance.now();
    harmonyProposals(big, comps);
    expect(performance.now() - start).toBeLessThan(8000);
  });

  it('applique une proposition', () => {
    const { p, comps } = demo();
    const [best] = harmonyProposals(p, comps);
    const copy = structuredClone(p);
    applyAssignment(copy, best!.assignment);
    expect(harmonyReport(copy, comps).score).toBe(best!.report.score);
  });
});
