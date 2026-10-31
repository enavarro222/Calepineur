import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commit, fixUi, getProject, getUi, mutate, pushUndo, redo, replaceProject, resetStore, setUi, undo, useStore } from './store';
import { installPersistence, applyHash } from './bootstrap';
import { LS_IMG, LS_KEY, readSaved, removeUnusedImages, writeImage, writeProject } from './persistence';
import { project } from '../test/fixtures';

beforeEach(() => resetStore());

describe('annulation', () => {
  it('annule et rétablit', () => {
    const name = getProject().name;
    commit(p => { p.name = 'Autre'; });
    undo();
    expect(getProject().name).toBe(name);
    redo();
    expect(getProject().name).toBe('Autre');
  });

  it('regroupe les saisies d\'un même champ', () => {
    commit(p => { p.name = 'A'; }, { coalesce: 'name' });
    commit(p => { p.name = 'AB'; }, { coalesce: 'name' });
    expect(useStore.getState().past).toHaveLength(1);
  });

  it('sépare les saisies après le délai', () => {
    vi.useFakeTimers();
    try {
      commit(p => { p.name = 'A'; }, { coalesce: 'name' });
      vi.advanceTimersByTime(2000);
      commit(p => { p.name = 'AB'; }, { coalesce: 'name' });
      expect(useStore.getState().past).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('une nouvelle modification efface le rétablissement', () => {
    commit(p => { p.name = 'A'; });
    undo();
    commit(p => { p.name = 'B'; });
    expect(useStore.getState().future).toHaveLength(0);
  });

  it('limite l\'historique', () => {
    for (let i = 0; i < 100; i++) pushUndo();
    expect(useStore.getState().past).toHaveLength(80);
  });

  it('ne plante pas sans historique', () => {
    undo();
    redo();
    expect(useStore.getState().past).toHaveLength(0);
  });
});

describe('état dérivé', () => {
  it('affecte un motif aux nouveaux carreaux', () => {
    mutate(p => { p.walls[0]!.zone = [[-10, -10], [-10, 90], [260, 90], [260, -10]]; });
    const { project: p, comps } = useStore.getState();
    for (const t of comps[0]!.tiles) expect(p.walls[0]!.tiles[t.key]?.d).toBeTruthy();
  });

  it('remplace le motif sélectionné s\'il disparaît', () => {
    setUi({ design: 'B' });
    commit(p => { p.designs.splice(1, 1); });
    expect(getUi().design).toBe('A');
  });

  it('quitte un onglet de pan disparu', () => {
    const ui = { ...getUi(), tab: 'wall:5' };
    expect(fixUi(ui, getProject()).tab).toBe('wall:0');
    expect(fixUi(ui, { ...getProject(), walls: [] }).tab).toBe('tiles');
  });
});

describe('sauvegarde', () => {
  it('écrit après un court délai', () => {
    vi.useFakeTimers();
    const stop = installPersistence();
    try {
      commit(p => { p.name = 'Sauvé'; });
      expect(localStorage.getItem(LS_KEY)).toBeNull();
      vi.advanceTimersByTime(400);
      expect(readSaved()?.project.name).toBe('Sauvé');
    } finally {
      stop();
      vi.useRealTimers();
    }
  });

  // Régression : les modifications des 300 dernières millisecondes étaient perdues à la fermeture.
  it('écrit immédiatement quand la page se ferme', () => {
    const stop = installPersistence();
    commit(p => { p.name = 'Dernier geste'; });
    window.dispatchEvent(new Event('pagehide'));
    expect(readSaved()?.project.name).toBe('Dernier geste');
    stop();
  });

  it('prévient si le stockage est plein', () => {
    vi.useFakeTimers();
    const stop = installPersistence();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('plein'); });
    try {
      commit(p => { p.name = 'Trop'; });
      vi.advanceTimersByTime(400);
      expect(useStore.getState().toast?.msg).toMatch(/exporte/);
    } finally {
      stop();
      vi.useRealTimers();
    }
  });

  it('repart de la sauvegarde', () => {
    writeProject(project({ name: 'Rechargé' }));
    resetStore();
    expect(getProject().name).toBe('Rechargé');
  });

  it('ignore une sauvegarde corrompue', () => {
    localStorage.setItem(LS_KEY, '{cassé');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(readSaved()).toBeNull();
    resetStore();
    expect(getProject().walls.length).toBeGreaterThan(0);
  });

  it('recharge les images et nettoie les orphelines', () => {
    const p = project();
    p.designs[0]!.img = 'img:gardee';
    writeProject(p);
    writeImage('img:gardee', 'data:image/png;base64,AA');
    writeImage('img:orpheline', 'data:image/png;base64,BB');
    expect(readSaved()?.images['img:gardee']).toBeDefined();
    removeUnusedImages(p);
    expect(localStorage.getItem(`${LS_IMG}gardee`)).not.toBeNull();
    expect(localStorage.getItem(`${LS_IMG}orpheline`)).toBeNull();
  });
});

describe('adresse', () => {
  it('ouvre un onglet, une vue et un outil', () => {
    applyHash('#wall:1/photo/calib/labels');
    expect(getUi()).toMatchObject({ tab: 'wall:1', tool: 'calib', labels: true });
    expect(getUi().view[1]).toBe('photo');
  });

  it('ignore une adresse vide', () => {
    applyHash('');
    expect(getUi().tab).toBe('wall:0');
  });
});

it('remplace le projet en restant annulable', () => {
  const before = getProject().name;
  replaceProject(project({ name: 'Importé' }));
  expect(getProject().name).toBe('Importé');
  undo();
  expect(getProject().name).toBe(before);
});
