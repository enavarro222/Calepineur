import { cm } from '../core/format';
import { latticeFor } from '../core/lattice';
import { boxCount, orderCounts } from '../core/order';
import { commit, useStore } from '../store/store';
import { NumField } from './fields';
import { HexSwatch } from './HexSwatch';

function OrderTable() {
  const project = useStore(s => s.project);
  const comps = useStore(s => s.comps);
  const t = project.tile;
  const oc = orderCounts(project, comps);
  const g = latticeFor(t);
  const area = comps.reduce((a, c) => a + c.stats.area, 0);
  const box = boxCount(t, g, oc.toOrder);
  return (
    <>
      <table className="order">
        <thead>
          <tr>
            <th>Motif</th>
            {project.walls.map(w => <th key={w.id}>{w.name}<small>entiers + coupés</small></th>)}
            <th>Posés</th>
            <th>+ {cm(t.waste || 0)} %</th>
          </tr>
        </thead>
        <tbody>
          {project.designs.map(d => {
            const p = oc.per[d.key]!;
            return (
              <tr key={d.key}>
                <td className="m"><HexSwatch design={d} /> <b>{d.key}</b> {d.name}</td>
                {p.walls.map((x, i) => <td key={i}>{x.full + x.cut ? `${x.full} + ${x.cut}` : '—'}</td>)}
                <td>{p.total}</td>
                <td className="big">{p.order}</td>
              </tr>
            );
          })}
          <tr className="tot">
            <td>Total</td>
            {project.walls.map((w, i) => <td key={w.id}>{comps[i]!.stats.full} + {comps[i]!.stats.cut}</td>)}
            <td>{oc.total}</td>
            <td className="big" data-testid="to-order">{oc.toOrder}</td>
          </tr>
        </tbody>
      </table>
      <div className="kpis">
        <div><span>{cm(area / 1e4, 2)} m²</span>surface carrelée</div>
        <div><span>{cm(oc.toOrder * g.area / 1e4, 2)} m²</span>de carreaux à commander</div>
        <div><span>{oc.toOrder}</span>carreaux à commander</div>
        {box && <div><span>{box.boxes}</span>boîte{box.boxes > 1 ? 's' : ''} de {box.perBox} ({box.spare} de rab)</div>}
      </div>
    </>
  );
}

export function OrderPage() {
  const t = useStore(s => s.project.tile);
  return (
    <div id="page">
      <div className="order-tab">
        <section className="card wide"><h3>Quantités par motif</h3><OrderTable /></section>
        <section className="card">
          <h3>Paramètres</h3>
          <label>Casse / marge (%) <NumField step={1} min={0} value={t.waste} onChange={v => commit(p => { p.tile.waste = v; }, { coalesce: 'tile.waste' })} /></label>
          <div className="row">
            <label>Carreaux par boîte <NumField step={1} min={0} value={t.perBox} onChange={v => commit(p => { p.tile.perBox = v; }, { coalesce: 'tile.perBox' })} /></label>
            <label>ou m² par boîte <NumField step={0.01} min={0} value={t.m2PerBox} onChange={v => commit(p => { p.tile.m2PerBox = v; }, { coalesce: 'tile.m2PerBox' })} /></label>
          </div>
          <p className="hint">Chaque carreau coupé compte pour un carreau entier (les chutes sont rarement réutilisables avec des motifs). Si les motifs sont vendus en boîtes panachées au hasard, commande sur le total et adapte la disposition à la réception.</p>
        </section>
      </div>
    </div>
  );
}
