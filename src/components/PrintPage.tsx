// Document de chantier : couverture, plan de chaque pan, repères de traçage, vignettes de coupe.
import type { PlacedTile, WallComp } from '../core/compute';
import { designMap } from '../core/designs';
import { cm } from '../core/format';
import { colLetters } from '../core/geom';
import { latticeFor } from '../core/lattice';
import { orderCounts } from '../core/order';
import type { Wall } from '../core/types';
import { printPlan } from '../store/actions';
import { useStore } from '../store/store';
import { CutCard } from './CutCard';
import { HexSwatch } from './HexSwatch';
import { WallSvg } from './WallSvg';

function SetoutTable({ comp: c }: { comp: WallComp }) {
  if (!c.tiles.length) return null;
  const g = c.g;
  const groups = new Map<number, PlacedTile[]>();
  for (const t of c.tiles) {
    const k = g.flat ? t.q : t.r;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const keys = [...groups.keys()].sort((a, b) => a - b);
  const ref = c.tiles.reduce((b, t) => (t.full && (!b.full || t.q < b.q || (t.q === b.q && t.r < b.r)) ? t : b), c.tiles[0]!);
  return (
    <>
      <h3>Repères de traçage</h3>
      <p className="meta">
        Carreau de départ conseillé : <b>{ref.label}</b> ({ref.full ? 'entier' : 'coupé'}), centre à <b>x = {cm(ref.c[0])} cm</b> du bord gauche et <b>y = {cm(ref.c[1])} cm</b> au-dessus du plan de travail ;{' '}
        {g.flat ? `son bord bas est à ${cm(ref.c[1] - g.F / 2)} cm` : `sa pointe gauche est à ${cm(ref.c[0] - g.F / 2)} cm`}.{' '}
        {g.flat
          ? <>Axes des colonnes tous les <b>{cm(g.px, 2)} cm</b> ; d'un carreau à l'autre dans une colonne : <b>{cm(g.d, 2)} cm</b> ; une colonne sur deux est décalée de {cm(g.d / 2, 2)} cm.</>
          : <>Axes des rangs tous les <b>{cm(g.py, 2)} cm</b> ; d'un carreau à l'autre dans un rang : <b>{cm(g.d, 2)} cm</b> ; un rang sur deux est décalé de {cm(g.d / 2, 2)} cm.</>}
      </p>
      <table className="setout">
        <thead>
          <tr>
            <th>{g.flat ? 'Colonne' : 'Rang'}</th>
            <th>{g.flat ? 'Axe vertical x' : 'Axe horizontal y'}</th>
            <th>Carreaux ({g.flat ? 'bas → haut' : 'gauche → droite'}), * = coupé</th>
          </tr>
        </thead>
        <tbody>
          {keys.map(k => {
            const ts = [...groups.get(k)!].sort((a, b) => (g.flat ? a.r - b.r : a.q - b.q));
            const first = ts[0]!;
            return (
              <tr key={k}>
                <td><b>{g.flat ? colLetters(k - c.qmin) : k - c.rmin + 1}</b></td>
                <td>{cm(g.flat ? first.c[0] : first.c[1])} cm</td>
                <td>{ts.map(t => (t.full ? `${t.label} ` : <span key={t.key} className="cutlbl">{t.label}* </span>))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function WallPages({ wall, comp, index }: { wall: Wall; comp: WallComp; index: number }) {
  const project = useStore(s => s.project);
  const images = useStore(s => s.images);
  const dm = designMap(project);
  const cuts = comp.tiles.filter(t => !t.full).sort((a, b) => a.q - b.q || a.r - b.r);
  return (
    <>
      <section className="page">
        <h2>{wall.name} <small>{cm(wall.W)} × {cm(wall.H)} cm · {comp.stats.n} carreaux ({comp.stats.full} entiers, {comp.stats.cut} coupés)</small></h2>
        <div className="plan"><WallSvg project={project} wall={wall} comp={comp} images={images} mode="print" uid={`w${index}`} labels cuts /></div>
        <SetoutTable comp={comp} />
      </section>
      {cuts.length > 0 && (
        <section className="page">
          <h2>{wall.name} — coupes <small>{cuts.length} carreaux</small></h2>
          <div className="cuts">
            {cuts.map((t, k) => {
              const a = wall.tiles[t.key];
              const d = a?.d ? dm.get(a.d) : undefined;
              return (
                <figure key={t.key} className={t.small ? 'cut small' : 'cut'}>
                  <CutCard project={project} wall={wall} comp={comp} tile={t} images={images} uid={`c${index}_${k}_`} />
                  <figcaption>
                    <b>{t.label}</b> · {a?.d ?? '?'} {d?.name ?? ''}{a?.rot ? ` · ↻${a.rot * 60}°` : ''}<br />
                    <small>{Math.round(t.frac * 100)} % du carreau{t.holes ? ' · découpe intérieure' : ''}{t.piece.length > 1 ? ` · ${t.piece.length} morceaux` : ''}</small>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

export function PrintPage() {
  const project = useStore(s => s.project);
  const comps = useStore(s => s.comps);
  const t = project.tile;
  const g = latticeFor(t);
  const oc = orderCounts(project, comps);
  return (
    <div id="page">
      <div className="print-bar app-chrome">
        <button className="primary" onClick={printPlan}>Imprimer / PDF</button>
        <span className="hint">Format A4 paysage conseillé. Les vignettes de coupe sont vues de face, carreau posé.</span>
      </div>
      <div className="doc" id="doc">
        <section className="page cover">
          <h1>{project.name} — calepinage</h1>
          <p className="meta">
            Carreau hexagonal {cm(g.F)} cm plat à plat ({cm(2 * g.R)} cm pointe à pointe, côté {cm(g.R)} cm), joint {cm(g.j * 10)} mm, {g.flat ? 'pointes sur les côtés' : 'pointes en haut'}.
            {' '}Retrait aux bords : {cm(t.edgeGap * 10)} mm. Édité le {new Date().toLocaleDateString('fr-FR')}.
          </p>
          <h3>Motifs</h3>
          <div className="legend">
            {project.designs.map(d => {
              const p = oc.per[d.key]!;
              return <div key={d.key}><HexSwatch design={d} big /><b>{d.key}</b> {d.name}<small>{p.total} posés · {p.order} à commander</small></div>;
            })}
          </div>
          <h3>Lecture du plan</h3>
          <ul className="conv">
            <li>Étiquette <b>C4</b> = colonne C (de gauche à droite), rang 4 (de bas en haut). En dessous : le motif, et la rotation s'il y en a (↻ sens inverse des aiguilles d'une montre).</li>
            <li>Contour rouge pointillé : carreau coupé. Hachures : petite coupe (moins de {cm(t.minPiece)} % du carreau).</li>
            <li>Les vignettes de coupe montrent le carreau <b>vu de face, dans son sens de pose</b> ; cotes en cm, traits rouges = lignes de coupe.</li>
            <li>Toutes les cotes partent du coin bas-gauche du pan, au ras du plan de travail.</li>
          </ul>
          <h3>Total</h3>
          <p>
            {oc.total} carreaux posés ({comps.map((c, i) => `${project.walls[i]!.name} : ${c.stats.full} entiers + ${c.stats.cut} coupés`).join(' ; ')}) → <b>{oc.toOrder} à commander</b> avec {cm(t.waste)} % de marge.
          </p>
        </section>
        {project.walls.map((w, i) => <WallPages key={w.id} wall={w} comp={comps[i]!} index={i} />)}
      </div>
    </div>
  );
}
