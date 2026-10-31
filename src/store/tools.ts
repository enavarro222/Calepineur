// Outils de la scène. Ils travaillent en coordonnées du pan : la vue (plan ou photo) ne fait que convertir le pointeur.
import { round1, snap } from '../core/geom';
import type { PlacedTile } from '../core/compute';
import { cm } from '../core/format';
import { applyH } from '../core/geom';
import { photoH } from '../core/photo';
import type { BrushState, Point, Wall } from '../core/types';
import { commit, endGesture, getComps, getProject, getUi, mutate, pushUndo, setUi, showToast } from './store';

export interface StagePoint {
  w: Point | null; // position sur le pan, en cm (null si la photo n'est pas calée)
  tol: number; // tolérance de prise en cm
  nat?: Point; // position dans la photo, en pixels de l'image
  s?: number; // échelle d'affichage de la photo
}

export interface PressInfo {
  button: number;
  altKey: boolean;
}

type Drag =
  | { type: 'calib'; k: number }
  | { type: 'brush'; mode: BrushState }
  | { type: 'paint' }
  | { type: 'zone'; k: number }
  | { type: 'obst-move'; k: number; start: Point; orig: Point }
  | { type: 'obst-corner'; k: number; fixed: Point }
  | { type: 'grid'; start: Point; orig: Point };

let drag: Drag | null = null;

const wallAt = (i: number): Wall => getProject().walls[i]!;

function tileAtPoint(i: number, x: number, y: number) {
  const c = getComps()[i]!;
  const n = c.g.nearest(x, y, c.ox, c.oy);
  const key = `${n.q},${n.r}`;
  return { key, c: n.c, t: c.byKey.get(key) };
}

const inWall = (w: Wall, x: number, y: number): boolean => !(x < -2 || y < -2 || x > w.W + 2 || y > w.H + 2);

function paintTile(i: number, x: number, y: number): void {
  const w = wallAt(i);
  const design = getUi().design;
  if (!inWall(w, x, y) || !design) return;
  const h = tileAtPoint(i, x, y);
  if (!h.t) return;
  const a = w.tiles[h.key];
  if (a && a.d === design && a.lk) return;
  mutate(p => {
    const t = p.walls[i]!.tiles[h.key] ?? (p.walls[i]!.tiles[h.key] = {});
    t.d = design;
    t.lk = true;
  });
}

function rotateTile(i: number, x: number, y: number): void {
  if (!inWall(wallAt(i), x, y)) return;
  const h = tileAtPoint(i, x, y);
  if (!h.t) return;
  commit(p => {
    const t = p.walls[i]!.tiles[h.key]!;
    t.rot = ((t.rot ?? 0) + 1) % 6;
    t.lk = true;
  });
}

// Échanger : deux clics intervertissent motif et rotation. Les quantités ne changent pas.
function swapTile(i: number, x: number, y: number): void {
  const w = wallAt(i);
  if (!inWall(w, x, y)) return;
  const h = tileAtPoint(i, x, y);
  if (!h.t) return;
  const here = { wallId: w.id, key: h.key };
  const from = getUi().swapFrom;
  if (from?.wallId === here.wallId && from.key === here.key) {
    setUi({ swapFrom: null });
    return;
  }
  const fromWall = from ? getProject().walls.findIndex(x2 => x2.id === from.wallId) : -1;
  const a = from && fromWall >= 0 ? getProject().walls[fromWall]!.tiles[from.key] : undefined;
  if (!from || !a || !getComps()[fromWall]!.byKey.has(from.key)) {
    setUi({ swapFrom: here });
    return;
  }
  setUi({ swapFrom: null });
  if (a.d === w.tiles[h.key]?.d) {
    showToast('Ces deux carreaux ont le même motif.');
    return;
  }
  commit(p => {
    const first = p.walls[fromWall]!.tiles[from.key]!;
    const second = p.walls[i]!.tiles[h.key]!;
    [first.d, second.d] = [second.d, first.d];
    [first.rot, second.rot] = [second.rot, first.rot];
    first.lk = true;
    second.lk = true;
  });
}

// Pinceau zone : mode 'add' ou 'del', fixé au début du tracé. Un réglage contraire est d'abord simplement annulé.
function brushTile(i: number, x: number, y: number, mode: BrushState): void {
  const w = wallAt(i);
  if (!inWall(w, x, y)) return;
  const h = tileAtPoint(i, x, y);
  if (mode === 'add' ? h.t : !h.t) return;
  const a = w.tiles[h.key];
  if (a?.st === mode) return;
  if (a?.st) {
    mutate(p => { delete p.walls[i]!.tiles[h.key]!.st; });
    if (getComps()[i]!.byKey.has(h.key) === (mode === 'add')) return;
  }
  mutate(p => {
    const t = p.walls[i]!.tiles[h.key] ?? (p.walls[i]!.tiles[h.key] = {});
    t.st = mode;
  });
}

function begin(d: Drag): true {
  pushUndo();
  drag = d;
  return true;
}

// Début de geste. Renvoie true si le pointeur doit être capturé pour la suite du tracé.
export function press(i: number, pt: StagePoint, info: PressInfo): boolean {
  const w = wallAt(i);
  const tool = getUi().tool;

  if (tool === 'calib') {
    if (!pt.nat || !pt.s || !w.photo) return false;
    const [nx, ny] = pt.nat;
    let best = -1;
    let bd = Infinity;
    w.photo.pts.forEach((p, k) => {
      const d = Math.hypot(p.px - nx, p.py - ny);
      if (d < bd) { bd = d; best = k; }
    });
    return bd < 16 / pt.s ? begin({ type: 'calib', k: best }) : false;
  }
  if (!pt.w) return false;
  const [x, y] = pt.w;

  if (tool === 'swap') {
    if (info.button !== 2) swapTile(i, x, y);
    return false;
  }
  if (tool === 'toggle') {
    const mode: BrushState = info.button === 2 || tileAtPoint(i, x, y).t ? 'del' : 'add';
    begin({ type: 'brush', mode });
    brushTile(i, x, y, mode);
    return true;
  }
  if (tool === 'paint') {
    if (info.button === 2) return false;
    begin({ type: 'paint' });
    paintTile(i, x, y);
    return true;
  }
  if (tool === 'rotate') {
    if (info.button !== 2) rotateTile(i, x, y);
    return false;
  }
  if (tool === 'zone') return pressZone(i, w, x, y, pt.tol, info);
  if (tool === 'obst') return pressObstacle(w, x, y, pt.tol);
  return begin({ type: 'grid', start: [x, y], orig: [w.ox, w.oy] });
}

function pressZone(i: number, w: Wall, x: number, y: number, tol: number, info: PressInfo): boolean {
  const z = w.zone;
  const hit = z.findIndex(p => Math.hypot(p[0] - x, p[1] - y) < tol);
  if (hit >= 0) {
    if (info.button === 2 || info.altKey) {
      if (z.length > 3) commit(p => { p.walls[i]!.zone.splice(hit, 1); });
      return false;
    }
    return begin({ type: 'zone', k: hit });
  }
  if (info.button === 2) return false;
  const edge = z.findIndex((p, j) => {
    const n = z[(j + 1) % z.length]!;
    return Math.hypot((p[0] + n[0]) / 2 - x, (p[1] + n[1]) / 2 - y) < tol;
  });
  if (edge < 0) return false;
  begin({ type: 'zone', k: edge + 1 });
  mutate(p => { p.walls[i]!.zone.splice(edge + 1, 0, [snap(x), snap(y)]); });
  return true;
}

function pressObstacle(w: Wall, x: number, y: number, tol: number): boolean {
  for (let k = w.obstacles.length - 1; k >= 0; k--) {
    const o = w.obstacles[k]!;
    const corners: Point[] = [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]];
    const ci = corners.findIndex(c => Math.hypot(c[0] - x, c[1] - y) < tol);
    if (ci >= 0) return begin({ type: 'obst-corner', k, fixed: corners[(ci + 2) % 4]! });
  }
  for (let k = w.obstacles.length - 1; k >= 0; k--) {
    const o = w.obstacles[k]!;
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) {
      return begin({ type: 'obst-move', k, start: [x, y], orig: [o.x, o.y] });
    }
  }
  return false;
}

export function moveDrag(i: number, pt: StagePoint): void {
  const d = drag;
  if (!d) return;
  if (d.type === 'calib') {
    const nat = pt.nat;
    if (nat) mutate(p => {
      const c = p.walls[i]!.photo!.pts[d.k]!;
      c.px = round1(nat[0]);
      c.py = round1(nat[1]);
    });
    return;
  }
  if (!pt.w) return;
  const [x, y] = pt.w;
  if (d.type === 'paint') paintTile(i, x, y);
  else if (d.type === 'brush') brushTile(i, x, y, d.mode);
  else mutate(p => {
    const w = p.walls[i]!;
    if (d.type === 'zone') {
      w.zone[d.k] = [snap(Math.max(-30, Math.min(w.W + 30, x))), snap(Math.max(-30, Math.min(w.H + 30, y)))];
    } else if (d.type === 'obst-move') {
      const o = w.obstacles[d.k]!;
      o.x = snap(d.orig[0] + x - d.start[0]);
      o.y = snap(d.orig[1] + y - d.start[1]);
    } else if (d.type === 'obst-corner') {
      const o = w.obstacles[d.k]!;
      const sx = snap(x);
      const sy = snap(y);
      o.x = Math.min(sx, d.fixed[0]);
      o.y = Math.min(sy, d.fixed[1]);
      o.w = Math.abs(sx - d.fixed[0]);
      o.h = Math.abs(sy - d.fixed[1]);
    } else {
      w.ox = round1(d.orig[0] + x - d.start[0]);
      w.oy = round1(d.orig[1] + y - d.start[1]);
    }
  });
}

export function release(): void {
  drag = null;
  endGesture();
}

export const isDragging = (): boolean => drag !== null;

export interface HoverInfo {
  points: Point[] | null; // contour du carreau survolé, dans le repère de la vue
  label?: string;
  text: string;
}

function tileText(wall: Wall, t: PlacedTile): string {
  const a = wall.tiles[t.key];
  const d = getProject().designs.find(x => x.key === a?.d);
  const cut = t.full ? 'entier' : `coupé, ${Math.round(t.frac * 100)} % gardé`;
  return ` · ${a?.d ?? '?'} ${d?.name ?? ''}${a?.rot ? ` · ↻${a.rot * 60}°` : ''} · ${cut}${t.holes ? ' + trou' : ''}`;
}

export function hoverInfo(i: number, pt: StagePoint, photoView: boolean): HoverInfo | null {
  const ui = getUi();
  if (!pt.w || ui.tool === 'calib') return null;
  const [x, y] = pt.w;
  const w = wallAt(i);
  const h = tileAtPoint(i, x, y);
  const pos = `x ${cm(x)} · y ${cm(y)} cm`;
  const onWall = x > -5 && y > -5 && x < w.W + 5 && y < w.H + 5;
  if (!onWall || !(h.t || ui.tool === 'toggle')) return { points: null, text: pos };
  const v = getComps()[i]!.g.verts(h.c[0], h.c[1]);
  const H = photoView ? photoH(w) : null;
  const points = H ? v.map(p => applyH(H, p)) : v.map((p): Point => [p[0], w.H - p[1]]);
  if (h.t) return { points, label: h.t.label, text: `${tileText(w, h.t)} · ${pos}` };
  return { points, text: `emplacement vide · ${pos}` };
}
