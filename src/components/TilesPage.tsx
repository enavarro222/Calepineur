import { useMemo, useState } from 'react';
import { computeWall } from '../core/compute';
import { bannedFor, pickDesign, pickRot } from '../core/designs';
import { cm } from '../core/format';
import { hashStr, mulberry32 } from '../core/geom';
import { latticeFor } from '../core/lattice';
import type { Project, RotMode, Wall } from '../core/types';
import { addDesign, deleteDesign, renameDesignKey, resetProject, shuffle, uploadDesignImage } from '../store/actions';
import { commit, useStore } from '../store/store';
import { FileButton, NumField, SegRadio } from './fields';
import { HexSwatch } from './HexSwatch';
import { WallSvg } from './WallSvg';

function KeyField({ k, value }: { k: number; value: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="key"
      aria-label={`Clé du motif ${k + 1}`}
      maxLength={3}
      value={draft ?? value}
      onChange={e => { setDraft(e.target.value); renameDesignKey(k, e.target.value); }}
      onBlur={() => setDraft(null)}
    />
  );
}

function usePreview(project: Project) {
  return useMemo(() => {
    const g = latticeFor(project.tile);
    const W = Math.max(60, g.F * 6.5);
    const H = Math.max(40, g.F * 3.8);
    const wall: Wall = {
      id: 'prev', name: '', W, H, color: '#efe6d2', ox: g.R, oy: g.F / 2, zoneMode: 'organic',
      zone: [[-50, -50], [-50, H + 50], [W + 50, H + 50], [W + 50, -50]], obstacles: [], photo: null, tiles: {},
    };
    const comp = computeWall({ tile: { ...project.tile, edgeGap: 0 } }, wall);
    const rng = mulberry32(hashStr(`prev:${project.seed}`));
    const counts: Record<string, number> = {};
    for (const t of comp.tiles) {
      const d = pickDesign(project, counts, bannedFor(wall, comp, t), rng);
      wall.tiles[t.key] = { d, rot: pickRot(project, rng) };
      if (d) counts[d] = (counts[d] ?? 0) + 1;
    }
    return { wall, comp };
  }, [project]);
}

function Preview() {
  const project = useStore(s => s.project);
  const images = useStore(s => s.images);
  const { wall, comp } = usePreview(project);
  return <WallSvg project={project} wall={wall} comp={comp} images={images} mode="print" uid="v" />;
}

export function TilesPage() {
  const project = useStore(s => s.project);
  const t = project.tile;
  const g = latticeFor(t);
  const edit = (path: string, fn: (p: Project) => void) => commit(fn, { coalesce: path });

  return (
    <div id="page">
      <div className="tiles-tab">
        <section className="card">
          <h3>Carreau</h3>
          <div className="row">
            <label>Largeur plat à plat (cm) <NumField min={2} value={t.F} onChange={v => { if (v > 0) edit('tile.F', p => { p.tile.F = v; }); }} /></label>
            <label>Joint (cm) <NumField step={0.05} min={0} value={t.joint} onChange={v => edit('tile.joint', p => { p.tile.joint = v; })} /></label>
          </div>
          <p className="hint">
            Pointe à pointe : <b>{cm(2 * g.R)} cm</b> · côté : {cm(g.R)} cm · surface : {cm(g.area, 0)} cm² · {cm(1e4 / g.area, 1)} carreaux/m² (hors joints)
          </p>
          <SegRadio name="orient" value={t.orient} onChange={v => edit('tile.orient', p => { p.tile.orient = v; })}
            options={[{ value: 'flat', label: '⬣ Pointes sur les côtés' }, { value: 'pointy', label: '⬢ Pointes en haut' }]} />
          <div className="row">
            <label>Retrait aux bords durs (cm) <NumField step={0.05} min={0} value={t.edgeGap} onChange={v => edit('tile.edgeGap', p => { p.tile.edgeGap = v; })} /></label>
            <label className="inline">Couleur du joint <input type="color" value={t.grout} onChange={e => edit('tile.grout', p => { p.tile.grout = e.target.value; })} /></label>
          </div>
          <p className="hint">Le retrait laisse un petit jeu contre le plan de travail, les angles et les éléments (joint silicone).</p>
          <label>Signaler les coupes plus petites que (% du carreau) <NumField step={1} min={0} max={90} value={t.minPiece} onChange={v => edit('tile.minPiece', p => { p.tile.minPiece = v; })} /></label>
        </section>

        <section className="card">
          <h3>Motifs</h3>
          <table className="designs">
            <thead>
              <tr><th></th><th>Clé</th><th>Nom</th><th title="0 = motif non utilisé ; 2 = deux fois plus fréquent">Poids</th><th>Couleur</th><th></th><th></th></tr>
            </thead>
            <tbody>
              {project.designs.map((d, k) => (
                <tr key={k}>
                  <td><HexSwatch design={d} big /></td>
                  <td><KeyField k={k} value={d.key} /></td>
                  <td><input aria-label={`Nom du motif ${d.key}`} value={d.name} onChange={e => edit(`designs.${k}.name`, p => { p.designs[k]!.name = e.target.value; })} /></td>
                  <td><NumField aria-label={`Poids du motif ${d.key}`} className="w" step={0.5} min={0} value={d.weight} onChange={v => edit(`designs.${k}.weight`, p => { p.designs[k]!.weight = v; })} /></td>
                  <td><input type="color" aria-label={`Couleur du motif ${d.key}`} value={d.color} onChange={e => edit(`designs.${k}.color`, p => { p.designs[k]!.color = e.target.value; })} /></td>
                  <td><FileButton className="btn small" accept="image/*" onFile={f => void uploadDesignImage(k, f)}>Image…</FileButton></td>
                  <td><button className="icon" title={`Supprimer le motif ${d.key}`} aria-label={`Supprimer le motif ${d.key}`} onClick={() => deleteDesign(k)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addDesign}>+ Ajouter un motif</button>
          <p className="hint">L'image d'un motif est étirée sur le rectangle qui entoure l'hexagone, pointes sur les côtés.</p>
          <h4>Répartition</h4>
          <div className="row">
            <label>Rotation des carreaux
              <select value={project.rotMode} onChange={e => edit('rotMode', p => { p.rotMode = e.target.value as RotMode; })}>
                <option value="none">Tous dans le même sens</option>
                <option value="180">Au hasard, 0° ou 180°</option>
                <option value="60">Au hasard, par 60°</option>
              </select>
            </label>
            <label>Graine <NumField step={1} value={project.seed} onChange={v => edit('seed', p => { p.seed = v; })} /></label>
          </div>
          <div className="btns">
            <button onClick={() => shuffle(true)}>Mélanger (garder mes choix)</button>
            <button onClick={() => { if (window.confirm('Re-mélanger tous les carreaux, y compris ceux peints ou pivotés à la main ?')) shuffle(false); }}>Tout re-mélanger</button>
          </div>
          <p className="hint">Le mélange équilibre les quantités selon les poids et évite deux motifs identiques côte à côte. La rotation s'applique au prochain mélange.</p>
        </section>

        <section className="card preview"><h3>Aperçu</h3><div id="tile-preview"><Preview /></div></section>

        <section className="card">
          <h3>Projet</h3>
          <label>Nom du projet <input value={project.name} onChange={e => edit('name', p => { p.name = e.target.value; })} /></label>
          <div className="btns"><button className="danger" onClick={resetProject}>Repartir de l'exemple</button></div>
        </section>
      </div>
    </div>
  );
}
