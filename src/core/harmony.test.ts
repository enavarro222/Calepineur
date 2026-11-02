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
    expect(harmonyProposals(p, comps, 'natural', 1)[0]!.assignment).toEqual(harmonyProposals(p, comps, 'natural', 1)[0]!.assignment);
  });

  it('ne modifie pas le projet d\'origine', () => {
    const { p, comps } = demo();
    const before = JSON.stringify(p);
    harmonyProposals(p, comps, 'natural', 1);
    expect(JSON.stringify(p)).toBe(before);
  });

  it('supprime voisins identiques et alignements avec 7 motifs', () => {
    const { p, comps } = ready();
    const [best] = harmonyProposals(p, comps);
    expect(best!.report.counts.adjacent).toBe(0);
    expect(best!.report.counts.line).toBe(0);
  });

  // Régression : écarter au mieux les motifs produisait un pavage périodique, noté 100/100.
  it('ne crée pas de trame régulière', () => {
    const { p, comps } = ready({ walls: [wall({ W: 200, H: 90, zone: [[-10, -10], [-10, 100], [210, 100], [210, -10]] })] });
    const peak = (x: Project): number => {
      const c = comps[0]!;
      const seen = new Map<string, number>();
      for (const a of c.tiles) for (const b of c.tiles) {
        if (a === b || x.walls[0]!.tiles[a.key]!.d !== x.walls[0]!.tiles[b.key]!.d) continue;
        const v = `${Math.round(b.c[0] - a.c[0])},${Math.round(b.c[1] - a.c[1])}`;
        if (Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1]) < 40) seen.set(v, (seen.get(v) ?? 0) + 1);
      }
      return Math.max(...seen.values()) / c.tiles.length;
    };
    const random = peak(p);
    for (const { project: next, report } of harmonyProposals(p, comps)) {
      expect(peak(next)).toBeLessThan(random * 1.6);
      expect(report.counts.pattern).toBeLessThanOrEqual(3);
    }
  });

  it('repère une trame régulière', () => {
    const { p, comps } = ready({ walls: [wall({ W: 200, H: 90, zone: [[-10, -10], [-10, 100], [210, 100], [210, -10]] })] });
    // pavage périodique des 7 motifs : aucun voisin identique, mais une trame partout
    paintAll(p, comps, (q, r) => 'ABCDEFG'[((q + 3 * (r - Math.floor(q / 2))) % 7 + 7) % 7]!);
    const rep = harmonyReport(p, comps);
    expect(rep.counts.adjacent).toBe(0);
    expect(rep.counts.pattern).toBeGreaterThan(20);
    expect(rep.score).toBeLessThan(40);
  });

  it('garde les quantités de chaque pan', () => {
    const { p, comps } = demo();
    const perWall = (x: Project) => comps.map((c, i) => c.tiles.map(t => x.walls[i]!.tiles[t.key]!.d).sort());
    for (const { project: next } of harmonyProposals(p, comps)) expect(perWall(next)).toEqual(perWall(p));
  });

  it('ne produit ni damier ni ligne de teinte', () => {
    const designs = [...'ABC'.split('').map(k => design(k, '#101010')), ...'DEFG'.split('').map(k => design(k, '#f0f0f0'))];
    const { p, comps } = ready({ designs, walls: [wall({ W: 160, H: 80, zone: [[-10, -10], [-10, 90], [170, 90], [170, -10]] })] });
    const [best] = harmonyProposals(p, comps);
    const darkRatio = (keys: string[]) => keys.filter(k => 'ABC'.includes(best!.project.walls[0]!.tiles[k]!.d!)).length / keys.length;
    const c = comps[0]!;
    const opposite = c.tiles.filter(t => t.full).map(t => {
      const around = c.g.neighbors(t.q, t.r).map(([q, r]) => `${q},${r}`).filter(k => c.byKey.has(k));
      return Math.abs(darkRatio(around) - darkRatio([t.key]));
    });
    expect(opposite.reduce((a, b) => a + b, 0) / opposite.length).toBeLessThan(0.75);
  });

  // Régression : les teintes marquées migraient vers le pourtour, en laissant le centre pâle.
  it('garde l\'équilibre des teintes entre le bord et le centre', () => {
    const designs = [...'AB'.split('').map(k => design(k, '#101010')), ...'CDEFG'.split('').map(k => design(k, '#c8c8c8'))];
    const { p, comps } = ready({ designs, walls: [wall({ W: 120, H: 60 })] });
    const c = comps[0]!;
    const inner = c.tiles.filter(t => c.g.neighbors(t.q, t.r).filter(([q, r]) => c.byKey.has(`${q},${r}`)).length === 6);
    const dark = (x: Project) => inner.filter(t => 'AB'.includes(x.walls[0]!.tiles[t.key]!.d!)).length;
    for (const { project: next } of harmonyProposals(p, comps)) expect(dark(next)).toBe(dark(p));
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

describe('styles de couleur', () => {
  // Du marine au sable : chaque motif partage sa secondaire avec le suivant.
  const CHAIN = ['#202830', '#3c4a52', '#58707a', '#7a9488', '#a0ad92', '#c8bfa0', '#e8dcc0'];
  const colored = (): Design[] => CHAIN.map((c, i) => ({ ...design('ABCDEFG'[i]!, c), colors: [c, CHAIN[Math.min(i + 1, 6)]!] }));
  const two = () => ready({
    designs: colored(),
    walls: [
      wall({ id: 'w1', W: 160, H: 70, zone: [[-10, -10], [-10, 80], [170, 80], [170, -10]] }),
      wall({ id: 'w2', W: 160, H: 70, ox: 8 - 160, zone: [[-10, -10], [-10, 80], [170, 80], [170, -10]] }),
    ],
  });
  const index = (key: string | null | undefined) => 'ABCDEFG'.indexOf(key ?? '');

  it('garde le total de chaque motif, en échangeant entre les pans', () => {
    const { p, comps } = two();
    const before = orderCounts(p, comps);
    for (const style of ['waves', 'gradient'] as const) {
      for (const { project: next } of harmonyProposals(p, comps, style, 2)) {
        const after = orderCounts(next, comps);
        for (const d of p.designs) expect(after.per[d.key]!.total).toBe(before.per[d.key]!.total);
      }
    }
  });

  it('fait un dégradé du sombre au clair, dans le sens de chaque proposition', () => {
    const { p, comps } = two();
    const props = harmonyProposals(p, comps, 'gradient');
    expect(props.map(x => x.label)).toEqual([
      'A à gauche, G à droite', 'G à gauche, A à droite', 'A en bas, G en haut',
      'En diagonale : A en bas à gauche, G en haut à droite',
    ]);
    // le long des deux pans mis bout à bout : le pan 1, puis le pan 2
    const mean = (x: Project, wallIndex: number) => {
      const ts = comps[wallIndex]!.tiles;
      return ts.reduce((s, t) => s + index(x.walls[wallIndex]!.tiles[t.key]!.d), 0) / ts.length;
    };
    expect(mean(props[0]!.project, 0)).toBeLessThan(mean(props[0]!.project, 1) - 1.5);
    expect(mean(props[1]!.project, 0)).toBeGreaterThan(mean(props[1]!.project, 1) + 1.5);
  });

  it('évite les voisins identiques et rapproche les couleurs voisines', () => {
    const { p, comps } = two();
    const start = harmonyReport({ ...p, style: 'waves' }, comps).counts.clash;
    for (const style of ['waves', 'gradient'] as const) {
      const [best] = harmonyProposals(p, comps, style);
      expect(best!.report.counts.adjacent).toBe(0);
      expect(best!.report.counts.clash).toBeLessThan(start * 0.75);
    }
  });

  it('retient le style choisi, et l\'oublie en revenant au naturel', () => {
    const { p, comps } = two();
    const [wave] = harmonyProposals(p, comps, 'waves', 1);
    expect(wave!.project.style).toBe('waves');
    const [natural] = harmonyProposals(wave!.project, comps, 'natural', 1);
    expect(natural!.project.style).toBeUndefined();
    expect(harmonyProposals(wave!.project, comps, undefined, 1)[0]!.style).toBe('waves');
  });

  it('ne compte pas les taches ni les amas, voulus, mais les voisins sans couleur commune', () => {
    const { p, comps } = ready(); // motifs gris identiques : tout est parent
    paintAll(p, comps, (q, r) => 'ABC'[((q + 2 * r) % 3 + 3) % 3]!);
    const fixture = project();
    const distinct = { ...p, designs: fixture.designs, style: 'waves' as const }; // rouge, vert, bleu : rien en commun
    const rep = harmonyReport(distinct, comps);
    expect(rep.counts.clash).toBeGreaterThan(0);
    expect(rep.counts.tone + rep.counts.clump).toBe(0);
    expect(harmonyReport({ ...distinct, style: undefined }, comps).counts.clash).toBe(0);
  });

  it('reste rapide sur un grand projet', () => {
    const big = project({ designs: colored(), walls: [wall({ W: 500, H: 150, zone: [[-10, -10], [-10, 160], [510, 160], [510, -10]] })] });
    const comps = computeWalls(big);
    ensureAssigned(big, comps);
    const start = performance.now();
    harmonyProposals(big, comps, 'gradient');
    expect(performance.now() - start).toBeLessThan(8000);
  });

  it('ne déplace pas les carreaux verrouillés', () => {
    const { p, comps } = two();
    const keys = comps[1]!.tiles.slice(0, 10).map(t => t.key);
    for (const k of keys) p.walls[1]!.tiles[k]!.lk = true;
    for (const { assignment } of harmonyProposals(p, comps, 'gradient', 2)) {
      for (const k of keys) expect(assignment[1]![k]).toBe(p.walls[1]!.tiles[k]!.d);
    }
  });
});
