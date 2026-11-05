// État de l'application. Le projet est immuable : chaque modification produit une nouvelle version,
// ce qui donne l'annulation à moindre coût. Chaque version a tous ses carreaux affectés à un motif.
import { produce } from 'immer';
import { create } from 'zustand';
import { computeWalls, type WallComp } from '../core/compute';
import { demoProject } from '../core/demo';
import { ensureAssigned } from '../core/designs';
import type { ImageStore } from '../core/project';
import type { Project } from '../core/types';
import { readSaved } from './persistence';

export type Tool = 'paint' | 'rotate' | 'swap' | 'replace' | 'toggle' | 'zone' | 'obst' | 'grid' | 'calib';
export type View = 'plan' | 'photo';

export interface UiState {
  tab: string; // 'wall:<i>', 'overview', 'tiles', 'order' ou 'print'
  view: Record<number, View>;
  tool: Tool;
  design: string | null;
  labels: boolean;
  cuts: boolean;
  lastWall: number; // pan rouvert par l'onglet Pans
  aiOpen: boolean;
  pending: Project | null; // configuration reçue par lien, en attente de validation
  defects: boolean;
  harmonyOpen: boolean;
  swapFrom: { wallId: string; key: string } | null; // premier carreau choisi avec l'outil Échanger
}

export interface AppState {
  project: Project;
  comps: WallComp[];
  images: ImageStore;
  past: Project[];
  future: Project[];
  ui: UiState;
  toast: { msg: string; id: number } | null;
}

const MAX_UNDO = 80;
const COALESCE_MS = 1500;

export interface CommitOptions {
  coalesce?: string; // saisies successives d'un même champ : une seule étape d'annulation
}

export function settle(project: Project): { project: Project; comps: WallComp[] } {
  const comps = computeWalls(project);
  return { project: produce(project, d => { ensureAssigned(d, comps); }), comps };
}

export function fixUi(ui: UiState, project: Project): UiState {
  const next = { ...ui };
  if (next.tab.startsWith('wall') && !project.walls[wallIndex(next)]) next.tab = project.walls.length ? 'wall:0' : 'tiles';
  if (!next.design || !project.designs.some(d => d.key === next.design)) next.design = project.designs[0]?.key ?? null;
  const wall = wallIndex(next);
  next.lastWall = wall >= 0 ? wall : Math.min(next.lastWall, Math.max(project.walls.length - 1, 0));
  return next;
}

export function wallIndex(ui: Pick<UiState, 'tab'>): number {
  const [kind, i] = ui.tab.split(':');
  return kind === 'wall' ? Number(i) : -1;
}

function initialState(): AppState {
  const saved = readSaved();
  const base = saved?.project ?? demoProject();
  const { project, comps } = settle(base);
  const ui = fixUi({ tab: 'wall:0', view: {}, tool: 'paint', design: null, labels: false, cuts: true, lastWall: 0, aiOpen: false, pending: null, defects: false, harmonyOpen: false, swapFrom: null }, project);
  return { project, comps, images: saved?.images ?? {}, past: [], future: [], ui, toast: null };
}

export const useStore = create<AppState>(() => initialState());

let lastCo: string | null = null;
let lastCoT = 0;

export function resetStore(): void {
  lastCo = null;
  useStore.setState(initialState(), true);
}

export const getProject = (): Project => useStore.getState().project;
export const getComps = (): WallComp[] => useStore.getState().comps;
export const getUi = (): UiState => useStore.getState().ui;

function applyProject(next: Project, extra: Partial<AppState> = {}): void {
  const settled = settle(next);
  useStore.setState(s => ({ ...settled, ...extra, ui: fixUi(extra.ui ?? s.ui, settled.project) }));
}

export function pushUndo(): void {
  useStore.setState(s => ({ past: [...s.past, s.project].slice(-MAX_UNDO), future: [] }));
}

// Modification sans étape d'annulation : pour les tracés, dont l'étape est posée au début du geste.
export function mutate(fn: (p: Project) => void): void {
  applyProject(produce(getProject(), fn));
}

export function commit(fn: (p: Project) => void, o: CommitOptions = {}): void {
  const now = Date.now();
  if (!(o.coalesce && o.coalesce === lastCo && now - lastCoT < COALESCE_MS)) pushUndo();
  lastCo = o.coalesce ?? null;
  lastCoT = now;
  mutate(fn);
}

export function replaceProject(project: Project, images?: ImageStore): void {
  pushUndo();
  lastCo = null;
  applyProject(project, images ? { images: { ...useStore.getState().images, ...images } } : {});
}

export function endGesture(): void {
  lastCo = null;
}

export function undo(): void {
  const { past, project, future } = useStore.getState();
  const prev = past[past.length - 1];
  if (!prev) return;
  lastCo = null;
  applyProject(prev, { past: past.slice(0, -1), future: [...future, project] });
}

export function redo(): void {
  const { past, project, future } = useStore.getState();
  const next = future[future.length - 1];
  if (!next) return;
  lastCo = null;
  applyProject(next, { past: [...past, project], future: future.slice(0, -1) });
}

export function setUi(patch: Partial<UiState>): void {
  useStore.setState(s => ({ ui: fixUi({ ...s.ui, ...patch }, s.project) }));
}

let toastId = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(msg: string, ms = 3500): void {
  const id = ++toastId;
  useStore.setState({ toast: { msg, id } });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => useStore.setState({ toast: null }), ms);
}
