import { shuffle } from '../store/actions';
import { setUi, useStore, type Tool, type View } from '../store/store';
import { HexSwatch } from './HexSwatch';

const COMMON_TOOLS: [Tool, string][] = [['paint', 'Peindre'], ['rotate', 'Pivoter'], ['swap', 'Échanger'], ['replace', 'Remplacer'], ['toggle', 'Pinceau zone'], ['zone', 'Contour zone']];
const PLAN_TOOLS: [Tool, string][] = [...COMMON_TOOLS, ['obst', 'Éléments'], ['grid', 'Grille']];
const PHOTO_TOOLS: [Tool, string][] = [...COMMON_TOOLS, ['calib', 'Caler la photo']];
const TOOL_HINTS: Partial<Record<Tool, string>> = {
  swap: 'Clique sur deux carreaux pour les intervertir, sans changer les quantités',
  replace: 'Clique sur un carreau pour lui proposer un autre motif, sans voisin identique ni répétition proche ; reclique pour une autre proposition',
};
const VIEWS: [View, string][] = [['plan', 'Plan'], ['photo', 'Photo']];

const on = (active: boolean): string => (active ? 'on' : '');

export function Toolbar({ i }: { i: number }) {
  const ui = useStore(s => s.ui);
  const designs = useStore(s => s.project.designs);
  const view = ui.view[i] ?? 'plan';
  const tools = view === 'plan' ? PLAN_TOOLS : PHOTO_TOOLS;
  const tool = tools.some(t => t[0] === ui.tool) ? ui.tool : 'paint';

  const setView = (v: View) => {
    const allowed = v === 'plan' ? PLAN_TOOLS : PHOTO_TOOLS;
    setUi({ view: { ...ui.view, [i]: v }, tool: allowed.some(t => t[0] === ui.tool) ? ui.tool : 'paint' });
  };

  return (
    <div id="toolbar">
      <div className="seg">
        {VIEWS.map(([v, l]) => <button key={v} className={on(v === view)} onClick={() => setView(v)}>{l}</button>)}
      </div>
      <div className="seg">
        {tools.map(([v, l]) => <button key={v} className={on(v === tool)} title={TOOL_HINTS[v]} onClick={() => setUi({ tool: v, swapFrom: null })}>{l}</button>)}
      </div>
      <div className="palette" title="Motif à peindre (touches 1 à 9)">
        {designs.map(d => (
          <button key={d.key} className={on(ui.design === d.key)} title={`${d.key} — ${d.name}`} onClick={() => setUi({ design: d.key, tool: 'paint' })}>
            <HexSwatch design={d} /><span>{d.key}</span>
          </button>
        ))}
      </div>
      <div className="toolbar-end">
        <div className="seg">
          <button className={on(ui.labels)} title="Étiquettes des carreaux" onClick={() => setUi({ labels: !ui.labels })}>Repères</button>
          <button className={on(ui.defects)} title="Surligne les voisins identiques, les paires à une colonne d'écart, alignements, répétitions, amas et taches" onClick={() => setUi({ defects: !ui.defects })}>Défauts</button>
          {view === 'plan' && <button className={on(ui.cuts)} title="Contour des carreaux coupés" onClick={() => setUi({ cuts: !ui.cuts })}>Coupes</button>}
        </div>
        <button title="Nouvelle répartition (garde les carreaux peints à la main, et le style choisi dans Harmoniser)" onClick={() => shuffle(true)}>Mélanger</button>
        <button className="primary" title="Cherche plusieurs répartitions plus harmonieuses, à quantités égales" onClick={() => setUi({ harmonyOpen: true })}>Harmoniser</button>
      </div>
    </div>
  );
}
