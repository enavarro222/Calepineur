import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { buildGuide } from './src/core/aiPrompt';

// Publie les instructions pour les IA, générées depuis la même source que la consigne de l'app.
const llmsTxt = (): Plugin => ({
  name: 'calepineur-llms-txt',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'llms.txt', source: buildGuide() });
  },
});

export default defineConfig({
  // Chemins relatifs : le site fonctionne sous /Calepineur/ comme à la racine.
  base: './',
  plugins: [react(), llmsTxt()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
