// Actions de l'interface qui ne se limitent pas à changer une valeur.
import { demoProject } from '../core/demo';
import { computeWalls } from '../core/compute';
import { pruneTiles, shuffleDesigns } from '../core/designs';
import { cm } from '../core/format';
import { colLetters, round1 } from '../core/geom';
import { latticeFor } from '../core/lattice';
import { optimizeGrid } from '../core/optimize';
import { calibPoints } from '../core/photo';
import { imageUrl, parseProjectFile, serializeProject } from '../core/project';
import type { Project, Wall } from '../core/types';
import { imageSize, readImageFile } from '../lib/images';
import { removeUnusedImages, writeImage } from './persistence';
import { commit, getComps, getProject, mutate, replaceProject, setUi, showToast, useStore } from './store';

export function shuffle(keepLocked: boolean): void {
  commit(p => {
    p.seed = (p.seed || 0) + 1;
    shuffleDesigns(p, getComps(), keepLocked);
    pruneTiles(p, getComps());
  });
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
      const H = Math.min(w.H, 80);
      prepared = !!w.calib;
      w.photo = {
        src, opacity: 1, blend: true,
        pts: w.calib ? calibPoints(w.calib, r.w, r.h) : [
          { wx: 0, wy: 0, px: r.w * .15, py: r.h * .75 },
          { wx: w.W, wy: 0, px: r.w * .85, py: r.h * .75 },
          { wx: w.W, wy: H, px: r.w * .85, py: r.h * .4 },
          { wx: 0, wy: H, px: r.w * .15, py: r.h * .4 },
        ],
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

export async function uploadDesignImage(k: number, file: File): Promise<void> {
  try {
    const r = await readImageFile(file, 400);
    const ref = storeImage(r.url);
    commit(p => { p.designs[k]!.img = ref; });
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
  const waiting = getProject().walls.some(w => w.calib && !w.photo);
  showToast(waiting
    ? 'Modifications appliquées. Choisis la photo de chaque mur : le calage est prêt.'
    : 'Modifications appliquées. Vérifie les cotes au mètre.', 6000);
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
