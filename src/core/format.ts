// Mise en forme des nombres pour le SVG et pour l'affichage.
export const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();

export const cm = (n: number, dec = 1): string => (Math.round(n * 10 ** dec) / 10 ** dec).toLocaleString('fr-FR');
