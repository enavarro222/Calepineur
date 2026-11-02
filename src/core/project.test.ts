import { describe, expect, it } from 'vitest';
import { demoProject } from './demo';
import { imageRefs, imageUrl, parseProject, parseProjectFile, serializeProject } from './project';
import { computeWalls } from './compute';
import { project, wall } from '../test/fixtures';

const PNG = 'data:image/png;base64,AAAA';

describe('parseProject', () => {
  it('garde les couleurs des motifs et le style d\'harmonie', () => {
    const raw = JSON.parse(JSON.stringify(project({ style: 'gradient' })));
    raw.designs[0].colors = ['#112233', 'bleu', '#445566', '#778899', '#aabbcc'];
    const p = parseProject(raw);
    expect(p.designs[0]!.colors).toEqual(['#112233', '#445566', '#778899']);
    expect(p.designs[1]!.colors).toBeUndefined();
    expect(p.style).toBe('gradient');
    expect(parseProject({ ...raw, style: 'n\'importe' }).style).toBeUndefined();
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
