import { describe, expect, it } from 'vitest';
import { demoProject } from './demo';
import { imageRefs, imageUrl, parseProject, parseProjectFile, serializeProject } from './project';
import { computeWalls } from './compute';
import { project, wall } from '../test/fixtures';

const PNG = 'data:image/png;base64,AAAA';

describe('parseProject', () => {
  it('garde la photo d\'ensemble, son calage et l\'angle commun des pans', () => {
    const pts = [{ wx: 0, wy: 0, px: 1, py: 2 }, { wx: 100, wy: 0, px: 3, py: 4 }, { wx: 100, wy: 60, px: 5, py: 6 }, { wx: 0, wy: 60, px: 7, py: 8 }];
    const raw = JSON.parse(JSON.stringify(project({ walls: [wall(), wall({ id: 'w2', joinPrev: true, joinDy: -90 })], overview: { src: 'img:ens', opacity: 0.8, blend: false, walls: { w1: pts } } })));
    const p = parseProject(raw);
    expect(p.overview).toEqual({ src: 'img:ens', opacity: 0.8, blend: false, walls: { w1: pts } });
    expect(p.walls[1]!.joinPrev).toBe(true);
    expect(p.walls[0]!.joinPrev).toBeUndefined();
    expect(p.walls[1]!.joinDy).toBe(-90);
    expect(p.walls[0]!.joinDy).toBeUndefined();
    expect(imageRefs(p)).toContain('img:ens');
    expect(() => parseProject({ ...raw, overview: { src: 'img:ens', walls: { w1: pts.slice(0, 3) } } })).toThrow(/4 repères/);
  });

  it('garde les couleurs des motifs et le style d\'harmonie', () => {
    const raw = JSON.parse(JSON.stringify(project({ style: 'gradient' })));
    raw.designs[0].colors = ['#112233', 'bleu', '#445566', '#778899', '#aabbcc'];
    const p = parseProject(raw);
    expect(p.designs[0]!.colors).toEqual(['#112233', '#445566', '#778899']);
    expect(p.designs[1]!.colors).toBeUndefined();
    expect(p.style).toBe('gradient');
    expect(parseProject({ ...raw, style: 'n\'importe' }).style).toBeUndefined();
    expect(parseProject({ ...raw, style: 'natural', styleVariant: 2 })).toMatchObject({ style: 'natural', styleVariant: 2 });
    expect(parseProject({ ...raw, styleVariant: 1.5 }).styleVariant).toBeUndefined();
  });

  it('garde les repères de teinte', () => {
    const tints = { spots: [{ wall: 'w1', x: 10, y: 20.5, color: '#112233' }], sharpness: 0.7 };
    const raw = JSON.parse(JSON.stringify(project({ style: 'tints', tints })));
    const p = parseProject(raw);
    expect(p.tints).toEqual(tints);
    expect(p.style).toBe('tints');
    expect(parseProject({ ...raw, tints: { spots: [] } }).tints).toEqual({ spots: [], sharpness: 0.3 });
    expect(() => parseProject({ ...raw, tints: { spots: [{ wall: 'w1', x: 0, y: 0, color: 'rouge' }] } })).toThrow(/#rrggbb/);
  });

  it('relit un projet sans le changer', () => {
    const p = demoProject();
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('accepte les nombres écrits en texte', () => {
    const raw = JSON.parse(JSON.stringify(project()));
    raw.tile.F = '12.5';
    raw.walls[0].W = '200';
    const p = parseProject(raw);
    expect(p.tile.F).toBe(12.5);
    expect(p.walls[0]!.W).toBe(200);
  });

  it.each([
    ['une version inconnue', { version: 2 }, /version/],
    ['un carreau sans taille', { tile: { F: 'abc' } }, /tile\.F/],
    ['un carreau de taille nulle', { tile: { F: 0 } }, /tile\.F/],
    ['des pans absents', { walls: null }, /walls/],
  ])('refuse %s', (_, patch, message) => {
    expect(() => parseProject({ ...project(), ...patch })).toThrow(message);
  });

  it('refuse une clé de carreau invalide', () => {
    const raw = project({ walls: [wall({ tiles: { abc: {} } })] });
    expect(() => parseProject(raw)).toThrow(/abc/);
  });

  it('ignore les champs inconnus', () => {
    const p = parseProject({ ...project(), pirate: true });
    expect(p).not.toHaveProperty('pirate');
  });

  it('refuse des repères de calage incomplets', () => {
    const raw = project({ walls: [wall({ photo: { src: '', opacity: 1, blend: true, pts: [] } })] });
    expect(() => parseProject(raw)).toThrow(/repères/);
  });
});

describe('fichier projet', () => {
  it('fait l\'aller-retour avec les images', () => {
    const p = project();
    p.designs[0]!.img = 'img:abc';
    const parsed = parseProjectFile(serializeProject(p, { 'img:abc': PNG, 'img:orpheline': PNG }));
    expect(parsed.state).toEqual(p);
    expect(parsed.images).toEqual({ 'img:abc': PNG });
    expect(parsed.missingImages).toEqual([]);
  });

  // Les exports de la première version référencent leurs images d'origine par chemin relatif.
  it('ouvre un ancien export et signale les images absentes', () => {
    const p = project();
    p.designs[0]!.img = 'motifs/A.jpg';
    p.walls[0]!.photo = { src: 'photos/mur.jpg', opacity: 1, blend: true, pts: [0, 1, 2, 3].map(i => ({ wx: i, wy: i, px: i, py: i })) };
    const parsed = parseProjectFile(JSON.stringify({ state: p, images: {} }));
    expect(parsed.missingImages).toEqual(['motifs/A.jpg', 'photos/mur.jpg']);
  });

  it('écarte les images qui n\'en sont pas', () => {
    const parsed = parseProjectFile(JSON.stringify({ state: project(), images: { 'img:a': 'javascript:alert(1)', autre: PNG } }));
    expect(parsed.images).toEqual({});
  });

  it('explique un fichier illisible', () => {
    expect(() => parseProjectFile('pas du json')).toThrow(/JSON/);
    expect(() => parseProjectFile('{}')).toThrow(/objet attendu/);
  });
});

describe('imageUrl', () => {
  it('résout une image stockée', () => {
    expect(imageUrl('img:a', { 'img:a': PNG })).toBe(PNG);
    expect(imageUrl('img:b', {})).toBe('');
  });

  it('accepte une image intégrée, rien d\'autre', () => {
    expect(imageUrl(PNG, {})).toBe(PNG);
    expect(imageUrl('https://exemple.fr/a.png', {})).toBe('');
    expect(imageUrl('javascript:alert(1)', {})).toBe('');
    expect(imageUrl(null, {})).toBe('');
  });
});

describe('projet d\'exemple', () => {
  it('se calcule et n\'utilise aucune image externe', () => {
    const p = demoProject();
    expect(imageRefs(p)).toEqual([]);
    for (const c of computeWalls(p)) expect(c.stats.n).toBeGreaterThan(20);
  });
});
