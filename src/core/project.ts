// Lecture et écriture du fichier projet. Le contenu importé est validé champ par champ.
import { isHexColor, MAX_COLORS } from './palette';
import type { BrushState, CalibHint, CalibPoint, Design, Overview, DesignCrop, Obstacle, Point, Project, TileOverride, TileSpec, Wall, WallPhoto } from './types';

export type ImageStore = Record<string, string>;

export interface ProjectFile {
  state: Project;
  images: ImageStore;
}

export interface ParsedProjectFile extends ProjectFile {
  missingImages: string[];
}

class ProjectError extends Error {}

const fail = (msg: string): never => { throw new ProjectError(msg); };

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

function obj(v: unknown, what: string): Raw {
  return isObject(v) ? v : fail(`${what} : objet attendu`);
}

function arr(v: unknown, what: string): unknown[] {
  return Array.isArray(v) ? v : fail(`${what} : liste attendue`);
}

function num(v: unknown, what: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fail(`${what} : nombre attendu`);
}

const optNum = (v: unknown, what: string, dflt: number): number => (v == null ? dflt : num(v, what));
const str = (v: unknown, dflt = ''): string => (v == null ? dflt : String(v));

function point(v: unknown, what: string): Point {
  const p = arr(v, what);
  return [num(p[0], what), num(p[1], what)];
}

function parseTile(v: unknown): TileSpec {
  const t = obj(v, 'tile');
  const F = num(t.F, 'tile.F');
  if (F <= 0) fail('tile.F : doit être positif');
  return {
    F,
    joint: optNum(t.joint, 'tile.joint', 0),
    orient: t.orient === 'pointy' ? 'pointy' : 'flat',
    grout: str(t.grout, '#d8d3c8'),
    edgeGap: optNum(t.edgeGap, 'tile.edgeGap', 0),
    waste: optNum(t.waste, 'tile.waste', 0),
    minPiece: optNum(t.minPiece, 'tile.minPiece', 0),
    perBox: optNum(t.perBox, 'tile.perBox', 0),
    m2PerBox: optNum(t.m2PerBox, 'tile.m2PerBox', 0),
  };
}

function parseCrop(v: unknown, what: string): DesignCrop {
  const c = obj(v, what);
  const crop = { u: num(c.u, `${what}.u`), v: num(c.v, `${what}.v`), w: num(c.w, `${what}.w`), h: num(c.h, `${what}.h`) };
  const inside = crop.u >= 0 && crop.v >= 0 && crop.w > 0 && crop.h > 0 && crop.u + crop.w <= 1 && crop.v + crop.h <= 1;
  return inside ? crop : fail(`${what} : le rectangle doit tenir dans l'image, en proportions de 0 à 1`);
}

function parseDesign(v: unknown, i: number): Design {
  const d = obj(v, `designs[${i}]`);
  return {
    key: str(d.key) || fail(`designs[${i}].key : clé manquante`),
    name: str(d.name),
    img: str(d.img),
    color: str(d.color, '#999999'),
    weight: optNum(d.weight, `designs[${i}].weight`, 1),
    ...(Array.isArray(d.colors) && d.colors.some(isHexColor) ? { colors: d.colors.filter(isHexColor).slice(0, MAX_COLORS) } : {}),
    ...(d.crop != null ? { crop: parseCrop(d.crop, `designs[${i}].crop`) } : {}),
  };
}

function parseObstacle(v: unknown, what: string): Obstacle {
  const o = obj(v, what);
  return { name: str(o.name), x: num(o.x, `${what}.x`), y: num(o.y, `${what}.y`), w: num(o.w, `${what}.w`), h: num(o.h, `${what}.h`) };
}

function parsePoints(v: unknown, what: string): CalibPoint[] {
  const pts = arr(v, what);
  if (pts.length !== 4) fail(`${what} : 4 repères attendus`);
  return pts.map((c, i) => {
    const q = obj(c, `${what}[${i}]`);
    return { wx: num(q.wx, 'wx'), wy: num(q.wy, 'wy'), px: num(q.px, 'px'), py: num(q.py, 'py') };
  });
}

function parsePhoto(v: unknown, what: string): WallPhoto | null {
  if (v == null) return null;
  const p = obj(v, what);
  return {
    src: str(p.src),
    opacity: optNum(p.opacity, `${what}.opacity`, 1),
    blend: p.blend !== false,
    pts: parsePoints(p.pts, `${what}.pts`),
  };
}

function parseOverview(v: unknown): Overview {
  const o = obj(v, 'overview');
  const walls: Record<string, CalibPoint[]> = {};
  for (const [id, pts] of Object.entries(obj(o.walls ?? {}, 'overview.walls'))) walls[id] = parsePoints(pts, `overview.walls.${id}`);
  return { src: str(o.src), opacity: optNum(o.opacity, 'overview.opacity', 1), blend: o.blend !== false, walls };
}

function parseCalib(v: unknown, what: string): CalibHint[] {
  const pts = arr(v, what);
  if (pts.length !== 4) fail(`${what} : 4 repères attendus`);
  return pts.map((c, i) => {
    const q = obj(c, `${what}[${i}]`);
    const u = num(q.u, 'u');
    const w = num(q.v, 'v');
    if (u < 0 || u > 1 || w < 0 || w > 1) fail(`${what}[${i}] : u et v vont de 0 à 1`);
    return { wx: num(q.wx, 'wx'), wy: num(q.wy, 'wy'), u, v: w };
  });
}

function parseTiles(v: unknown, what: string): Record<string, TileOverride> {
  const out: Record<string, TileOverride> = {};
  for (const [k, raw] of Object.entries(obj(v ?? {}, what))) {
    if (!/^-?\d+,-?\d+$/.test(k)) fail(`${what} : emplacement « ${k} » invalide`);
    const a = obj(raw, `${what}[${k}]`);
    const t: TileOverride = {};
    if (typeof a.d === 'string') t.d = a.d;
    if (a.rot != null) t.rot = num(a.rot, 'rot');
    if (a.lk) t.lk = true;
    if (a.st === 'add' || a.st === 'del') t.st = a.st as BrushState;
    out[k] = t;
  }
  return out;
}

function parseWall(v: unknown, i: number): Wall {
  const what = `walls[${i}]`;
  const w = obj(v, what);
  return {
    id: str(w.id) || fail(`${what}.id : identifiant manquant`),
    name: str(w.name),
    W: num(w.W, `${what}.W`),
    H: num(w.H, `${what}.H`),
    color: str(w.color, '#efe6d2'),
    ox: num(w.ox, `${what}.ox`),
    oy: num(w.oy, `${what}.oy`),
    zoneMode: w.zoneMode === 'cut' ? 'cut' : 'organic',
    zone: arr(w.zone, `${what}.zone`).map(p => point(p, `${what}.zone`)),
    obstacles: arr(w.obstacles ?? [], `${what}.obstacles`).map((o, k) => parseObstacle(o, `${what}.obstacles[${k}]`)),
    photo: parsePhoto(w.photo, `${what}.photo`),
    ...(w.calib != null ? { calib: parseCalib(w.calib, `${what}.calib`) } : {}),
    ...(typeof w.joinPrev === 'boolean' ? { joinPrev: w.joinPrev } : {}),
    ...(typeof w.joinDy === 'number' && Number.isFinite(w.joinDy) && w.joinDy !== 0 ? { joinDy: w.joinDy } : {}),
    tiles: parseTiles(w.tiles, `${what}.tiles`),
  };
}

export function parseProject(v: unknown): Project {
  const s = obj(v, 'projet');
  if (s.version !== 1) fail('version de projet inconnue');
  const rot = s.rotMode;
  return {
    version: 1,
    name: str(s.name),
    tile: parseTile(s.tile),
    rotMode: rot === '180' || rot === '60' ? rot : 'none',
    seed: optNum(s.seed, 'seed', 1),
    ...(s.style === 'natural' || s.style === 'waves' || s.style === 'gradient' ? { style: s.style } : {}),
    ...(typeof s.styleVariant === 'number' && Number.isInteger(s.styleVariant) ? { styleVariant: s.styleVariant } : {}),
    designs: arr(s.designs, 'designs').map(parseDesign),
    walls: arr(s.walls, 'walls').map(parseWall),
    ...(s.overview != null ? { overview: parseOverview(s.overview) } : {}),
  };
}

export function imageRefs(p: Project): string[] {
  const refs = [...p.designs.map(d => d.img), ...p.walls.map(w => w.photo?.src ?? ''), p.overview?.src ?? ''];
  return refs.filter(r => r !== '' && !r.startsWith('data:'));
}

export function parseProjectFile(text: string): ParsedProjectFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectError('ce fichier n\'est pas du JSON');
  }
  const file = obj(data, 'fichier');
  const state = parseProject(file.state);
  const images: ImageStore = {};
  for (const [k, v] of Object.entries(obj(file.images ?? {}, 'images'))) {
    if (k.startsWith('img:') && typeof v === 'string' && v.startsWith('data:image/')) images[k] = v;
  }
  return { state, images, missingImages: imageRefs(state).filter(r => !images[r]) };
}

export function serializeProject(project: Project, images: ImageStore): string {
  const kept: ImageStore = {};
  for (const r of imageRefs(project)) {
    const v = images[r];
    if (v) kept[r] = v;
  }
  return JSON.stringify({ state: project, images: kept } satisfies ProjectFile, null, 1);
}

// Référence d'image vers une URL affichable. Tout le reste (chemins, URL distantes) est ignoré.
export function imageUrl(ref: string | null | undefined, images: ImageStore): string {
  if (!ref) return '';
  if (ref.startsWith('img:')) return images[ref] ?? '';
  return ref.startsWith('data:image/') ? ref : '';
}
