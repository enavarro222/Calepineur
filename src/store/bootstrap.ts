// Branche la sauvegarde automatique et lit l'adresse d'ouverture.
import { writeProject } from './persistence';
import { getProject, setUi, showToast, useStore, wallIndex, type Tool, type UiState, type View } from './store';

const SAVE_DELAY_MS = 300;

export function installPersistence(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const saveNow = () => {
    clearTimeout(timer);
    if (!writeProject(getProject())) showToast('Sauvegarde locale impossible : exporte le projet pour ne rien perdre.');
  };
  const unsubscribe = useStore.subscribe((s, prev) => {
    if (s.project === prev.project) return;
    clearTimeout(timer);
    timer = setTimeout(saveNow, SAVE_DELAY_MS);
  });
  window.addEventListener('pagehide', saveNow);
  return () => {
    unsubscribe();
    clearTimeout(timer);
    window.removeEventListener('pagehide', saveNow);
  };
}

// #wall:1/photo/calib/labels : ouvre directement un onglet, une vue et un outil.
export function applyHash(hash: string): void {
  const parts = decodeURIComponent(hash.replace(/^#/, '')).split('/');
  const patch: Partial<UiState> = {};
  if (parts[0]) patch.tab = parts[0];
  if (parts[1] && patch.tab) patch.view = { [wallIndex({ tab: patch.tab })]: parts[1] as View };
  if (parts[2]) patch.tool = parts[2] as Tool;
  if (parts.includes('labels')) patch.labels = true;
  setUi(patch);
}
