// Tests d'intégration : l'application entière, rendue et manipulée comme par un utilisateur.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { getComps, getProject, mutate, replaceProject, resetStore, setUi } from './store/store';
import { orderCounts } from './core/order';
import { serializeProject } from './core/project';
import { project, wall } from './test/fixtures';
import { release } from './store/tools';
import { applyHash } from './store/bootstrap';

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

describe('navigation', () => {
  it('sépare les murs des étapes du projet', () => {
    setup();
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('button', { name: 'Pans' })).toHaveClass('on');
    expect(within(nav).queryByRole('button', { name: 'Mur fenêtre' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mur fenêtre' })).toHaveClass('on');
  });

  it('n\'affiche les murs que sur l\'onglet Pans', async () => {
    const { tab } = setup();
    await tab('Commande');
    expect(screen.queryByRole('button', { name: '+ Ajouter un pan' })).toBeNull();
    await tab('Pans');
    expect(screen.getByRole('button', { name: '+ Ajouter un pan' })).toBeInTheDocument();
  });

  it('rouvre le dernier mur consulté', async () => {
    const { tab } = setup();
    await tab('Mur cuisson');
    await tab('Commande');
    await tab('Pans');
    expect(screen.getByRole('button', { name: 'Mur cuisson' })).toHaveClass('on');
  });

  it('ajoute un mur et l\'ouvre', async () => {
    const { tab } = setup();
    await tab('+ Ajouter un pan');
    expect(screen.getByRole('button', { name: 'Pan 3' })).toHaveClass('on');
    expect(screen.getByLabelText('Nom')).toHaveValue('Pan 3');
  });

  it('crée un premier mur depuis un projet sans mur', async () => {
    replaceProject(project({ walls: [] }));
    const { tab } = setup();
    await tab('Pans');
    expect(screen.getByLabelText('Nom')).toHaveValue('Pan 1');
  });
});

describe('préparation avec une IA', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Préparer avec une IA' }));
    return screen.getByRole('dialog', { name: 'Préparer avec une IA' });
  };
  const reply = '```json\n' + JSON.stringify(project({ name: 'Par IA', walls: [wall({ id: 'ia-1', name: 'Mur IA' })] })) + '\n```';

  it('invite à configurer le projet d\'exemple, une seule fois', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: "Fermer l'invitation" }));
    expect(screen.queryByRole('button', { name: 'Configurer avec mon IA' })).toBeNull();
    cleanup();
    setup();
    expect(screen.queryByRole('button', { name: 'Configurer avec mon IA' })).toBeNull();
  });

  it('n\'invite plus une fois le projet personnalisé', () => {
    replaceProject(project());
    setup();
    expect(screen.queryByRole('button', { name: 'Configurer avec mon IA' })).toBeNull();
  });

  it('propose des liens avec la consigne', async () => {
    const { user } = setup();
    const dialog = await open(user);
    const claude = within(dialog).getByRole('link', { name: 'Claude' });
    expect(claude.getAttribute('href')).toMatch(/^https:\/\/claude\.ai\/new\?q=Tu%20m'aides/);
    expect(claude).toHaveAttribute('target', '_blank');
    expect(claude).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(dialog).getByRole('link', { name: 'ChatGPT' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Gemini' })).toHaveAttribute('href', 'https://gemini.google.com/app');
  });

  it('copie la consigne', async () => {
    const { user } = setup();
    const dialog = await open(user);
    await user.click(within(dialog).getByRole('button', { name: 'Copier la consigne' }));
    expect(await navigator.clipboard.readText()).toMatch(/^Tu m'aides/);
    expect(screen.getByRole('status')).toHaveTextContent('Consigne copiée.');
  });

  it('part du projet actuel à la demande', async () => {
    const { user } = setup();
    const dialog = await open(user);
    const prompt = within(dialog).getByLabelText('Consigne');
    expect((prompt as HTMLTextAreaElement).value).not.toContain('Mur fenêtre');
    await user.click(within(dialog).getByLabelText(/Partir de mon projet actuel/));
    expect((prompt as HTMLTextAreaElement).value).toContain('Mur fenêtre');
  });

  it('résume la réponse puis l\'applique, de façon annulable', async () => {
    const { user } = setup();
    const dialog = await open(user);
    await user.click(within(dialog).getByLabelText('Réponse de ton IA'));
    await user.paste(reply);
    await user.click(within(dialog).getByRole('button', { name: 'Vérifier' }));
    expect(within(dialog).getByText('Nouveau pan : Mur IA, 100 × 60 cm, 0 élément')).toBeInTheDocument();
    expect(getProject().name).not.toBe('Par IA');

    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mur IA' })).toHaveClass('on');

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('button', { name: 'Mur fenêtre' })).toBeInTheDocument();
  });

  it('explique une réponse invalide sans toucher au projet', async () => {
    const { user } = setup();
    const before = getProject();
    const dialog = await open(user);
    await user.click(within(dialog).getByLabelText('Réponse de ton IA'));
    await user.paste('Désolé, je ne peux pas.');
    await user.click(within(dialog).getByRole('button', { name: 'Vérifier' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('aucun JSON');
    expect(getProject()).toBe(before);
  });

  it('accepte une simple correction collée', async () => {
    const { user } = setup();
    const dialog = await open(user);
    await user.click(within(dialog).getByLabelText('Réponse de ton IA'));
    await user.paste('{"walls":[{"name":"Mur fenêtre","W":200}]}');
    await user.click(within(dialog).getByRole('button', { name: 'Vérifier' }));
    expect(within(dialog).getByText('Mur fenêtre : largeur 200 cm (avant : 240)')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(getProject().walls[0]!.W).toBe(200);
    expect(getProject().walls).toHaveLength(2);
  });

  it('donne le lien vers les instructions pour les IA', async () => {
    const { user } = setup();
    const dialog = await open(user);
    expect(within(dialog).getByLabelText('Lien pour ton IA')).toHaveValue('https://enavarro222.github.io/Calepineur/llms.txt');
  });

  it('se ferme avec Échap', async () => {
    const { user } = setup();
    await open(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('lien de configuration', () => {
  const link = (v: unknown) => `#config=${encodeURIComponent(JSON.stringify(v))}`;

  it('attend la validation avant de changer quoi que ce soit', async () => {
    const { user } = setup();
    const before = getProject();
    act(() => applyHash(link({ walls: [{ name: 'Mur fenêtre', W: 200 }] })));
    const dialog = screen.getByRole('dialog', { name: 'Appliquer ce lien de configuration ?' });
    expect(within(dialog).getByText('Mur fenêtre : largeur 200 cm (avant : 240)')).toBeInTheDocument();
    expect(getProject()).toBe(before);
    await user.click(within(dialog).getByRole('button', { name: 'Appliquer' }));
    expect(getProject().walls[0]!.W).toBe(200);
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(getProject().walls[0]!.W).toBe(240);
  });

  it('peut être ignoré', async () => {
    const { user } = setup();
    const before = getProject();
    act(() => applyHash(link({ tile: { F: 20 } })));
    await user.click(screen.getByRole('button', { name: 'Ignorer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getProject()).toBe(before);
  });

  it('retire la configuration de l\'adresse', () => {
    location.hash = link({ tile: { F: 20 } });
    setup();
    act(() => applyHash(location.hash));
    expect(location.hash).toBe('');
  });

  it('explique un lien invalide', () => {
    setup();
    act(() => applyHash('#config=%7Bcass%C3%A9'));
    expect(screen.getByRole('status')).toHaveTextContent('Lien de configuration invalide');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('tolère un lien dont l\'encodage est abîmé', () => {
    setup();
    act(() => applyHash('#config={"tile":{"F":20},"name":"100%"}'));
    expect(screen.getByRole('dialog')).toHaveTextContent('Carreau de 20 cm');
  });
});

describe('calage reçu sans photo', () => {
  const calib = [
    { wx: 0, wy: 0, u: 0.1, v: 0.8 }, { wx: 240, wy: 0, u: 0.9, v: 0.8 },
    { wx: 240, wy: 75, u: 0.9, v: 0.2 }, { wx: 0, wy: 75, u: 0.1, v: 0.2 },
  ];

  it('indique que la photo est attendue', async () => {
    const { user } = setup();
    act(() => applyHash(`#config=${encodeURIComponent(JSON.stringify({ walls: [{ name: 'Mur fenêtre', calib }] }))}`));
    await user.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(screen.getByRole('status')).toHaveTextContent('le calage est prêt');
    expect(screen.getByText('Calage prêt : choisis la photo de ce mur, sans la recadrer.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Photo' }));
    expect(screen.getAllByText(/Calage prêt/)).toHaveLength(2);
  });
});

describe('découpe reçue sans photo', () => {
  it('indique que la photo des carreaux est attendue', async () => {
    const { user, tab } = setup();
    const crop = { u: 0, v: 0, w: 0.5, h: 0.5 };
    act(() => applyHash(`#config=${encodeURIComponent(JSON.stringify({ designs: [{ key: 'A', crop }, { key: 'B', crop }] }))}`));
    await user.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(screen.getByRole('status')).toHaveTextContent('la découpe est prête');
    await tab('Carreaux & motifs');
    expect(screen.getByText(/Découpe prête pour 2 motifs/)).toBeInTheDocument();
    expect(screen.getByText('Choisir la photo des carreaux…')).toBeInTheDocument();
  });

  it('ne dit rien sans découpe', async () => {
    const { tab } = setup();
    await tab('Carreaux & motifs');
    expect(screen.queryByText(/Découpe prête/)).toBeNull();
  });
});

describe('couleurs des motifs', () => {
  it('montre trois couleurs par motif, la teinte moyenne pour un motif sans couleurs', async () => {
    const { tab } = setup();
    await tab('Carreaux & motifs');
    const first = getProject().designs[0]!;
    const inputs = ['primaire', 'secondaire', 'tertiaire'].map(n => screen.getByLabelText(`Couleur ${n} du motif ${first.key}`) as HTMLInputElement);
    expect(inputs.map(i => i.value)).toEqual([first.color, first.color, first.color]);
  });

  it('modifie une couleur sans toucher aux autres', async () => {
    const { tab } = setup();
    await tab('Carreaux & motifs');
    const first = getProject().designs[0]!;
    fireEvent.change(screen.getByLabelText(`Couleur secondaire du motif ${first.key}`), { target: { value: '#123456' } });
    expect(getProject().designs[0]!.colors).toEqual([first.color, '#123456', first.color]);
  });
});

describe('harmonie', () => {
  it('affiche la note', () => {
    setup();
    expect(screen.getByTestId('harmony')).toHaveTextContent(/Harmonie \d+\/100/);
  });

  it('surligne les défauts à la demande', async () => {
    const { user, container } = setup();
    expect(container.querySelector('[data-testid=defects]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Défauts' }));
    expect(container.querySelector('[data-testid=defects]')).not.toBeNull();
  });

  it('propose plusieurs répartitions et applique le choix, annulable', async () => {
    const { user } = setup();
    const before = getProject();
    await user.click(screen.getByRole('button', { name: 'Harmoniser' }));
    const dialog = screen.getByRole('dialog', { name: 'Harmoniser la répartition' });
    const cards = await within(dialog).findAllByTestId('proposal');
    expect(cards).toHaveLength(4);
    await user.click(within(cards[0]!).getByRole('button', { name: 'Choisir' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getProject()).not.toBe(before);
    expect(orderCounts(getProject(), getComps()).toOrder).toBe(orderCounts(before, getComps()).toOrder);
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(getProject().walls[0]!.tiles).toEqual(before.walls[0]!.tiles);
  });

  it('propose un dégradé dans plusieurs sens et retient le style choisi', async () => {
    const { user } = setup();
    const before = orderCounts(getProject(), getComps());
    await user.click(screen.getByRole('button', { name: 'Harmoniser' }));
    const dialog = screen.getByRole('dialog', { name: 'Harmoniser la répartition' });
    await user.click(within(dialog).getByRole('radio', { name: 'Dégradé' }));
    const cards = await within(dialog).findAllByTestId('proposal');
    expect(cards[2]).toHaveTextContent(/en bas, .* en haut/);
    await user.click(within(cards[0]!).getByRole('button', { name: 'Choisir' }));
    expect(getProject().style).toBe('gradient');
    expect(orderCounts(getProject(), getComps()).toOrder).toBe(before.toOrder);
    expect(screen.getByTestId('harmony')).not.toHaveTextContent(/tache/);
  });

  it('annule et rétablit plusieurs harmonisations de suite', async () => {
    const { user } = setup();
    const choose = async (style: string) => {
      await user.click(screen.getByRole('button', { name: 'Harmoniser' }));
      const dialog = screen.getByRole('dialog', { name: 'Harmoniser la répartition' });
      await user.click(within(dialog).getByRole('radio', { name: style }));
      const [card] = await within(dialog).findAllByTestId('proposal');
      await user.click(within(card!).getByRole('button', { name: 'Choisir' }));
      return getProject();
    };
    const start = getProject();
    const first = await choose('Naturel');
    const second = await choose('Vagues de couleur');
    const undo = () => user.click(screen.getByRole('button', { name: 'Annuler' }));
    const redo = () => user.click(screen.getByRole('button', { name: 'Rétablir' }));
    await undo();
    expect(getProject()).toEqual(first);
    await undo();
    expect(getProject()).toEqual(start);
    await redo();
    expect(getProject()).toEqual(first);
    await redo();
    expect(getProject()).toEqual(second);
    expect(getProject().style).toBe('waves');
  });

  it('garde le style et le sens choisis quand on mélange', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Harmoniser' }));
    const dialog = screen.getByRole('dialog', { name: 'Harmoniser la répartition' });
    await user.click(within(dialog).getByRole('radio', { name: 'Dégradé' }));
    const cards = await within(dialog).findAllByTestId('proposal');
    await user.click(within(cards[2]!).getByRole('button', { name: 'Choisir' }));
    const chosen = getProject();
    expect(chosen).toMatchObject({ style: 'gradient', styleVariant: 2 });
    await user.click(screen.getByRole('button', { name: 'Mélanger' }));
    const mixed = getProject();
    expect(mixed).toMatchObject({ style: 'gradient', styleVariant: 2 });
    expect(mixed.walls.map(w => w.tiles)).not.toEqual(chosen.walls.map(w => w.tiles));
    expect(orderCounts(mixed, getComps()).toOrder).toBe(orderCounts(chosen, getComps()).toOrder);
    expect(screen.getByTestId('harmony')).not.toHaveTextContent(/voisins? identiques?/);
  });

  it('mélange au hasard tant qu\'aucun style n\'est choisi', async () => {
    const { user } = setup();
    expect(getProject().style).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Mélanger' }));
    expect(getProject().style).toBeUndefined();
  });

  it('se ferme avec Échap sans rien changer', async () => {
    const { user } = setup();
    const before = getProject();
    await user.click(screen.getByRole('button', { name: 'Harmoniser' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getProject()).toBe(before);
  });

  it('propose l\'outil Échanger en vue Plan et Photo', async () => {
    const { user } = setup();
    expect(screen.getByRole('button', { name: 'Échanger' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Photo' }));
    expect(screen.getByRole('button', { name: 'Échanger' })).toBeInTheDocument();
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

  it('garde la grille raccordée quand le pan part plus bas que le précédent', async () => {
    const { user, tab } = setup();
    await tab('Mur cuisson');
    await user.click(screen.getByRole('button', { name: 'Raccorder à « Mur fenêtre »' }));
    const prev = getProject().walls[0]!;
    expect(getProject().walls[1]!.oy).toBe(prev.oy);
    const dy = screen.getByLabelText('Décalage en hauteur avec « Mur fenêtre » (cm)');
    await user.clear(dy);
    await user.type(dy, '-90');
    expect(getProject().walls[1]!.joinDy).toBe(-90);
    expect(getProject().walls[1]!.oy).toBeCloseTo(prev.oy + 90, 6);
    expect(screen.getByLabelText('Angle commun avec « Mur fenêtre »')).toBeChecked();
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
