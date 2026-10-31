// Sauvegarde dans le navigateur. localStorage peut être plein ou bloqué : rien ici ne doit planter l'app.
import { parseProject, imageRefs, type ImageStore } from '../core/project';
import type { Project } from '../core/types';

export const LS_KEY = 'calepineur.state.v1';
export const LS_IMG = 'calepineur.img.';

export function readSaved(): { project: Project; images: ImageStore } | null {
  try {
    const text = localStorage.getItem(LS_KEY);
    if (!text) return null;
    const project = parseProject(JSON.parse(text));
    const images: ImageStore = {};
    for (const r of imageRefs(project)) {
      const v = r.startsWith('img:') ? localStorage.getItem(LS_IMG + r.slice(4)) : null;
      if (v) images[r] = v;
    }
    return { project, images };
  } catch (e) {
    console.warn(e);
    return null;
  }
}

export function writeProject(project: Project): boolean {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}

export function writeImage(ref: string, dataUrl: string): boolean {
  try {
    localStorage.setItem(LS_IMG + ref.slice(4), dataUrl);
    return true;
  } catch {
    return false;
  }
}

export function removeUnusedImages(project: Project): void {
  const keep = new Set(imageRefs(project).map(r => r.slice(4)));
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(LS_IMG) && !keep.has(k.slice(LS_IMG.length))) localStorage.removeItem(k);
    }
  } catch {
    // stockage indisponible : rien à nettoyer
  }
}
