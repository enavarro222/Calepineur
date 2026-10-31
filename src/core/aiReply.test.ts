import { describe, expect, it } from 'vitest';
import { describeChanges, mergeAiProject, resolveConfig } from './aiReply';
import { project, wall } from '../test/fixtures';
import { parseProject } from './project';

const json = JSON.stringify(project({ name: 'Par IA' }));
const parseAiReply = (text: string) => resolveConfig(project(), text);
const patch = (v: unknown, base = project()) => resolveConfig(base, JSON.stringify(v));

describe('resolveConfig', () => {
  it('lit un JSON seul', () => {
    expect(parseAiReply(json).name).toBe('Par IA');
  });

  it('lit le bloc de code au milieu d\'une réponse', () => {
    const reply = `Voici ton projet :\n\n\`\`\`json\n${json}\n\`\`\`\n\nCotes estimées : hauteur du mur.`;
    expect(parseAiReply(reply).name).toBe('Par IA');
  });

  it('choisit le plus grand bloc de code', () => {
    const reply = `\`\`\`json\n{"a":1}\n\`\`\`\nEt le projet :\n\`\`\`\n${json}\n\`\`\``;
    expect(parseAiReply(reply).name).toBe('Par IA');
  });

  it('retrouve un JSON sans bloc de code', () => {
    expect(parseAiReply(`Le voici : ${json} Bonne pose !`).name).toBe('Par IA');
  });

  it('accepte un fichier exporté', () => {
    expect(parseAiReply(JSON.stringify({ state: project({ name: 'Export' }), images: {} })).name).toBe('Export');
  });

  it.each([
    ['du texte sans JSON', 'Je ne peux pas faire ça.', /aucun JSON/],
    ['un JSON coupé', '```json\n{"version":1,\n```', /aucun JSON/],
    ['un projet sans mur', JSON.stringify(project({ walls: [] })), /aucun mur/],
    ['un projet sans motif', JSON.stringify(project({ designs: [] })), /aucun motif/],
    ['deux murs de même id', JSON.stringify(project({ walls: [wall(), wall()] })), /même identifiant/],
    ['un mur sans dimension', JSON.stringify(project({ walls: [wall({ W: 0 })] })), /dimensions/],
    ['des millimètres', JSON.stringify(project({ walls: [wall({ W: 3500, H: 1200 })] })), /en cm/],
  ])('refuse %s', (_, text, message) => {
    expect(() => parseAiReply(text)).toThrow(message);
  });

  it('refuse deux motifs de même clé', () => {
    const p = project();
    p.designs[1]!.key = 'A';
    expect(() => parseAiReply(JSON.stringify(p))).toThrow(/même clé/);
  });

  // Une dimension à 0 pendant une saisie ne doit pas faire perdre une sauvegarde au rechargement.
  it('ne rend pas plus stricte la lecture d\'une sauvegarde', () => {
    expect(() => parseProject(project({ walls: [wall({ W: 0 })] }))).not.toThrow();
  });
});

describe('mergeAiProject', () => {
  const photo = { src: 'img:p', opacity: 1, blend: true, pts: [] };

  it('garde photo et retouches des murs conservés', () => {
    const current = project({ walls: [wall({ photo, tiles: { '1,1': { d: 'A', lk: true } } })] });
    const merged = mergeAiProject(current, project({ walls: [wall({ W: 300 })] }));
    expect(merged.walls[0]).toMatchObject({ W: 300, photo, tiles: { '1,1': { d: 'A', lk: true } } });
  });

  it('ne donne pas la photo d\'un mur à un nouveau mur', () => {
    const current = project({ walls: [wall({ photo })] });
    expect(mergeAiProject(current, project({ walls: [wall({ id: 'autre' })] })).walls[0]!.photo).toBeNull();
  });

  it('garde l\'image d\'un motif inchangé', () => {
    const current = project();
    current.designs[0]!.img = 'img:m';
    expect(mergeAiProject(current, project()).designs[0]!.img).toBe('img:m');
  });

  it('n\'attribue pas l\'image d\'un autre motif de même clé', () => {
    const current = project();
    current.designs[0]!.img = 'img:m';
    const next = project();
    next.designs[0]!.name = 'Autre motif';
    expect(mergeAiProject(current, next).designs[0]!.img).toBe('');
  });
});

describe('modification partielle', () => {
  it('ne change que les champs donnés', () => {
    const p = patch({ tile: { F: 15 }, walls: [{ id: 'w1', W: 250 }] });
    expect(p.tile).toMatchObject({ F: 15, joint: 0.2 });
    expect(p.walls[0]).toMatchObject({ W: 250, H: 60, name: 'Pan' });
    expect(p.designs).toHaveLength(3);
  });

  it('trouve un mur par son nom', () => {
    expect(patch({ walls: [{ name: 'Pan', H: 80 }] }).walls[0]!.H).toBe(80);
  });

  it('ajoute un mur avec une zone qui le couvre', () => {
    const p = patch({ walls: [{ id: 'nouveau', name: 'Îlot', W: 120, H: 40 }] });
    expect(p.walls).toHaveLength(2);
    expect(p.walls[1]).toMatchObject({ id: 'nouveau', name: 'Îlot', photo: null, tiles: {} });
    expect(p.walls[1]!.zone[2]).toEqual([130, 50]);
  });

  it('retire un mur et un motif', () => {
    const base = project({ walls: [wall(), wall({ id: 'w2' })] });
    const p = patch({ walls: [{ id: 'w2', remove: true }], designs: [{ key: 'C', remove: true }] }, base);
    expect(p.walls.map(w => w.id)).toEqual(['w1']);
    expect(p.designs.map(d => d.key)).toEqual(['A', 'B']);
  });

  it('modifie et ajoute des motifs', () => {
    const p = patch({ designs: [{ key: 'A', weight: 3 }, { key: 'Z', name: 'Nouveau' }] });
    expect(p.designs[0]).toMatchObject({ key: 'A', name: 'Alpha', weight: 3 });
    expect(p.designs[3]).toMatchObject({ key: 'Z', name: 'Nouveau', img: '', weight: 1 });
  });

  it('ne touche ni aux images ni aux retouches', () => {
    const pts = [0, 1, 2, 3].map(i => ({ wx: i, wy: i, px: i, py: i }));
    const photo = { src: 'img:p', opacity: 1, blend: true, pts };
    const base = project({ walls: [wall({ photo, tiles: { '1,1': { d: 'A' } } })] });
    base.designs[0]!.img = 'img:m';
    const p = patch({
      walls: [{ id: 'w1', photo: null, tiles: {} }],
      designs: [{ key: 'A', img: 'data:image/svg+xml,x' }],
    }, base);
    expect(p.walls[0]).toMatchObject({ photo, tiles: { '1,1': { d: 'A' } } });
    expect(p.designs[0]!.img).toBe('img:m');
  });

  it('n\'attrape rien d\'autre que les champs prévus', () => {
    const p = resolveConfig(project(), '{"name":"X","__proto__":{"pirate":1},"tile":{"__proto__":{"pirate":1},"pirate":1}}');
    expect(p.tile).not.toHaveProperty('pirate');
    expect(({} as Record<string, unknown>).pirate).toBeUndefined();
  });

  it('ne modifie pas le projet d\'origine', () => {
    const base = project();
    patch({ tile: { F: 15 }, walls: [{ id: 'w1', W: 1 }] }, base);
    expect(base.tile.F).toBe(10);
    expect(base.walls[0]!.W).toBe(100);
  });

  it.each([
    ['un objet sans modification', {}, /rien à modifier/],
    ['des champs inconnus', { pirate: 1 }, /rien à modifier/],
    ['un mur sans dimensions', { walls: [{ id: 'x' }] }, /nombre attendu/],
    ['un retrait de tous les murs', { walls: [{ id: 'w1', remove: true }] }, /aucun mur/],
    ['un carreau invalide', { tile: { F: 'grand' } }, /tile\.F/],
    ['des murs mal formés', { walls: 'non' }, /liste/],
    ['des millimètres', { walls: [{ id: 'w1', W: 3500, H: 1200 }] }, /en cm/],
  ])('refuse %s', (_, v, message) => {
    expect(() => patch(v)).toThrow(message);
  });
});

describe('describeChanges', () => {
  it('ne signale rien sans changement', () => {
    expect(describeChanges(project(), project())).toEqual([]);
  });

  it('décrit les changements de carreau et de mur', () => {
    const next = patch({ tile: { F: 15 }, walls: [{ id: 'w1', W: 250, obstacles: [{ name: 'Hotte', x: 1, y: 1, w: 5, h: 5 }] }] });
    expect(describeChanges(project(), next)).toEqual([
      'Carreau de 15 cm (avant : 10)',
      'Pan : largeur 250 cm (avant : 100), éléments : Hotte',
    ]);
  });

  it('décrit les ajouts et les retraits', () => {
    const base = project({ walls: [wall(), wall({ id: 'w2', name: 'Vieux' })] });
    const next = patch({ walls: [{ id: 'w2', remove: true }, { id: 'n', name: 'Neuf', W: 100, H: 50 }], designs: [{ key: 'C', remove: true }, { key: 'Z', name: 'Zèbre' }] }, base);
    expect(describeChanges(base, next)).toEqual([
      'Nouveau motif : Z Zèbre',
      'Motif retiré : C Gamma',
      'Nouveau pan : Neuf, 100 × 50 cm, 0 élément',
      'Pan retiré : Vieux',
    ]);
  });
});
