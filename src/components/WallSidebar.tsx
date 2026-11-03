import { useState } from 'react';
import { round1 } from '../core/geom';
import { joinsPrevious } from '../core/layout';
import type { Point, Wall } from '../core/types';
import { clearBrush, deleteWall, linkToPrevious, optimize, removePhoto, setJoinDy, uploadPhoto } from '../store/actions';
import { commit, showToast, useStore } from '../store/store';
import { FileButton, NumField, SegRadio } from './fields';

const brushCount = (w: Wall): number => Object.values(w.tiles).filter(a => a.st).length;
const zoneToText = (zone: Point[]): string => zone.map(p => `${round1(p[0])} ${round1(p[1])}`).join('\n');

function parseZone(text: string): Point[] {
  return text.split('\n')
    .map(l => l.trim().split(/[\s;,]+/).map(Number))
    .filter(p => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(p => [p[0]!, p[1]!]);
}

function ZoneText({ i, wall }: { i: number; wall: Wall }) {
  const [draft, setDraft] = useState<string | null>(null);
  const leave = () => {
    if (draft === null) return;
    setDraft(null);
    const pts = parseZone(draft);
    if (pts.length < 3) showToast('Il faut au moins 3 points.');
    else commit(p => { p.walls[i]!.zone = pts; });
  };
  return (
    <label>
      Points du contour (x y, en cm)
      <textarea rows={6} spellCheck={false} value={draft ?? zoneToText(wall.zone)} onChange={e => setDraft(e.target.value)} onBlur={leave} />
    </label>
  );
}

export function WallSidebar({ i }: { i: number }) {
  const wall = useStore(s => s.project.walls[i]);
  const prevName = useStore(s => s.project.walls[i - 1]?.name);
  const joined = useStore(s => joinsPrevious(s.project.walls, i));
  if (!wall) return null;

  const edit = (path: string, fn: (w: Wall) => void) => commit(p => fn(p.walls[i]!), { coalesce: `walls.${i}.${path}` });
  const ph = wall.photo;
  const hasPhoto = !!ph?.src;
  const brushed = brushCount(wall);

  return (
    <aside id="side">
      <section>
        <h3>Pan</h3>
        <label>Nom <input value={wall.name} onChange={e => edit('name', w => { w.name = e.target.value; })} /></label>
        <div className="row">
          <label>Largeur (cm) <NumField step={0.5} value={wall.W} onChange={v => edit('W', w => { w.W = v; })} /></label>
          <label>Hauteur (cm) <NumField step={0.5} value={wall.H} onChange={v => edit('H', w => { w.H = v; })} /></label>
        </div>
        <label className="inline">Couleur du mur <input type="color" value={wall.color} onChange={e => edit('color', w => { w.color = e.target.value; })} /></label>
        <p className="hint">Origine : coin bas-gauche du pan, au ras du plan de travail. Largeur = longueur du pan à carreler (d'un bord dur à l'autre).</p>
      </section>

      <section>
        <h3>Grille</h3>
        <p className="hint">Centre du carreau de référence (croix rose avec l'outil <b>Grille</b>, que tu peux faire glisser).</p>
        <div className="row">
          <label>X (cm) <NumField value={wall.ox} onChange={v => edit('ox', w => { w.ox = v; })} /></label>
          <label>Y (cm) <NumField value={wall.oy} onChange={v => edit('oy', w => { w.oy = v; })} /></label>
        </div>
        <div className="btns">
          <button title="Cherche le décalage horizontal qui gaspille le moins de carreaux et évite les petites coupes" onClick={() => optimize(i, false)}>Optimiser ↔</button>
          <button title="Cherche le meilleur décalage horizontal et vertical" onClick={() => optimize(i, true)}>Optimiser ↔↕</button>
          {i > 0 && <button title="Continue le motif de la grille du pan précédent à travers l'angle" onClick={() => linkToPrevious(i)}>Raccorder à « {prevName} »</button>}
        </div>
        {i > 0 && (
          <>
            <label className="inline">
              <input type="checkbox" checked={joined} onChange={e => edit('joinPrev', w => { w.joinPrev = e.target.checked; })} />
              Angle commun avec « {prevName} »
            </label>
            <p className="hint">Le bord droit de « {prevName} » touche le bord gauche de ce pan. Harmoniser regarde alors les voisins à travers l'angle, et la vue d'ensemble met les deux pans côte à côte.</p>
            {joined && (
              <>
                <label>Décalage en hauteur avec « {prevName} » (cm)
                  <NumField step={0.5} value={wall.joinDy ?? 0} onChange={v => setJoinDy(i, v)} />
                </label>
                <p className="hint">
                  Hauteur du bas de ce pan au-dessus du bas de « {prevName} », négative s'il part plus bas. Par exemple −90 si ce pan part du sol
                  et « {prevName} » du plan de travail, à 90 cm. Les pans dont le bas est au même niveau gardent 0.
                </p>
              </>
            )}
          </>
        )}
      </section>

      <section>
        <h3>Zone à carreler</h3>
        <SegRadio name="zone-mode" value={wall.zoneMode} onChange={v => edit('zoneMode', w => { w.zoneMode = v; })}
          options={[{ value: 'organic', label: 'Bord organique' }, { value: 'cut', label: 'Bord coupé net' }]} />
        <p className="hint">
          <b>Organique</b> : un carreau est posé si son centre est dans la zone, il reste entier côté zone (bord en escalier). <b>Coupé net</b> : les carreaux sont recoupés sur le contour.<br />
          Fais déborder la zone au-delà du plan de travail et des angles : ce sont eux (bords durs) qui coupent les carreaux.
        </p>
        <p className="hint"><b>Pinceau zone</b> (Plan ou Photo) : clique et glisse sur les carreaux. Partir d'un carreau posé en retire, partir d'un emplacement vide (pointillés) en ajoute. Clic droit : retire toujours.</p>
        {brushed > 0 && (
          <div className="btns">
            <button title="Supprime les carreaux ajoutés ou retirés au pinceau, la zone redevient celle du contour" onClick={() => clearBrush(i)}>Effacer les retouches au pinceau ({brushed})</button>
          </div>
        )}
        <p className="hint"><b>Contour zone</b> : glisse les points bleus, glisse un point blanc pour en ajouter un, clic droit pour en supprimer.</p>
        <ZoneText i={i} wall={wall} />
      </section>

      <section>
        <h3>Éléments</h3>
        <p className="hint">Rectangles qui interrompent le carrelage (fenêtre, hotte, prises, meubles). x, y = coin bas-gauche. Outil <b>Éléments</b> pour les déplacer à la souris.</p>
        <table className="obst">
          <thead><tr><th>Nom</th><th>x</th><th>y</th><th>larg.</th><th>haut.</th><th></th></tr></thead>
          <tbody>
            {wall.obstacles.map((o, k) => (
              <tr key={k}>
                <td><input aria-label={`Nom de l'élément ${k + 1}`} value={o.name} onChange={e => edit(`obst.${k}.name`, w => { w.obstacles[k]!.name = e.target.value; })} /></td>
                {(['x', 'y', 'w', 'h'] as const).map(f => (
                  <td key={f}><NumField aria-label={`${f} de ${o.name}`} step={0.5} value={o[f]} onChange={v => edit(`obst.${k}.${f}`, w => { w.obstacles[k]![f] = v; })} /></td>
                ))}
                <td><button className="icon" title={`Supprimer ${o.name}`} aria-label={`Supprimer ${o.name}`} onClick={() => commit(p => { p.walls[i]!.obstacles.splice(k, 1); })}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => commit(p => { p.walls[i]!.obstacles.push({ name: 'Élément', x: 10, y: 10, w: 20, h: 10 }); })}>+ Ajouter un élément</button>
      </section>

      <section>
        <h3>Photo</h3>
        {wall.calib && !hasPhoto && <p className="calib-ready">Calage prêt : choisis la photo de ce mur, sans la recadrer.</p>}
        <div className="btns">
          <FileButton accept="image/*" onFile={f => void uploadPhoto(i, f)}>{hasPhoto ? 'Changer la photo…' : 'Choisir une photo…'}</FileButton>
          {hasPhoto && <button onClick={() => removePhoto(i)}>Retirer</button>}
        </div>
        {ph && hasPhoto ? (
          <>
            <label>Opacité des carreaux
              <input type="range" min="0.2" max="1" step="0.05" value={ph.opacity} onChange={e => edit('photo.opacity', w => { w.photo!.opacity = Number(e.target.value); })} />
            </label>
            <label className="inline">
              <input type="checkbox" checked={ph.blend} onChange={e => edit('photo.blend', w => { w.photo!.blend = e.target.checked; })} /> Fondre dans la lumière de la photo
            </label>
            <h4>Calage sur 4 repères</h4>
            <p className="hint">Vue <b>Photo</b>, outil <b>Caler la photo</b> : place les 4 pastilles jaunes sur des points reconnaissables du mur (angle au ras du plan de travail, coin de fenêtre, bas de hotte…) et saisis ici leur position réelle en cm. Le contour jaune doit tomber sur le mur.</p>
            <table className="calib">
              <thead><tr><th>#</th><th>x (cm)</th><th>y (cm)</th></tr></thead>
              <tbody>
                {ph.pts.map((pt, k) => (
                  <tr key={k}>
                    <td>{k + 1}</td>
                    <td><NumField aria-label={`x du repère ${k + 1}`} step={0.5} value={pt.wx} onChange={v => edit(`calib.${k}.wx`, w => { w.photo!.pts[k]!.wx = v; })} /></td>
                    <td><NumField aria-label={`y du repère ${k + 1}`} step={0.5} value={pt.wy} onChange={v => edit(`calib.${k}.wy`, w => { w.photo!.pts[k]!.wy = v; })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : <p className="hint">Une photo prise bien en face du mur donne le meilleur rendu.</p>}
      </section>

      <section><button className="danger" onClick={() => deleteWall(i)}>Supprimer ce pan</button></section>
    </aside>
  );
}
