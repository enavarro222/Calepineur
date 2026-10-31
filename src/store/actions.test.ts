import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDesign, addWall, clearBrush, deleteDesign, deleteWall, importFile, linkToPrevious, optimize, printPlan, removePhoto, renameDesignKey, resetProject, shuffle,
} from './actions';
import { getComps, getProject, getUi, mutate, replaceProject, resetStore, setUi, undo, useStore } from './store';
import { serializeProject } from '../core/project';
import { project, wall } from '../test/fixtures';

const PNG = 'data:image/png;base64,AAAA';
const jsonFile = (text: string) => new File([text], 'projet.json', { type: 'application/json' });

beforeEach(() => resetStore());

describe('motifs', () => {
  it('ajoute un motif avec une clé libre', () => {
    addDesign();
    expect(getProject().designs.at(-1)?.key).toBe('F');
  });

  it('garde au moins un motif', () => {
    replaceProject(project({ designs: [project().designs[0]!] }));
    deleteDesign(0);
    expect(getProject().designs).toHaveLength(1);
  });

  it('réaffecte les carreaux d\'un motif supprimé', () => {
    deleteDesign(0);
    const { project: p, comps } = useStore.getState();
    for (const t of comps[0]!.tiles) expect(p.walls[0]!.tiles[t.key]?.d).not.toBe('A');
  });

  it('renomme une clé partout', () => {
    setUi({ design: 'A' });
    const before = Object.values(getProject().walls[0]!.tiles).filter(a => a.d === 'A').length;
    renameDesignKey(0, ' x1 ');
    const after = Object.values(getProject().walls[0]!.tiles).filter(a => a.d === 'X1').length;
    expect(after).toBe(before);
    expect(getUi().design).toBe('X1');
  });

  it('refuse une clé vide ou déjà prise', () => {
    renameDesignKey(0, 'B');
    renameDesignKey(0, '  ');
    expect(getProject().designs[0]!.key).toBe('A');
  });
});

describe('mélange', () => {
  it('garde les carreaux peints à la main', () => {
    const key = getComps()[0]!.tiles[3]!.key;
    mutate(p => { p.walls[0]!.tiles[key] = { d: 'E', lk: true }; });
    shuffle(true);
    expect(getProject().walls[0]!.tiles[key]).toMatchObject({ d: 'E', lk: true });
  });

  it('change la répartition et reste annulable', () => {
    const before = getProject().walls[0]!.tiles;
    shuffle(true);
    expect(getProject().walls[0]!.tiles).not.toEqual(before);
    undo();
    expect(getProject().walls[0]!.tiles).toEqual(before);
  });
});

describe('pans', () => {
  it('ajoute un pan et l\'ouvre', () => {
    addWall();
    expect(getProject().walls).toHaveLength(3);
    expect(getUi().tab).toBe('wall:2');
  });

  it('demande confirmation avant de supprimer', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    deleteWall(0);
    expect(getProject().walls).toHaveLength(2);
    confirm.mockReturnValue(true);
    deleteWall(0);
    expect(getProject().walls).toHaveLength(1);
  });

  it('prolonge la grille du pan précédent à travers l\'angle', () => {
    linkToPrevious(1);
    const [a, b] = getProject().walls;
    expect(b!.ox).toBeCloseTo(a!.ox - a!.W, 1);
    expect(b!.oy).toBe(a!.oy);
  });

  it('efface les retouches au pinceau', () => {
    const n = getComps()[0]!.stats.n;
    const key = getComps()[0]!.tiles[3]!.key;
    mutate(p => { p.walls[0]!.tiles[key]!.st = 'del'; });
    expect(getComps()[0]!.stats.n).toBe(n - 1);
    clearBrush(0);
    expect(getComps()[0]!.stats.n).toBe(n);
    expect(Object.values(getProject().walls[0]!.tiles).some(a => a.st)).toBe(false);
  });

  it('retire une photo', () => {
    replaceProject(project({ walls: [wall({ photo: { src: 'img:a', opacity: 1, blend: true, pts: [] } })] }));
    removePhoto(0);
    expect(getProject().walls[0]!.photo).toBeNull();
  });
});

describe('optimisation', () => {
  it('déplace une grille mal placée, en une annulation', () => {
    vi.useFakeTimers();
    try {
      replaceProject(project({ walls: [wall({ ox: 3.3, oy: 2.1 })] }));
      optimize(0, false);
      vi.advanceTimersByTime(50);
      expect(getProject().walls[0]!.ox).not.toBe(3.3);
      expect(useStore.getState().toast?.msg).toMatch(/Grille déplacée/);
      undo();
      expect(getProject().walls[0]!.ox).toBe(3.3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('import', () => {
  it('charge un projet et ses images', async () => {
    const p = project({ name: 'Importé' });
    p.designs[0]!.img = 'img:a';
    await importFile(jsonFile(serializeProject(p, { 'img:a': PNG })));
    expect(getProject().name).toBe('Importé');
    expect(useStore.getState().images['img:a']).toBe(PNG);
    expect(useStore.getState().toast?.msg).toBe('Projet importé.');
    expect(localStorage.getItem('calepineur.img.a')).toBe(PNG);
  });

  it('signale les images manquantes', async () => {
    const p = project();
    p.designs[0]!.img = 'motifs/A.jpg';
    await importFile(jsonFile(JSON.stringify({ state: p, images: {} })));
    expect(useStore.getState().toast?.msg).toMatch(/1 image absente/);
  });

  it('garde le projet en cours si le fichier est mauvais', async () => {
    const before = getProject();
    await importFile(jsonFile('{"state":{"version":9}}'));
    expect(getProject()).toBe(before);
    expect(useStore.getState().toast?.msg).toMatch(/Impossible de lire/);
  });
});

it('repart de l\'exemple après confirmation', () => {
  replaceProject(project({ name: 'À effacer' }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  resetProject();
  expect(getProject().name).toBe("Cuisine d'exemple");
});

it('imprime sur l\'onglet Calepinage', () => {
  vi.useFakeTimers();
  const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
  try {
    printPlan();
    expect(getUi().tab).toBe('print');
    vi.advanceTimersByTime(200);
    expect(print).toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
