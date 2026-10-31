// Tests d'intégration : l'application entière, rendue et manipulée comme par un utilisateur.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { getComps, getProject, mutate, replaceProject, resetStore, setUi } from './store/store';
import { orderCounts } from './core/order';
import { serializeProject } from './core/project';
import { project, wall } from './test/fixtures';
import { release } from './store/tools';

beforeEach(() => {
  release();
  resetStore();
});

function setup() {
  const user = userEvent.setup();
  const view = render(<App />);
  const tab = (name: RegExp | string) => user.click(screen.getByRole('button', { name }));
  return { user, tab, ...view };
}

const stats = () => screen.getByTestId('stats').textContent ?? '';
const tileCount = () => Number(/^(\d+)/.exec(stats())?.[1]);

describe('démarrage', () => {
  it('ouvre le premier pan du projet d\'exemple', () => {
    const { container } = setup();
    expect(screen.getByRole('button', { name: 'Mur fenêtre' })).toHaveClass('on');
    expect(screen.getByLabelText('Largeur (cm)')).toHaveValue(240);
    expect(tileCount()).toBe(getComps()[0]!.stats.n);
    expect(container.querySelectorAll('svg.wall-svg use').length).toBe(tileCount());
  });

  it('propose tous les onglets', () => {
    setup();
    for (const name of ['Mur cuisson', 'Carreaux & motifs', 'Commande', 'Calepinage']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });
});

describe('édition d\'un pan', () => {
  it('recalcule en changeant une dimension', async () => {
    const { user } = setup();
    const before = tileCount();
    const width = screen.getByLabelText('Largeur (cm)');
    await user.clear(width);
    await user.type(width, '120');
    expect(tileCount()).toBeLessThan(before);
    expect(getProject().walls[0]!.W).toBe(120);
  });

  it('accepte une saisie incomplète sans l\'écraser', async () => {
    const { user } = setup();
    const width = screen.getByLabelText('Largeur (cm)');
    await user.clear(width);
    expect(width).toHaveValue(null);
    expect(getProject().walls[0]!.W).toBe(240);
  });

  it('annule une saisie d\'un seul coup', async () => {
    const { user } = setup();
    const name = screen.getByLabelText('Nom');
    await user.type(name, ' bis');
    expect(screen.getByRole('button', { name: 'Mur fenêtre bis' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('button', { name: 'Mur fenêtre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
  });

  it('ajoute puis supprime un élément', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: '+ Ajouter un élément' }));
    expect(getProject().walls[0]!.obstacles).toHaveLength(3);
    const remove = screen.getByRole('button', { name: 'Supprimer Élément' });
    await user.click(remove);
    expect(getProject().walls[0]!.obstacles).toHaveLength(2);
  });

  it('modifie un élément depuis le tableau', async () => {
    const { user } = setup();
    const x = screen.getByLabelText('x de Fenêtre');
    await user.clear(x);
    await user.type(x, '20');
    expect(getProject().walls[0]!.obstacles[0]!.x).toBe(20);
  });

  it('change la zone depuis le texte', async () => {
    const { user } = setup();
    const before = tileCount();
    const zone = screen.getByLabelText('Points du contour (x y, en cm)');
    await user.clear(zone);
    await user.type(zone, '-10 -10{Enter}-10 30{Enter}250 30{Enter}250 -10');
    await user.tab();
    expect(getProject().walls[0]!.zone).toHaveLength(4);
    expect(tileCount()).toBeLessThan(before);
  });

  it('refuse une zone de moins de 3 points', async () => {
    const { user } = setup();
    const zone = screen.getByLabelText('Points du contour (x y, en cm)');
    await user.clear(zone);
    await user.type(zone, '1 2');
    await user.tab();
    expect(screen.getByRole('status')).toHaveTextContent('au moins 3 points');
    expect(getProject().walls[0]!.zone).toHaveLength(4);
  });

  it('bascule en bord coupé net', async () => {
    const { user } = setup();
    await user.click(screen.getByLabelText('Bord coupé net'));
    expect(getProject().walls[0]!.zoneMode).toBe('cut');
    expect(screen.getByLabelText('Bord coupé net')).toBeChecked();
  });

  it('propose d\'effacer les retouches au pinceau', async () => {
    const { user } = setup();
    expect(screen.queryByRole('button', { name: /Effacer les retouches/ })).toBeNull();
    const key = getComps()[0]!.tiles[0]!.key;
    act(() => mutate(p => { p.walls[0]!.tiles[key]!.st = 'del'; }));
    await user.click(screen.getByRole('button', { name: 'Effacer les retouches au pinceau (1)' }));
    expect(screen.queryByRole('button', { name: /Effacer les retouches/ })).toBeNull();
  });

  it('propose de raccorder à partir du deuxième pan', async () => {
    const { tab } = setup();
    expect(screen.queryByRole('button', { name: /Raccorder/ })).toBeNull();
    await tab('Mur cuisson');
    expect(screen.getByRole('button', { name: 'Raccorder à « Mur fenêtre »' })).toBeInTheDocument();
  });
});

describe('barre d\'outils', () => {
  it('sélectionne un motif au clavier et repasse sur Peindre', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Grille' }));
    await user.keyboard('3');
    expect(screen.getByRole('button', { name: 'Peindre' })).toHaveClass('on');
    expect(screen.getByTitle('C — Pétales')).toHaveClass('on');
  });

  it('annule au clavier', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Mélanger' }));
    const seed = getProject().seed;
    await user.keyboard('{Control>}z{/Control}');
    expect(getProject().seed).toBe(seed - 1);
    await user.keyboard('{Control>}y{/Control}');
    expect(getProject().seed).toBe(seed);
  });

  it('ne capte pas le clavier pendant une saisie', async () => {
    const { user } = setup();
    await user.click(screen.getByLabelText('Nom'));
    await user.keyboard('3');
    expect(screen.getByTitle('A — Losanges')).toHaveClass('on');
  });

  it('affiche les emplacements libres avec le pinceau', async () => {
    const { user, container } = setup();
    expect(container.querySelector('[data-slot]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Pinceau zone' }));
    expect(container.querySelector('[data-slot]')).not.toBeNull();
  });

  it('affiche les poignées du contour', async () => {
    const { user, container } = setup();
    await user.click(screen.getByRole('button', { name: 'Contour zone' }));
    expect(container.querySelectorAll('[data-handle=zone]')).toHaveLength(4);
  });

  it('affiche les étiquettes', async () => {
    const { user, container } = setup();
    expect(container.querySelector('.lbl')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Repères' }));
    expect(container.querySelector('.lbl')).not.toBeNull();
  });

  it('remplace les outils du plan en vue Photo', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Grille' }));
    await user.click(screen.getByRole('button', { name: 'Photo' }));
    expect(screen.queryByRole('button', { name: 'Grille' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Caler la photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Peindre' })).toHaveClass('on');
    expect(screen.getByText('Pas de photo pour ce pan.')).toBeInTheDocument();
  });
});

describe('Carreaux & motifs', () => {
  it('recalcule tout en changeant la taille du carreau', async () => {
    const { user, tab } = setup();
    const before = getComps()[0]!.stats.n;
    await tab('Carreaux & motifs');
    const size = screen.getByLabelText('Largeur plat à plat (cm)');
    await user.clear(size);
    await user.type(size, '20');
    expect(getComps()[0]!.stats.n).toBeLessThan(before);
    expect(screen.getByText(/Pointe à pointe/)).toHaveTextContent('23,1 cm');
  });

  it('ignore une taille nulle', async () => {
    const { user, tab } = setup();
    await tab('Carreaux & motifs');
    const size = screen.getByLabelText('Largeur plat à plat (cm)');
    await user.clear(size);
    await user.type(size, '0');
    expect(getProject().tile.F).toBe(12);
  });

  it('gère les motifs', async () => {
    const { user, tab } = setup();
    await tab('Carreaux & motifs');
    await user.click(screen.getByRole('button', { name: '+ Ajouter un motif' }));
    expect(getProject().designs).toHaveLength(6);
    await user.click(screen.getByRole('button', { name: 'Supprimer le motif F' }));
    expect(getProject().designs).toHaveLength(5);
    const weight = screen.getByLabelText('Poids du motif A');
    await user.clear(weight);
    await user.type(weight, '3');
    expect(getProject().designs[0]!.weight).toBe(3);
  });

  it('dessine un aperçu', async () => {
    const { tab, container } = setup();
    await tab('Carreaux & motifs');
    expect(container.querySelector('#tile-preview svg use')).not.toBeNull();
  });

  it('demande confirmation pour tout remélanger', async () => {
    const { user, tab } = setup();
    await tab('Carreaux & motifs');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const seed = getProject().seed;
    await user.click(screen.getByRole('button', { name: 'Tout re-mélanger' }));
    expect(confirm).toHaveBeenCalled();
    expect(getProject().seed).toBe(seed);
  });
});

describe('Commande', () => {
  it('affiche les quantités du calcul', async () => {
    const { tab } = setup();
    await tab('Commande');
    const oc = orderCounts(getProject(), getComps());
    expect(screen.getByTestId('to-order')).toHaveTextContent(String(oc.toOrder));
  });

  it('suit la marge', async () => {
    const { user, tab } = setup();
    await tab('Commande');
    const margin = screen.getByLabelText('Casse / marge (%)');
    await user.clear(margin);
    await user.type(margin, '0');
    const oc = orderCounts(getProject(), getComps());
    expect(oc.toOrder).toBe(oc.total);
    expect(screen.getByTestId('to-order')).toHaveTextContent(String(oc.total));
  });

  it('compte les boîtes', async () => {
    const { user, tab } = setup();
    await tab('Commande');
    const perBox = screen.getByLabelText('Carreaux par boîte');
    await user.clear(perBox);
    await user.type(perBox, '25');
    const { toOrder } = orderCounts(getProject(), getComps());
    expect(screen.getByText(/boîtes? de 25/)).toHaveTextContent(`(${Math.ceil(toOrder / 25) * 25 - toOrder} de rab)`);
  });
});

describe('Calepinage', () => {
  it('produit un document complet', async () => {
    const { tab, container } = setup();
    await tab('Calepinage');
    const doc = container.querySelector<HTMLElement>('#doc')!;
    expect(within(doc).getByRole('heading', { level: 1 })).toHaveTextContent("Cuisine d'exemple — calepinage");
    expect(within(doc).getByRole('heading', { name: /^Mur fenêtre — coupes/ })).toBeInTheDocument();
    expect(doc.querySelectorAll('.lbl').length).toBeGreaterThan(50);
    expect(doc.querySelectorAll('table.setout')).toHaveLength(2);
    const cuts = getComps().flatMap(c => c.tiles).filter(t => !t.full);
    expect(doc.querySelectorAll('figure.cut')).toHaveLength(cuts.length);
  });

  it('adapte les repères à l\'orientation', async () => {
    const { user, tab } = setup();
    await tab('Carreaux & motifs');
    await user.click(screen.getByLabelText('⬢ Pointes en haut'));
    await tab('Calepinage');
    expect(screen.getAllByRole('columnheader', { name: 'Rang' })[0]).toBeInTheDocument();
    expect(screen.getByText(/pointes en haut\./)).toBeInTheDocument();
  });

  it('passe sur le document avant une impression du navigateur', () => {
    setup();
    act(() => { window.dispatchEvent(new Event('beforeprint')); });
    expect(screen.getByRole('button', { name: 'Imprimer / PDF' })).toBeInTheDocument();
  });
});

describe('import', () => {
  it('ouvre un fichier projet', async () => {
    const { user } = setup();
    const p = project({ name: 'Autre', walls: [wall({ name: 'Mur importé' })] });
    const input = document.querySelector<HTMLInputElement>('input[accept*=json]')!;
    await user.upload(input, new File([serializeProject(p, {})], 'p.json', { type: 'application/json' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mur importé' })).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Projet importé.');
  });
});

it('survit à un projet sans pan', async () => {
  replaceProject(project({ walls: [] }));
  setUi({ tab: 'tiles' });
  const { tab, container } = setup();
  expect(screen.getByLabelText('Largeur plat à plat (cm)')).toBeInTheDocument();
  await tab('Commande');
  expect(screen.getByTestId('to-order')).toHaveTextContent('0');
  await tab('Calepinage');
  expect(container.querySelector('#doc')).not.toBeNull();
});
