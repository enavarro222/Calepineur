// Projet d'exemple fictif. Les motifs sont dessinés ici : aucune image externe.
import type { Design, Project } from './types';

const svgUri = (body: string): string =>
  'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 231 200">${body}</svg>`);

const lines = (count: number, draw: (t: number) => string): string =>
  Array.from({ length: count }, (_, i) => draw(i / (count - 1))).join('');

const MOTIFS: Omit<Design, 'weight'>[] = [
  {
    key: 'A', name: 'Losanges', color: '#c9b48a',
    img: svgUri(`<rect width="231" height="200" fill="#efe4cc"/><path d="M115 20 195 100 115 180 35 100Z" fill="none" stroke="#a8824a" stroke-width="10"/><path d="M115 60 155 100 115 140 75 100Z" fill="#a8824a"/>`),
  },
  {
    key: 'B', name: 'Vagues', color: '#5f8f9c',
    img: svgUri(`<rect width="231" height="200" fill="#d5e5e6"/>${lines(5, t => `<path d="M0 ${20 + t * 160}q29-30 58 0t58 0 58 0 58 0" fill="none" stroke="#3f7382" stroke-width="9"/>`)}`),
  },
  {
    key: 'C', name: 'Pétales', color: '#c07a5c',
    img: svgUri(`<rect width="231" height="200" fill="#f4e0d3"/>${lines(7, t => `<ellipse cx="115" cy="52" rx="20" ry="46" fill="#c07a5c" transform="rotate(${t * 308} 115 100)"/>`)}<circle cx="115" cy="100" r="15" fill="#7a3f2c"/>`),
  },
  {
    key: 'D', name: 'Rayures', color: '#d8d4ca',
    img: svgUri(`<rect width="231" height="200" fill="#f1eee6"/>${lines(7, t => `<rect x="${t * 214}" width="17" height="200" fill="#c9c3b5"/>`)}`),
  },
  {
    key: 'E', name: 'Nuit', color: '#39465a',
    img: svgUri(`<rect width="231" height="200" fill="#39465a"/>${lines(5, t => `<circle cx="115" cy="100" r="${16 + t * 80}" fill="none" stroke="#8c9db5" stroke-width="5"/>`)}`),
  },
];

export function demoProject(): Project {
  return {
    version: 1,
    name: "Cuisine d'exemple",
    tile: {
      F: 12, joint: 0.2, orient: 'flat', grout: '#d8d3c8', edgeGap: 0.2,
      waste: 10, minPiece: 15, perBox: 0, m2PerBox: 0,
    },
    rotMode: 'none',
    seed: 7,
    designs: MOTIFS.map(m => ({ ...m, weight: 1 })),
    walls: [
      {
        id: 'demo-1', name: 'Mur fenêtre', W: 240, H: 75, color: '#efe6d2', ox: 7.2, oy: 6.2, zoneMode: 'organic',
        zone: [[-10, -10], [-10, 58], [250, 58], [250, -10]],
        obstacles: [
          { name: 'Fenêtre', x: 90, y: 22, w: 80, h: 53 },
          { name: 'Prise', x: 200, y: 26, w: 16, h: 8 },
        ],
        photo: null, tiles: {},
      },
      {
        id: 'demo-2', name: 'Mur cuisson', W: 300, H: 95, color: '#efe6d2', ox: 7.2, oy: 6.2, zoneMode: 'organic',
        zone: [[-10, -10], [-10, 52], [100, 52], [100, 75], [200, 75], [200, 52], [310, 52], [310, -10]],
        obstacles: [{ name: 'Hotte', x: 110, y: 68, w: 80, h: 27 }],
        photo: null, tiles: {},
      },
    ],
  };
}
