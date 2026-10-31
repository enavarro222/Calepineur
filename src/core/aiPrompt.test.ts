import { describe, expect, it } from 'vitest';
import { aiTargets, APP_URL, buildGuide, buildPrompt } from './aiPrompt';
import { resolveConfig } from './aiReply';
import { demoProject } from './demo';
import { project, wall } from '../test/fixtures';

describe('buildPrompt', () => {
  it('demande d\'abord les photos, sans dépendre de l\'envoi immédiat du lien', () => {
    const p = buildPrompt(null);
    expect(p).toMatch(/Commence par me demander/);
    expect(p).toMatch(/N'écris pas le projet avant/);
  });

  it('donne un exemple de format accepté par l\'application', () => {
    const json = /\{\n {2}"version"[\s\S]*?\n\}/.exec(buildPrompt(null))![0];
    expect(resolveConfig(project(), json).walls[0]!.name).toBe('Mur évier');
  });

  it('n\'envoie ni image ni réglage carreau par carreau', () => {
    const p = demoProject();
    p.walls[0]!.tiles = { '1,1': { d: 'A' } };
    p.walls[0]!.photo = { src: 'img:secret', opacity: 1, blend: true, pts: [] };
    const text = buildPrompt(p);
    expect(text).toContain('Mur fenêtre');
    expect(text).not.toContain('data:image');
    expect(text).not.toContain('img:secret');
    expect(text).not.toContain('"1,1"');
  });
});

describe('liens', () => {
  it('donne un exemple de lien qui fonctionne', () => {
    const url = /https:\S+#config=%7B\S+/.exec(buildPrompt(null))![0];
    expect(url.startsWith(APP_URL)).toBe(true);
    const encoded = url.slice(url.indexOf('=') + 1);
    expect(resolveConfig(project(), decodeURIComponent(encoded)).tile.F).toBe(15);
  });

  it('donne un exemple de correction partielle valide', () => {
    const json = /\{ "tile": \{ "F": 15 \}.*\}/.exec(buildPrompt(null))![0];
    const base = project({ walls: [wall({ id: 'mur-1' })] });
    expect(resolveConfig(base, json).walls[0]!.W).toBe(250);
  });

  it('explique tout dans le fichier pour les IA', () => {
    const guide = buildGuide();
    expect(guide).toContain('#config=');
    expect(guide).toContain('"version": 1');
    expect(guide).toContain('Modification partielle');
  });
});

describe('aiTargets', () => {
  it('préremplit Claude et ChatGPT', () => {
    const [claude, chatgpt] = aiTargets('Bonjour é&?');
    expect(claude?.url).toBe('https://claude.ai/new?q=Bonjour%20%C3%A9%26%3F');
    expect(chatgpt?.url).toBe('https://chatgpt.com/?q=Bonjour%20%C3%A9%26%3F');
  });

  it('garde la consigne de base assez courte pour un lien', () => {
    expect(aiTargets(buildPrompt(null)).filter(t => t.prefilled)).toHaveLength(3);
  });

  it('renonce au préremplissage si le projet rend le lien trop long', () => {
    const walls = Array.from({ length: 60 }, (_, i) => wall({ id: `w${i}`, name: 'Un mur au nom assez long' }));
    for (const t of aiTargets(buildPrompt(project({ walls })))) {
      expect(t.prefilled).toBe(false);
      expect(t.url.length).toBeLessThan(100);
    }
  });
});
