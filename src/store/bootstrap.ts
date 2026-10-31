// Branche la sauvegarde automatique et lit l'adresse d'ouverture.
import { resolveConfig } from '../core/aiReply';
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

const CONFIG_PREFIX = '#config=';

// Un lien de configuration ne change rien tout seul : il est soumis à l'utilisateur, puis retiré de l'adresse.
function openConfigLink(hash: string): void {
  const encoded = hash.slice(CONFIG_PREFIX.length);
  history.replaceState(null, '', location.pathname + location.search);
  try {
    let text = encoded;
    try {
      text = decodeURIComponent(encoded);
    } catch {
      // l'IA a laissé des caractères non encodés : on tente le texte brut
    }
    setUi({ pending: resolveConfig(getProject(), text) });
  } catch (e) {
    showToast(`Lien de configuration invalide : ${e instanceof Error ? e.message : String(e)}`, 8000);
  }
}

// #wall:1/photo/calib/labels : ouvre directement un onglet, une vue et un outil.
export function applyHash(hash: string): void {
  if (hash.startsWith(CONFIG_PREFIX)) {
    openConfigLink(hash);
    return;
  }
  const parts = decodeURIComponent(hash.replace(/^#/, '')).split('/');
  const patch: Partial<UiState> = {};
  if (parts[0]) patch.tab = parts[0];
  if (parts[1] && patch.tab) patch.view = { [wallIndex({ tab: patch.tab })]: parts[1] as View };
  if (parts[2]) patch.tool = parts[2] as Tool;
  if (parts.includes('labels')) patch.labels = true;
  setUi(patch);
}
