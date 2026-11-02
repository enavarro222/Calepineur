// Actions de l'interface qui ne se limitent pas à changer une valeur.
import { produce } from 'immer';
import { demoProject } from '../core/demo';
import { computeWalls } from '../core/compute';
import { pruneTiles, shuffleDesigns } from '../core/designs';
import { cm } from '../core/format';
import { applyAssignment, applyStyle, harmonyProposals, type Assignment } from '../core/harmony';
import { colLetters, round1 } from '../core/geom';
import { latticeFor } from '../core/lattice';
import { optimizeGrid } from '../core/optimize';
import { calibPoints, defaultCalib } from '../core/photo';
import { imageUrl, parseProjectFile, serializeProject } from '../core/project';
import type { HarmonyStyle, Project, Wall } from '../core/types';
import { averageColor, cropImage, dominantColors, imageSize, readImageFile } from '../lib/images';
import { removeUnusedImages, writeImage } from './persistence';
import { commit, getComps, getProject, mutate, replaceProject, setUi, showToast, useStore } from './store';

// Nouvelle répartition. Si un style d'harmonie a été choisi, elle en tire une nouvelle variante, dans le même sens.
export function shuffle(keepLocked: boolean): void {
  const comps = getComps();
  const mixed = produce(getProject(), p => {
    p.seed = (p.seed || 0) + 1;
    shuffleDesigns(p, comps, keepLocked);
    pruneTiles(p, comps);
  });
  const style = mixed.style;
  const next = style ? harmonyProposals(mixed, comps, style, 1, mixed.styleVariant ?? 0)[0]?.project ?? mixed : mixed;
  commit(p => {
    p.seed = next.seed;
    p.walls = next.walls;
  });
  if (style) showToast(`Nouvelle répartition, style « ${STYLE_NAMES[style]} » conservé.`);
}

const STYLE_NAMES: Record<HarmonyStyle, string> = { natural: 'Naturel', waves: 'Vagues de couleur', gradient: 'Dégradé' };

export function chooseProposal(assignment: Assignment, style: HarmonyStyle, variant = 0): void {
  commit(p => {
    applyAssignment(p, assignment);
    applyStyle(p, style, variant);
  });
  setUi({ harmonyOpen: false });
  showToast('Répartition appliquée. Les quantités à commander ne changent pas.');
}

export function optimize(i: number, both: boolean): void {
  showToast('Optimisation en cours…', 10000);
  setTimeout(() => {
    const r = optimizeGrid(getProject(), getProject().walls[i]!, both);
    if (!r) {
      showToast('La grille actuelle est déjà la meilleure trouvée.');
      return;
    }
    commit(p => {
      p.walls[i]!.ox = round1(r.ox);
      p.walls[i]!.oy = round1(r.oy);
    });
    const after = getComps()[i]!.stats;
    showToast(`Grille déplacée : perte ${cm(r.before.waste)} → ${cm(after.waste)} carreaux, petites coupes ${r.before.small} → ${after.small}.`, 6000);
  }, 30);
}

export function linkToPrevious(i: number): void {
  commit(p => {
    const prev = p.walls[i - 1]!;
    p.walls[i]!.ox = round1(prev.ox - prev.W);
    p.walls[i]!.oy = prev.oy;
    p.walls[i]!.joinPrev = true;
  });
  showToast('Grille raccordée : les rangs continuent à travers l\'angle (épaisseur du carreau négligée).');
}

export function clearBrush(i: number): void {
  commit(p => {
    for (const a of Object.values(p.walls[i]!.tiles)) delete a.st;
    pruneTiles(p, computeWalls(p));
  });
}

function newWall(project: Project): Wall {
  const g = latticeFor(project.tile);
  const gap = project.tile.edgeGap || 0;
  return {
    id: 'W' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: `Pan ${project.walls.length + 1}`,
    W: 200, H: 100, color: '#efe6d2',
    ox: round1(g.R + gap), oy: round1(g.F / 2 + gap), zoneMode: 'organic',
    zone: [[-10, -10], [-10, 40], [210, 40], [210, -10]],
    obstacles: [], photo: null, tiles: {},
  };
}

export function addWall(): void {
  commit(p => { p.walls.push(newWall(p)); });
  setUi({ tab: `wall:${getProject().walls.length - 1}` });
}

export function deleteWall(i: number): void {
  const w = getProject().walls[i]!;
  if (!window.confirm(`Supprimer le pan « ${w.name} » ?`)) return;
  commit(p => { p.walls.splice(i, 1); });
  setUi({ tab: 'wall:0' });
  removeUnusedImages(getProject());
}

export function addDesign(): void {
  commit(p => {
    const used = new Set(p.designs.map(d => d.key));
    let k = 0;
    while (used.has(colLetters(k))) k++;
    p.designs.push({ key: colLetters(k), name: 'Nouveau motif', img: '', color: '#88aaaa', weight: 1 });
  });
}

export function deleteDesign(k: number): void {
  if (getProject().designs.length <= 1) return;
  commit(p => { p.designs.splice(k, 1); });
  removeUnusedImages(getProject());
}

// Une clé est renommée partout ; une clé vide ou déjà prise est ignorée.
export function renameDesignKey(k: number, raw: string): void {
  const v = raw.trim().toUpperCase();
  const designs = getProject().designs;
  const old = designs[k]!.key;
  if (!v || v === old || designs.some((d, j) => j !== k && d.key === v)) return;
  commit(p => {
    p.designs[k]!.key = v;
    for (const w of p.walls) {
      for (const a of Object.values(w.tiles)) if (a.d === old) a.d = v;
    }
  }, { coalesce: `designs.${k}.key` });
  if (useStore.getState().ui.design === old) setUi({ design: v });
}

export function resetProject(): void {
  if (!window.confirm('Effacer tout le projet et repartir de l\'exemple ?')) return;
  replaceProject(demoProject());
  setUi({ tab: 'wall:0' });
  removeUnusedImages(getProject());
}

function storeImage(dataUrl: string): string {
  const ref = 'img:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  useStore.setState(s => ({ images: { ...s.images, [ref]: dataUrl } }));
  if (!writeImage(ref, dataUrl)) showToast('Stockage du navigateur plein : l\'image reste pour cette session, pense à exporter le projet.');
  return ref;
}

const fileError = (e: unknown): void => showToast(`Impossible de lire le fichier : ${e instanceof Error ? e.message : String(e)}`);

export async function uploadPhoto(i: number, file: File): Promise<void> {
  try {
    const r = await readImageFile(file, 1800);
    const src = storeImage(r.url);
    let prepared = false;
    commit(p => {
      const w = p.walls[i]!;
      prepared = !!w.calib;
      w.photo = {
        src, opacity: 1, blend: true,
        pts: w.calib ? calibPoints(w.calib, r.w, r.h) : defaultCalib(w, r.w, r.h),
      };
      delete w.calib;
    });
    setUi({ view: { ...useStore.getState().ui.view, [i]: 'photo' }, tool: 'calib' });
    showToast(prepared
      ? 'Photo calée avec les repères de ton IA. Vérifie que le contour jaune tombe sur le mur.'
      : 'Cale maintenant la photo : place les 4 pastilles jaunes sur les repères indiqués à gauche.', 6000);
  } catch (e) {
    fileError(e);
  }
}

export function removePhoto(i: number): void {
  commit(p => { p.walls[i]!.photo = null; });
  removeUnusedImages(getProject());
}

// Photo d'ensemble : chaque pan démarre calé sur une portion de la photo, de gauche à droite, à ajuster ensuite.
export async function uploadOverview(file: File): Promise<void> {
  try {
    const r = await readImageFile(file, 2400);
    const src = storeImage(r.url);
    commit(p => {
      const n = p.walls.length;
      const walls = Object.fromEntries(p.walls.map((w, k) => [w.id, defaultCalib(w, r.w, r.h, (k + 0.1) / n, (k + 0.9) / n)]));
      p.overview = { src, opacity: p.overview?.opacity ?? 1, blend: p.overview?.blend ?? true, walls };
    });
    removeUnusedImages(getProject());
    showToast('Cale maintenant chaque pan : place ses 4 pastilles sur les points indiqués de la photo.', 6000);
  } catch (e) {
    fileError(e);
  }
}

// Quand la photo d'ensemble est la photo d'un pan (même cadrage), son calage se reprend tel quel, à l'échelle.
export async function copyWallCalib(wallId: string, nw: number, nh: number): Promise<void> {
  const w = getProject().walls.find(x => x.id === wallId);
  const url = imageUrl(w?.photo?.src, useStore.getState().images);
  if (!w?.photo || !url) return;
  try {
    const size = await imageSize(url);
    const sx = nw / size.w;
    const sy = nh / size.h;
    if (Math.abs(sx - sy) > 0.02 * sx) {
      showToast('Les deux photos n\'ont pas le même cadrage : place les pastilles à la main.');
      return;
    }
    const pts = w.photo.pts.map(pt => ({ ...pt, px: pt.px * sx, py: pt.py * sy }));
    commit(p => { if (p.overview) p.overview.walls[wallId] = pts; });
  } catch (e) {
    fileError(e);
  }
}

export function removeOverview(): void {
  commit(p => { delete p.overview; });
  removeUnusedImages(getProject());
}

export function moveOverviewPoint(wallId: string, k: number, px: number, py: number): void {
  commit(p => {
    const pt = p.overview?.walls[wallId]?.[k];
    if (!pt) return;
    pt.px = px;
    pt.py = py;
  }, { coalesce: `overview.${wallId}.${k}` });
}

export async function uploadDesignImage(k: number, file: File): Promise<void> {
  try {
    const r = await readImageFile(file, 400);
    const [color, colors] = await Promise.all([averageColor(r.url), dominantColors(r.url)]);
    const ref = storeImage(r.url);
    commit(p => {
      p.designs[k]!.img = ref;
      p.designs[k]!.color = color;
      p.designs[k]!.colors = colors;
    });
  } catch (e) {
    fileError(e);
  }
}

// Relit les couleurs principales de tous les motifs qui ont une image.
export async function detectColors(): Promise<void> {
  const images = useStore.getState().images;
  const found = await Promise.all(getProject().designs.map(async d => {
    const url = imageUrl(d.img, images);
    return url ? { key: d.key, colors: await dominantColors(url).catch(() => []) } : null;
  }));
  const done = found.filter(f => f && f.colors.length) as { key: string; colors: string[] }[];
  commit(p => {
    for (const { key, colors } of done) {
      const d = p.designs.find(x => x.key === key);
      if (d) d.colors = colors;
    }
  });
  showToast(done.length ? `Couleurs relues sur ${done.length} motif${done.length > 1 ? 's' : ''}. Corrige-les si besoin.` : 'Aucun motif n\'a d\'image à lire.', 5000);
}

const SHEET_MAX_SIDE = 2400; // assez de pixels pour garder chaque motif net une fois découpé
const MOTIF_MAX_SIDE = 400;

export async function cutDesignsFromPhoto(file: File): Promise<void> {
  try {
    const sheet = await readImageFile(file, SHEET_MAX_SIDE);
    const todo = getProject().designs.filter(d => d.crop);
    const cut = await Promise.all(todo.map(async d => {
      const url = await cropImage(sheet.url, d.crop!, MOTIF_MAX_SIDE);
      const [color, colors] = await Promise.all([averageColor(url), dominantColors(url)]);
      return { key: d.key, color, colors, ref: storeImage(url) };
    }));
    commit(p => {
      for (const { key, color, colors, ref } of cut) {
        const d = p.designs.find(x => x.key === key);
        if (!d) continue;
        d.img = ref;
        d.color = color;
        d.colors = colors;
        delete d.crop;
      }
    });
    removeUnusedImages(getProject());
    showToast(`${cut.length} motif${cut.length > 1 ? 's' : ''} découpé${cut.length > 1 ? 's' : ''}. Vérifie-les, et remplace ceux qui sont mal cadrés avec Image….`, 6000);
  } catch (e) {
    fileError(e);
  }
}

export async function importFile(file: File): Promise<void> {
  try {
    const { state, images, missingImages } = parseProjectFile(await file.text());
    for (const [ref, url] of Object.entries(images)) writeImage(ref, url);
    replaceProject(state, images);
    setUi({ tab: 'wall:0' });
    const missing = missingImages.length;
    showToast(missing
      ? `Projet importé, mais ${missing} image${missing > 1 ? 's' : ''} absente${missing > 1 ? 's' : ''} du fichier : recharge-les.`
      : 'Projet importé.', missing ? 8000 : 3500);
  } catch (e) {
    fileError(e);
  }
}

// Un calage reçu pour une photo déjà chargée s'applique dès que sa taille est connue.
async function applyCalibToPhotos(): Promise<void> {
  const { project, images } = useStore.getState();
  for (const w of project.walls) {
    const url = imageUrl(w.photo?.src, images);
    if (!w.calib || !url) continue;
    const { w: width, h } = await imageSize(url);
    const pts = calibPoints(w.calib, width, h);
    mutate(p => {
      const wall = p.walls.find(x => x.id === w.id);
      if (!wall?.photo) return;
      wall.photo.pts = pts;
      delete wall.calib;
    });
  }
}

export async function applyConfig(next: Project): Promise<void> {
  replaceProject(next);
  setUi({ tab: 'wall:0', aiOpen: false, pending: null });
  const { walls, designs } = getProject();
  const waiting = [
    ...(walls.some(w => w.calib && !w.photo) ? ['Choisis la photo de chaque mur : le calage est prêt.'] : []),
    ...(designs.some(d => d.crop) ? ['Dans Carreaux & motifs, choisis la photo des carreaux : la découpe est prête.'] : []),
  ];
  showToast(`Modifications appliquées. ${waiting.join(' ') || 'Vérifie les cotes au mètre.'}`, 8000);
  try {
    await applyCalibToPhotos();
  } catch (e) {
    fileError(e);
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    showToast('Copie impossible : sélectionne le texte de la consigne et copie-le.');
    return false;
  }
}

export function exportProject(): void {
  const { project, images } = useStore.getState();
  const blob = new Blob([serializeProject(project, images)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `calepineur-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function printPlan(): void {
  setUi({ tab: 'print' });
  setTimeout(() => window.print(), 150);
}
