import { useEffect, useState } from 'react';
import { AiDialog, ConfigReview } from './components/AiDialog';
import { HarmonyDialog } from './components/HarmonyDialog';
import { OrderPage } from './components/OrderPage';
import { PrintPage } from './components/PrintPage';
import { TilesPage } from './components/TilesPage';
import { WallPage } from './components/WallPage';
import { FileButton } from './components/fields';
import { addWall, exportProject, importFile, printPlan } from './store/actions';
import { closeInvite, inviteClosed } from './store/persistence';
import { getProject, getUi, redo, setUi, undo, useStore, wallIndex } from './store/store';

const PAGES: [string, string][] = [['tiles', 'Carreaux & motifs'], ['order', 'Commande'], ['print', 'Calepinage']];

function Tabs() {
  const tab = useStore(s => s.ui.tab);
  const lastWall = useStore(s => s.ui.lastWall);
  const hasWalls = useStore(s => s.project.walls.length > 0);
  const openWalls = () => {
    if (hasWalls) setUi({ tab: `wall:${lastWall}` });
    else addWall();
  };
  return (
    <nav id="tabs">
      <button className={tab.startsWith('wall') ? 'on' : ''} onClick={openWalls}>Pans</button>
      {PAGES.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setUi({ tab: k })}>{l}</button>)}
    </nav>
  );
}

function WallTabs() {
  const walls = useStore(s => s.project.walls);
  const tab = useStore(s => s.ui.tab);
  return (
    <div id="wall-tabs" className="app-chrome">
      <span className="wall-tabs-label">Pans à carreler</span>
      {walls.map((w, i) => (
        <button key={w.id} className={tab === `wall:${i}` ? 'on' : ''} onClick={() => setUi({ tab: `wall:${i}` })}>{w.name || `Pan ${i + 1}`}</button>
      ))}
      <button className="add" onClick={addWall}>+ Ajouter un pan</button>
    </div>
  );
}

function AiInvite() {
  const isDemo = useStore(s => s.project.walls.every(w => w.id.startsWith('demo-')));
  const [closed, setClosed] = useState(inviteClosed);
  if (!isDemo || closed) return null;
  return (
    <div id="ai-invite" className="app-chrome">
      <span>Ceci est un projet d'exemple. Tes photos et ta référence de carreaux suffisent pour que ton IA prépare le tien.</span>
      <button className="primary" onClick={() => setUi({ aiOpen: true })}>Configurer avec mon IA</button>
      <button className="icon" aria-label="Fermer l'invitation" title="Fermer" onClick={() => { closeInvite(); setClosed(true); }}>×</button>
    </div>
  );
}

function Header() {
  const canUndo = useStore(s => s.past.length > 0);
  const canRedo = useStore(s => s.future.length > 0);
  return (
    <header className="app-chrome">
      <div className="brand">⬣ Calepineur</div>
      <Tabs />
      <div className="actions">
        <button onClick={() => setUi({ aiOpen: true })}>Préparer avec une IA</button>
        <button title="Annuler (Ctrl+Z)" aria-label="Annuler" disabled={!canUndo} onClick={undo}>↶</button>
        <button title="Rétablir (Ctrl+Y)" aria-label="Rétablir" disabled={!canRedo} onClick={redo}>↷</button>
        <button title="Télécharger le projet (avec les images) en JSON" onClick={exportProject}>Exporter</button>
        <FileButton title="Ouvrir un projet exporté" accept=".json,application/json" onFile={f => void importFile(f)}>Importer</FileButton>
        <button className="primary" onClick={printPlan}>Imprimer</button>
      </div>
    </header>
  );
}

function Toast() {
  const toast = useStore(s => s.toast);
  return <div id="toast" role="status" className={toast ? 'on' : ''}>{toast?.msg}</div>;
}

function onKeyDown(e: KeyboardEvent): void {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '');
  if (typing) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if (mod && key === 'y') {
    e.preventDefault();
    redo();
  } else if (!mod && /^[1-9]$/.test(e.key) && wallIndex(getUi()) >= 0) {
    const d = getProject().designs[Number(e.key) - 1];
    if (d) setUi({ design: d.key, tool: 'paint' });
  }
}

export function App() {
  const tab = useStore(s => s.ui.tab);
  const aiOpen = useStore(s => s.ui.aiOpen);
  const pending = useStore(s => s.ui.pending);
  const harmonyOpen = useStore(s => s.ui.harmonyOpen);

  useEffect(() => {
    const toPrint = () => setUi({ tab: 'print' });
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('beforeprint', toPrint);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('beforeprint', toPrint);
    };
  }, []);

  const kind = tab.split(':')[0];
  const i = wallIndex({ tab });
  return (
    <>
      <Header />
      <AiInvite />
      {kind === 'wall' && <WallTabs />}
      <main id="main" className={`main-${kind}`}>
        {kind === 'wall' && <WallPage key={i} i={i} />}
        {kind === 'tiles' && <TilesPage />}
        {kind === 'order' && <OrderPage />}
        {kind === 'print' && <PrintPage />}
      </main>
      {aiOpen && <AiDialog />}
      {pending && <ConfigReview next={pending} />}
      {harmonyOpen && <HarmonyDialog />}
      <Toast />
    </>
  );
}
