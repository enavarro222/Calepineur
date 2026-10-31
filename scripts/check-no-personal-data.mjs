// Refuse toute image bitmap suivie par Git : photos et motifs réels restent hors du dépôt.
// L'app et les tests génèrent leurs visuels par le code.
import { execFileSync } from 'node:child_process';

const FORBIDDEN = /\.(jpe?g|png|gif|webp|avif|heic|bmp|tiff?)$/i;

const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const found = tracked.filter(file => FORBIDDEN.test(file));

if (found.length) {
  console.error('Images interdites dans le dépôt :\n' + found.map(f => `  ${f}`).join('\n'));
  process.exit(1);
}
console.log(`OK : aucune image bitmap parmi ${tracked.length} fichiers.`);
