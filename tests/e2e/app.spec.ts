import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { dragOnWall, expectNoErrors, failOnConsoleErrors, pngFile, tileCount, wallToScreen } from './helpers';

const WALL_H = 75; // hauteur du premier pan de l'exemple

let errors: string[];

test.beforeEach(async ({ page }) => {
  errors = failOnConsoleErrors(page);
  await page.goto('./');
  await expect(page.getByTestId('stats')).toBeVisible();
});

test.afterEach(async () => {
  await expectNoErrors(errors);
});

test('ouvre le projet d\'exemple', async ({ page }) => {
  await expect(page).toHaveTitle('Calepineur');
  await expect(page.getByRole('button', { name: 'Mur fenêtre' })).toHaveClass('on');
  expect(await tileCount(page)).toBeGreaterThan(50);
  await expect(page.locator('#stage image, #stage use').first()).toBeAttached();
});

test('peint un carreau à la souris, puis annule', async ({ page }) => {
  await page.keyboard.press('3');
  const p = await wallToScreen(page, 60, 15, WALL_H);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await page.mouse.move(p.x + 1, p.y);
  await expect(page.locator('.hov')).toContainText('· C Pétales');

  await page.keyboard.press('Control+z');
  await page.mouse.move(p.x, p.y);
  await expect(page.getByRole('button', { name: 'Annuler' })).toBeDisabled();
});

test('retouche la zone au pinceau', async ({ page }) => {
  const start = await tileCount(page);
  await page.getByRole('button', { name: 'Pinceau zone' }).click();

  await dragOnWall(page, [20, 68], [70, 68], WALL_H);
  const added = await tileCount(page);
  expect(added).toBeGreaterThan(start);
  await expect(page.getByRole('button', { name: /Effacer les retouches/ })).toBeVisible();

  await dragOnWall(page, [20, 15], [70, 15], WALL_H);
  const removed = await tileCount(page);
  expect(removed).toBeLessThan(added);

  const p = await wallToScreen(page, 40, 30, WALL_H);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  expect(await tileCount(page)).toBe(removed - 1);

  await page.getByRole('button', { name: /Effacer les retouches/ }).click();
  expect(await tileCount(page)).toBe(start);
});

test('étire le contour de la zone', async ({ page }) => {
  const start = await tileCount(page);
  await page.getByRole('button', { name: 'Contour zone' }).click();
  await dragOnWall(page, [120, 58], [120, 74], WALL_H);
  await expect(page.locator('[data-handle=zone]')).toHaveCount(5);
  expect(await tileCount(page)).toBeGreaterThan(start);
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('[data-handle=zone]')).toHaveCount(4);
  expect(await tileCount(page)).toBe(start);
});

test('déplace un élément à la souris', async ({ page }) => {
  await page.getByRole('button', { name: 'Éléments' }).click();
  await dragOnWall(page, [208, 30], [228, 40], WALL_H);
  await expect(page.getByLabel('x de Prise')).not.toHaveValue('200');
});

test('garde le travail après un rechargement immédiat', async ({ page }) => {
  await page.getByLabel('Nom', { exact: true }).fill('Mur renommé');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mur renommé' })).toBeVisible();
});

test('restitue un projet exporté, images comprises', async ({ page }) => {
  await page.getByRole('button', { name: 'Carreaux & motifs' }).click();
  const image = await pngFile(page, 'motif.png', 80, 70, '#ff0000');
  await page.locator('table.designs input[type=file]').first().setInputFiles(image);
  await expect(page.locator('table.designs .hexsw').first()).toHaveCSS('background-image', /data:image\/jpeg/);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^calepineur-\d{4}-\d\d-\d\d\.json$/);
  const path = await file.path();

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Carreaux & motifs' }).click();
  await expect(page.locator('table.designs .hexsw').first()).not.toHaveCSS('background-image', /jpeg/);

  await page.locator('header input[type=file]').setInputFiles(path);
  await expect(page.getByRole('status')).toHaveText('Projet importé.');
  await page.getByRole('button', { name: 'Carreaux & motifs' }).click();
  await expect(page.locator('table.designs .hexsw').first()).toHaveCSS('background-image', /data:image\/jpeg/);

  await page.reload();
  await page.getByRole('button', { name: 'Carreaux & motifs' }).click();
  await expect(page.locator('table.designs .hexsw').first()).toHaveCSS('background-image', /data:image\/jpeg/);
});

test('ouvre un export de la première version et signale ses images', async ({ page }) => {
  const project = {
    version: 1, name: 'Ancien', rotMode: 'none', seed: 7,
    tile: { F: 14, joint: 0.2, orient: 'flat', grout: '#d8d3c8', edgeGap: 0.2, waste: 10, minPiece: 15, perBox: 0, m2PerBox: 0 },
    designs: [{ key: 'A', name: 'Ancien motif', img: 'motifs/a.jpg', color: '#a3906f', weight: 1 }],
    walls: [{ id: 'A', name: 'Ancien pan', W: 160, H: 100, color: '#efe6d2', ox: 8, oy: 7, zoneMode: 'organic', zone: [[-10, -10], [-10, 40], [170, 40], [170, -10]], obstacles: [], photo: null, tiles: {} }],
  };
  await page.locator('header input[type=file]').setInputFiles({
    name: 'ancien.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ state: project, images: {} })),
  });
  await expect(page.getByRole('status')).toContainText('1 image absente du fichier');
  await expect(page.getByRole('button', { name: 'Ancien pan' })).toBeVisible();
  expect(await tileCount(page)).toBeGreaterThan(10);
});

test.describe('vue Photo', () => {
  test.beforeEach(async ({ page }) => {
    const photo = await pngFile(page, 'mur.png', 1200, 800, '#f4efe2');
    await page.locator('aside input[type=file]').setInputFiles(photo);
    await expect(page.locator('.ph-tiles svg')).toBeAttached();
  });

  test('cale la photo sur 4 repères', async ({ page }) => {
    await expect(page.locator('[data-handle=calib]')).toHaveCount(4);
    await expect(page.locator('.ph-tiles')).toHaveCSS('transform', /^matrix/);
    const before = await page.locator('.ph-tiles').evaluate(e => getComputedStyle(e).transform);

    const handle = await page.locator('[data-handle=calib]').first().boundingBox();
    const x = handle!.x + handle!.width / 2;
    const y = handle!.y + handle!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y + 20, { steps: 4 });
    await page.mouse.up();

    await expect.poll(() => page.locator('.ph-tiles').evaluate(e => getComputedStyle(e).transform)).not.toBe(before);
  });

  test('retouche la zone directement sur la photo', async ({ page }) => {
    await page.getByRole('button', { name: 'Pinceau zone' }).click();
    const start = await tileCount(page);
    const img = (await page.locator('.ph-img').boundingBox())!;
    await page.mouse.move(img.x + img.width * .5, img.y + img.height * .62);
    await page.mouse.down();
    await page.mouse.move(img.x + img.width * .6, img.y + img.height * .62, { steps: 5 });
    await page.mouse.up();
    expect(await tileCount(page)).toBeLessThan(start);
  });

  test('retrouve la photo après rechargement', async ({ page }) => {
    await page.reload();
    await page.getByRole('button', { name: 'Photo', exact: true }).click();
    await expect(page.locator('.ph-img')).toBeVisible();
    await expect(page.locator('.ph-tiles')).toHaveCSS('transform', /^matrix/);
  });
});

test('sépare les murs du reste du menu et en ajoute un', async ({ page }) => {
  await expect(page.locator('nav').getByRole('button', { name: 'Mur fenêtre' })).toHaveCount(0);
  await page.getByRole('button', { name: '+ Ajouter un pan' }).click();
  await expect(page.getByRole('button', { name: 'Pan 3' })).toHaveClass('on');
  await page.getByRole('button', { name: 'Supprimer ce pan' }).click({ trial: true });
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Supprimer ce pan' }).click();
  await expect(page.getByRole('button', { name: 'Pan 3' })).toHaveCount(0);
});

test('prépare un projet avec une IA, de la consigne à la réponse collée', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Configurer avec mon IA' }).click();
  const dialog = page.getByRole('dialog', { name: 'Préparer avec une IA' });
  await expect(dialog.getByRole('link', { name: 'Claude' })).toHaveAttribute('href', /^https:\/\/claude\.ai\/new\?q=/);

  await dialog.getByRole('button', { name: 'Copier la consigne' }).click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain('"version": 1');

  const example = /\{\n {2}"version"[\s\S]*?\n\}/.exec(prompt)![0];
  await dialog.getByLabel('Réponse de ton IA').fill(`Voici :\n\n\`\`\`json\n${example}\n\`\`\`\n\nCotes estimées : la largeur.`);
  await dialog.getByRole('button', { name: 'Vérifier' }).click();
  await expect(dialog.getByText('Nouveau pan : Mur évier, 240 × 75 cm, 1 élément')).toBeVisible();
  await dialog.getByRole('button', { name: 'Appliquer' }).click();

  await expect(page.getByRole('button', { name: 'Mur évier' })).toHaveClass('on');
  expect(await tileCount(page)).toBeGreaterThan(20);
  await expect(page.getByRole('button', { name: 'Configurer avec mon IA' })).toHaveCount(0);
});

test('applique un lien de configuration après validation, une seule fois', async ({ page }) => {
  const config = { tile: { F: 15 }, walls: [{ name: 'Mur fenêtre', W: 200 }, { id: 'ilot', name: 'Îlot', W: 120, H: 40 }] };
  const start = await tileCount(page);

  // page déjà ouverte, puis lien cliqué
  await page.goto(`./#config=${encodeURIComponent(JSON.stringify(config))}`);
  const dialog = page.getByRole('dialog', { name: 'Appliquer ce lien de configuration ?' });
  await expect(dialog.getByText('Carreau de 15 cm (avant : 12)')).toBeVisible();
  await expect(dialog.getByText('Nouveau pan : Îlot, 120 × 40 cm, 0 élément')).toBeVisible();
  expect(await tileCount(page)).toBe(start);
  expect(page.url()).not.toContain('config');

  await dialog.getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.getByRole('button', { name: 'Îlot' })).toBeVisible();
  expect(await tileCount(page)).not.toBe(start);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Îlot' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('propose un lien reçu à l\'ouverture de l\'application', async ({ browser }) => {
  const page = await (await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })).newPage();
  await page.goto(`./#config=${encodeURIComponent('{"tile":{"F":20}}')}`);
  await expect(page.getByRole('dialog').getByText('Carreau de 20 cm (avant : 12)')).toBeVisible();
  await page.context().close();
});

test.describe('calage reçu par lien', () => {
  const calib = [
    { wx: 0, wy: 0, u: 0.1, v: 0.8 }, { wx: 240, wy: 0, u: 0.9, v: 0.8 },
    { wx: 240, wy: 75, u: 0.8, v: 0.2 }, { wx: 0, wy: 75, u: 0.2, v: 0.2 },
  ];
  const link = `./#config=${encodeURIComponent(JSON.stringify({ walls: [{ name: 'Mur fenêtre', calib }] }))}`;
  const handles = (page: Page) => page.locator('[data-handle=calib]').evaluateAll(cs => cs.map(c => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]));

  test('s\'applique quand on choisit la photo', async ({ page }) => {
    await page.goto(link);
    await expect(page.getByRole('dialog').getByText('Mur fenêtre : calage photo proposé')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Appliquer' }).click();
    await expect(page.getByText('Calage prêt : choisis la photo de ce mur, sans la recadrer.')).toBeVisible();

    const photo = await pngFile(page, 'mur.png', 1200, 800, '#f4efe2');
    await page.locator('aside input[type=file]').setInputFiles(photo);
    await expect(page.getByRole('status')).toContainText('Photo calée avec les repères de ton IA');
    await expect(page.locator('[data-handle=calib]')).toHaveCount(4);
    expect(await handles(page)).toEqual([[120, 640], [1080, 640], [960, 160], [240, 160]]);
    await expect(page.locator('.ph-tiles')).toHaveCSS('transform', /^matrix3d/);
  });

  test('s\'applique directement si la photo est déjà là', async ({ page }) => {
    const photo = await pngFile(page, 'mur.png', 1200, 800, '#f4efe2');
    await page.locator('aside input[type=file]').setInputFiles(photo);
    await expect(page.locator('[data-handle=calib]')).toHaveCount(4);

    await page.goto(link);
    await page.getByRole('dialog').getByRole('button', { name: 'Appliquer' }).click();
    await expect.poll(() => handles(page)).toEqual([[120, 640], [1080, 640], [960, 160], [240, 160]]);
    await expect(page.getByText(/Calage prêt/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect.poll(() => handles(page)).toEqual([[180, 600], [1020, 600], [1020, 320], [180, 320]]);
  });
});

test('découpe les motifs dans une seule photo', async ({ page }) => {
  const config = { designs: [{ key: 'A', crop: { u: 0, v: 0, w: 0.5, h: 1 } }, { key: 'B', crop: { u: 0.5, v: 0, w: 0.5, h: 1 } }] };
  await page.goto(`./#config=${encodeURIComponent(JSON.stringify(config))}`);
  await expect(page.getByRole('dialog').getByText('Découpe proposée pour 2 motifs')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Appliquer' }).click();
  await page.locator('nav').getByRole('button', { name: 'Carreaux & motifs' }).click();
  await expect(page.getByText(/Découpe prête pour 2 motifs/)).toBeVisible();

  // planche générée : moitié gauche rouge, moitié droite bleue
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 200;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ff0000';
    g.fillRect(0, 0, 200, 200);
    g.fillStyle = '#0000ff';
    g.fillRect(200, 0, 200, 200);
    return c.toDataURL('image/png');
  });
  await page.getByText('Choisir la photo des carreaux…').locator('input').setInputFiles({
    name: 'motifs.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64'),
  });
  await expect(page.getByRole('status')).toContainText('2 motifs découpés');
  await expect(page.getByText(/Découpe prête/)).toHaveCount(0);

  const centerColor = (row: number) => page.locator('table.designs .hexsw').nth(row).evaluate(async el => {
    const url = /url\("(.+)"\)/.exec(getComputedStyle(el).backgroundImage)![1]!;
    const im = new Image();
    im.src = url;
    await im.decode();
    const c = document.createElement('canvas');
    c.width = im.naturalWidth;
    c.height = im.naturalHeight;
    const g = c.getContext('2d')!;
    g.drawImage(im, 0, 0);
    const [r, , b] = g.getImageData(c.width / 2, c.height / 2, 1, 1).data;
    return r! > b! ? 'rouge' : 'bleu';
  });
  expect(await centerColor(0)).toBe('rouge');
  expect(await centerColor(1)).toBe('bleu');

  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByText(/Découpe prête pour 2 motifs/)).toBeVisible();
});

test('publie les instructions pour les IA', async ({ request }) => {
  const res = await request.get('llms.txt');
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).toContain('# Calepineur');
  expect(text).toContain('#config=');
  expect(text).toContain('"version": 1');
  expect(text).toContain('"calib"');
  expect(text).toContain('"crop"');
});

test('ouvre directement une vue par son adresse', async ({ page }) => {
  await page.goto('./#wall:1/plan/grid/labels');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mur cuisson' })).toHaveClass('on');
  await expect(page.getByRole('button', { name: 'Grille' })).toHaveClass('on');
  await expect(page.locator('.lbl').first()).toBeAttached();
});

test('prépare le document d\'impression', async ({ page }) => {
  await page.getByRole('button', { name: 'Calepinage' }).click();
  await expect(page.locator('#doc h1')).toContainText('calepinage');
  await expect(page.locator('figure.cut').first()).toBeVisible();

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('header')).toBeHidden();
  await expect(page.locator('.print-bar')).toBeHidden();
  await expect(page.locator('#doc')).toBeVisible();
  const pdf = await page.pdf({ format: 'A4', landscape: true, preferCSSPageSize: true });
  expect(pdf.length).toBeGreaterThan(10_000);
});

test('le site reste chargeable depuis un sous-dossier', () => {
  const html = readFileSync('dist/index.html', 'utf8');
  expect(html).toMatch(/src="\.\/assets\//);
  expect(html).not.toMatch(/(src|href)="\/[^/]/);
});
