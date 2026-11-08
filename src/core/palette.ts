// Couleurs principales des motifs et parenté entre motifs : deux carreaux se répondent s'ils partagent une couleur.
import type { Design } from './types';

export const MAX_COLORS = 3;
const RANK_SHARES = [0.55, 0.3, 0.15]; // part de surface prêtée à la dominante, à la secondaire, à la troisième
const MATCH_DE = 16; // écart de couleur (ΔE) au-delà duquel deux couleurs n'ont plus rien de commun
const CHROMA_WEIGHT = 2.5; // les carreaux sont souvent peu saturés : la teinte compte plus que la clarté
const CLUSTERS = 7;
const DISTINCT_DE = 14; // écart minimal entre deux couleurs gardées
const MIN_SHARE = 0.06;

type Lab = [number, number, number];

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (c: unknown): c is string => typeof c === 'string' && HEX.test(c);

function rgbToLab(r: number, g: number, b: number): Lab {
  const lin = (v: number) => {
    const s = v / 255;
    return s > 0.04045 ? ((s + 0.055) / 1.055) ** 2.4 : s / 12.92;
  };
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.9505);
  const y = f(0.2126 * lr + 0.7152 * lg + 0.0722 * lb);
  const z = f((0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.089);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function hexToLab(hex: string): Lab {
  const n = isHexColor(hex) ? parseInt(hex.slice(1), 16) : 0x999999;
  return rgbToLab(n >> 16, (n >> 8) & 255, n & 255);
}

const toHex = (rgb: number[]): string => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

export const deltaE = (a: Lab, b: Lab): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Couleurs d'un motif, la dominante d'abord. Sans couleurs saisies, la teinte moyenne en tient lieu.
export function designColors(d: Pick<Design, 'color' | 'colors'>): string[] {
  const list = (d.colors ?? []).filter(isHexColor).slice(0, MAX_COLORS);
  return list.length ? list : [d.color];
}

function shares(colors: string[]): { lab: Lab; w: number }[] {
  const ws = RANK_SHARES.slice(0, colors.length);
  const sum = ws.reduce((a, b) => a + b, 0);
  return colors.map((c, i) => ({ lab: hexToLab(c), w: ws[i]! / sum }));
}

// Part de la surface de a dont la couleur se retrouve dans b, à tol près (écart ΔE où il n'y a plus rien de commun).
function cover(a: { lab: Lab; w: number }[], b: { lab: Lab; w: number }[], tol = MATCH_DE): number {
  return a.reduce((s, x) => s + x.w * Math.max(...b.map(y => Math.max(0, 1 - deltaE(x.lab, y.lab) / tol))), 0);
}

// Part de la surface d'un motif qui a cette couleur, de 0 à 1. tol : écart ΔE où il n'y a plus rien de commun.
export function colorMatch(d: Pick<Design, 'color' | 'colors'>, color: string, tol = MATCH_DE): number {
  return cover(shares(designColors(d)), [{ lab: hexToLab(color), w: 1 }], tol);
}

// Parenté de couleur entre motifs, de 0 (rien en commun) à 1 (mêmes couleurs).
export function colorAffinity(designs: Pick<Design, 'color' | 'colors'>[]): number[][] {
  const s = designs.map(d => shares(designColors(d)));
  return s.map(a => s.map(b => (cover(a, b) + cover(b, a)) / 2));
}

// Ordre du dégradé : les motifs rangés selon leur couleur dominante, le long de l'axe où ces couleurs varient le
// plus (souvent la clarté), du plus sombre au plus clair. Deux motifs proches dans cet ordre se ressemblent.
export function colorChain(designs: Pick<Design, 'color' | 'colors'>[]): number[] {
  const pts = designs.map(d => {
    const [L, A, B] = hexToLab(designColors(d)[0]!);
    return [L, A * CHROMA_WEIGHT, B * CHROMA_WEIGHT];
  });
  const n = pts.length;
  if (!n) return [];
  const mean = [0, 1, 2].map(j => pts.reduce((s, p) => s + p[j]!, 0) / n);
  const cov = [0, 1, 2].map(i => [0, 1, 2].map(j => pts.reduce((s, p) => s + (p[i]! - mean[i]!) * (p[j]! - mean[j]!), 0)));
  // Axe principal par itérations successives, en partant de la clarté.
  let axis = [1, 0, 0];
  for (let k = 0; k < 50; k++) {
    const next = [0, 1, 2].map(i => cov[i]!.reduce((s, c, j) => s + c * axis[j]!, 0));
    const len = Math.hypot(...next);
    if (len < 1e-9) break;
    axis = next.map(v => v / len);
  }
  if (axis[0]! < 0) axis = axis.map(v => -v);
  const proj = pts.map(p => p.reduce((s, v, j) => s + (v - mean[j]!) * axis[j]!, 0));
  return [...Array(n).keys()].sort((x, y) => proj[x]! - proj[y]! || x - y);
}

// Couleurs principales d'une image, à partir de ses pixels RVBA (les pixels transparents sont ignorés).
export function extractPalette(rgba: ArrayLike<number>, max = MAX_COLORS): string[] {
  const px: { rgb: [number, number, number]; v: Lab }[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    const rgb: [number, number, number] = [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!];
    const lab = rgbToLab(...rgb);
    px.push({ rgb, v: [lab[0], lab[1] * CHROMA_WEIGHT, lab[2] * CHROMA_WEIGHT] });
  }
  if (!px.length) return [];
  // Départ déterministe, à la k-means++ : chaque centre est le pixel le plus éloigné des centres déjà pris.
  const k = Math.min(CLUSTERS, px.length);
  let centers: Lab[] = [[...px[0]!.v] as Lab];
  while (centers.length < k) {
    let far = px[0]!;
    let fd = -1;
    for (const p of px) {
      const dd = Math.min(...centers.map(c => deltaE(p.v, c)));
      if (dd > fd) { fd = dd; far = p; }
    }
    centers.push([...far.v] as Lab);
  }
  let label = new Array<number>(px.length).fill(0);
  for (let iter = 0; iter < 15; iter++) {
    label = px.map(p => {
      let bi = 0;
      let bd = Infinity;
      centers.forEach((c, ci) => {
        const dd = deltaE(p.v, c);
        if (dd < bd) { bd = dd; bi = ci; }
      });
      return bi;
    });
    centers = centers.map((c, ci) => {
      const mine = px.filter((_, i) => label[i] === ci);
      if (!mine.length) return c;
      return [0, 1, 2].map(j => mine.reduce((s, p) => s + p.v[j]!, 0) / mine.length) as Lab;
    });
  }
  const groups = centers.map((c, ci) => {
    const mine = px.filter((_, i) => label[i] === ci);
    const rgb = [0, 1, 2].map(j => mine.reduce((s, p) => s + p.rgb[j]!, 0) / Math.max(1, mine.length));
    return { v: c, n: mine.length, rgb, lab: rgbToLab(rgb[0]!, rgb[1]!, rgb[2]!) };
  }).sort((a, b) => b.n - a.n);
  // Les couleurs gardées doivent se distinguer nettement : un groupe proche d'une couleur déjà gardée lui ajoute sa
  // surface (tons de passage, ombres, morceaux d'une même couleur), et un uni n'en garde qu'une.
  const kept: typeof groups = [];
  for (const g of groups) {
    const same = kept.find(x => deltaE(x.lab, g.lab) < DISTINCT_DE);
    if (same) same.n += g.n;
    else kept.push({ ...g });
  }
  return kept.filter(g => g.n / px.length >= MIN_SHARE).sort((a, b) => b.n - a.n).slice(0, max).map(g => toHex(g.rgb));
}
