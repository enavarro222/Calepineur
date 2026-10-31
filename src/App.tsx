import { useEffect } from 'react';
import { OrderPage } from './components/OrderPage';
import { PrintPage } from './components/PrintPage';
import { TilesPage } from './components/TilesPage';
import { WallPage } from './components/WallPage';
import { FileButton } from './components/fields';
import { addWall, exportProject, importFile, printPlan } from './store/actions';
import { getProject, getUi, redo, setUi, undo, useStore, wallIndex } from './store/store';

function Tabs() {
  const walls = useStore(s => s.project.walls);
  const tab = useStore(s => s.ui.tab);
  const tabs: [string, string][] = [
    ...walls.map((w, i): [string, string] => [`wall:${i}`, w.name || `Pan ${i + 1}`]),
    ['tiles', 'Carreaux & motifs'], ['order', 'Commande'], ['print', 'Calepinage'],
  ];
  return (
    <nav id="tabs">
      {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setUi({ tab: k })}>{l}</button>)}
      <button className="add" title="Ajouter un pan" onClick={addWall}>+</button>
    </nav>
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
      <main id="main" className={`main-${kind}`}>
        {kind === 'wall' && <WallPage key={i} i={i} />}
        {kind === 'tiles' && <TilesPage />}
        {kind === 'order' && <OrderPage />}
        {kind === 'print' && <PrintPage />}
      </main>
      <Toast />
    </>
  );
}
