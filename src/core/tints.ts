// Style « Mes teintes » : des repères de couleur posés sur les pans. Chaque carreau mêle les repères selon leur
// proximité, et un motif y est d'autant mieux placé que ses couleurs ressemblent à ce mélange. Les pans sont mis bout
// à bout, comme pour le dégradé : un repère agit aussi sur les pans voisins.
import type { WallComp } from './compute';
import { colorMatch, isHexColor } from './palette';
import type { Project, Wall } from './types';

const SOFT_POWER = 2; // transitions douces : les repères lointains comptent encore
const SHARP_POWER = 14; // zones franches : le repère le plus proche l'emporte presque seul
const MIN_DIST = 1; // cm, pour un carreau posé sur un repère
const TINT_TOLERANCE = 30; // ΔE : un repère attire toute la famille de sa couleur, pas seulement sa nuance exacte

export interface TintPlace {
  gx: number; // abscisse le long des pans mis bout à bout
  y: number;
}

// Abscisse de départ de chaque pan, les pans mis bout à bout.
export function wallStarts(walls: Pick<Wall, 'W'>[]): number[] {
  let x = 0;
  return walls.map(w => {
    const start = x;
    x += w.W;
    return start;
  });
}

interface Spot extends TintPlace {
  color: string;
}

// Repères posés sur un pan qui existe encore.
function spotsOf(project: Project): Spot[] {
  const starts = wallStarts(project.walls);
  return (project.tints?.spots ?? []).flatMap(s => {
    const i = project.walls.findIndex(w => w.id === s.wall);
    return i >= 0 && isHexColor(s.color) ? [{ gx: starts[i]! + s.x, y: s.y, color: s.color }] : [];
  });
}

export const hasTints = (project: Project): boolean => spotsOf(project).length > 0;

function weights(spots: Spot[], power: number, at: TintPlace): number[] {
  const raw = spots.map(s => Math.max(MIN_DIST, Math.hypot(s.gx - at.gx, s.y - at.y)) ** -power);
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map(w => w / total);
}

const powerOf = (project: Project): number => SOFT_POWER + (SHARP_POWER - SOFT_POWER) * (project.tints?.sharpness ?? 0.3);

// Pour chaque endroit et chaque motif, de 0 à 1 : la part de ses couleurs que les repères demandent ici. null sans
// repère.
export function tintFit(project: Project, places: TintPlace[]): number[][] | null {
  const spots = spotsOf(project);
  if (!spots.length) return null;
  const match = project.designs.map(d => spots.map(s => colorMatch(d, s.color, TINT_TOLERANCE)));
  const power = powerOf(project);
  return places.map(at => {
    const w = weights(spots, power, at);
    return match.map(m => m.reduce((s, x, k) => s + x * w[k]!, 0));
  });
}

const rgb = (hex: string): number[] => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16));

// Teinte visée à un endroit, pour l'aperçu : le mélange des couleurs des repères.
export function tintColor(project: Project, at: TintPlace): string | null {
  const spots = spotsOf(project);
  if (!spots.length) return null;
  const w = weights(spots, powerOf(project), at);
  const mix = [0, 1, 2].map(c => spots.reduce((s, x, k) => s + rgb(x.color)[c]! * w[k]!, 0));
  return '#' + mix.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

export interface TintBalance {
  color: string;
  wanted: number; // part des carreaux que les repères de cette couleur demandent
  available: number; // part des carreaux posés dont le motif se rapproche le plus de cette couleur
}

const MATCH_MIN = 0.2; // en dessous, un motif ne répond à aucun repère

// Pour chaque couleur de repère : la part des carreaux qu'elle demande, et celle des carreaux dont le motif lui répond
// le mieux. Harmoniser ne change pas les quantités : une couleur trop demandée déborde forcément sur d'autres teintes.
export function tintBalance(project: Project, comps: WallComp[]): TintBalance[] {
  const spots = spotsOf(project);
  if (!spots.length) return [];
  const colors = [...new Set(spots.map(s => s.color))];
  const index = new Map(project.designs.map((d, i) => [d.key, i]));
  // chaque motif compte pour la couleur de repère qui lui ressemble le plus
  const owner = project.designs.map(d => {
    const m = colors.map(c => colorMatch(d, c, TINT_TOLERANCE));
    const best = m.indexOf(Math.max(...m));
    return m[best]! >= MATCH_MIN ? best : -1;
  });
  const starts = wallStarts(project.walls);
  const power = powerOf(project);
  const wanted = colors.map(() => 0);
  const available = colors.map(() => 0);
  let n = 0;
  comps.forEach((comp, i) => comp.tiles.forEach(t => {
    n++;
    const w = weights(spots, power, { gx: starts[i]! + t.c[0], y: t.c[1] });
    spots.forEach((s, k) => { wanted[colors.indexOf(s.color)]! += w[k]!; });
    const d = index.get(project.walls[i]!.tiles[t.key]?.d ?? '');
    if (d !== undefined && owner[d]! >= 0) available[owner[d]!]!++;
  }));
  return colors.map((color, c) => ({ color, wanted: n ? wanted[c]! / n : 0, available: n ? available[c]! / n : 0 }));
}
