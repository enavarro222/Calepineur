import { expect, type Page } from '@playwright/test';

// Coordonnées écran d'un point du pan affiché (cm, y vers le haut).
export async function wallToScreen(page: Page, x: number, y: number, wallHeight: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([cx, cy, H]) => {
    const svg = document.querySelector<SVGSVGElement>('#stage svg.wall-svg')!;
    const p = new DOMPoint(cx, H! - cy!).matrixTransform(svg.getScreenCTM()!);
    return { x: p.x, y: p.y };
  }, [x, y, wallHeight]);
}

export async function tileCount(page: Page): Promise<number> {
  const text = await page.getByTestId('stats').textContent();
  return Number(/^\d+/.exec(text ?? '')?.[0]);
}

export async function dragOnWall(page: Page, from: [number, number], to: [number, number], H: number, button: 'left' | 'right' = 'left'): Promise<void> {
  const a = await wallToScreen(page, from[0], from[1], H);
  const b = await wallToScreen(page, to[0], to[1], H);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button });
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up({ button });
}

// Image générée à la volée : le dépôt ne contient aucune photo.
export async function pngFile(page: Page, name: string, w: number, h: number, color: string) {
  const dataUrl = await page.evaluate(([cw, ch, fill]) => {
    const c = document.createElement('canvas');
    c.width = Number(cw);
    c.height = Number(ch);
    const g = c.getContext('2d')!;
    g.fillStyle = String(fill);
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#888';
    g.fillRect(0, c.height * .75, c.width, c.height * .25);
    return c.toDataURL('image/png');
  }, [w, h, color]);
  return { name, mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1]!, 'base64') };
}

export function failOnConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

export async function expectNoErrors(errors: string[]): Promise<void> {
  expect(errors).toEqual([]);
}
