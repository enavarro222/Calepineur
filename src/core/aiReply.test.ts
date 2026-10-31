import { describe, expect, it } from 'vitest';
import { mergeAiProject, parseAiReply, summarizeProject } from './aiReply';
import { project, wall } from '../test/fixtures';
import { parseProject } from './project';

const json = JSON.stringify(project({ name: 'Par IA' }));

describe('parseAiReply', () => {
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

it('résume le projet', () => {
  const p = project({ walls: [wall({ name: 'Crédence', obstacles: [{ name: 'Prise', x: 1, y: 1, w: 1, h: 1 }] })] });
  expect(summarizeProject(p)).toEqual([
    'Crédence : 100 × 60 cm, 1 élément',
    'Carreau de 10 cm, joint de 2 mm',
    '3 motifs : Alpha, Beta, Gamma',
  ]);
});
