// Vue d'ensemble : tous les pans d'un coup d'œil, en plan déplié, sur leurs photos, ou sur une photo de toute la pièce.
import { useRef, useState, type PointerEvent } from 'react';
import { cm } from '../core/format';
import { joinsPrevious, unfold } from '../core/layout';
import { defaultCalib } from '../core/photo';
import { imageUrl } from '../core/project';
import { copyWallCalib, joinOverviewCalib, moveOverviewPoint, removeOverview, uploadOverview } from '../store/actions';
import { commit, getProject, setUi, useStore } from '../store/store';
import { FileButton, NumField, SegRadio } from './fields';
import { PhotoComposite, type PhotoScale } from './PhotoComposite';
import { WallSvg } from './WallSvg';

type Mode = 'plan' | 'photos' | 'global';

const MODES: { value: Mode; label: string }[] = [
  { value: 'plan', label: 'Plan déplié' },
  { value: 'photos', label: 'Photos des pans' },
  { value: 'global', label: 'Photo d\'ensemble' },
];

// Les pans reliés par un angle se touchent ; une nouvelle suite commence sur une nouvelle ligne. Même échelle partout.
function PlanView() {
  const project = useStore(s => s.project);
  const comps = useStore(s => s.comps);
  const images = useStore(s => s.images);
  const places = unfold(project.walls);
  const runs = [...new Set(places.map(p => p.run))].map(run => project.walls.flatMap((w, i) => (places[i]!.run === run ? [{ w, i }] : [])));
  const widest = Math.max(1, ...runs.map(r => r.reduce((s, { w }) => s + w.W, 0)));
  return (
    <div className="overview-plan">
      {runs.map((run, k) => {
        const width = run.reduce((s, { w }) => s + w.W, 0);
        const low = Math.min(...run.map(({ i }) => places[i]!.y0));
        return (
          <div key={k} className="overview-run" style={{ width: `${(100 * width) / widest}%` }}>
            {run.map(({ w, i }, j) => (
              // Une marge en % se rapporte à la largeur de la suite : même échelle que les pans.
              <figure key={w.id} className={j > 0 ? 'overview-wall joined' : 'overview-wall'}
                style={{ width: `${(100 * w.W) / width}%`, marginBottom: `${(100 * (places[i]!.y0 - low)) / width}%` }}>
                <WallSvg project={project} wall={w} comp={comps[i]!} images={images} mode="print" uid={`o${i}`} bare />
                <figcaption>{w.name || `Pan ${i + 1}`} · {cm(w.W)} × {cm(w.H)} cm</figcaption>
              </figure>
            ))}
          </div>
        );
      })}
      <p className="hint">Les pans reliés par un angle commun se suivent sans espace, à leur hauteur l'un par rapport à l'autre (réglages « Angle commun » et « Décalage en hauteur » de chaque pan).</p>
    </div>
  );
}

function PhotosView() {
  const project = useStore(s => s.project);
  const comps = useStore(s => s.comps);
  const images = useStore(s => s.images);
  return (
    <div className="overview-photos">
      {project.walls.map((w, i) => {
        const src = imageUrl(w.photo?.src, images);
        return (
          <figure key={w.id} className="overview-photo">
            {src && w.photo ? (
              <PhotoComposite project={project} images={images} src={src} alt={`Photo de ${w.name}`} opacity={w.photo.opacity} blend={w.photo.blend}
                layers={[{ wall: w, comp: comps[i]!, pts: w.photo.pts, uid: `v${i}` }]} />
            ) : (
              <div className="overview-missing">
                <p>Pas de photo pour ce pan.</p>
                <button onClick={() => setUi({ tab: `wall:${i}`, view: { ...useStore.getState().ui.view, [i]: 'photo' } })}>Ajouter une photo</button>
              </div>
            )}
            <figcaption>{w.name || `Pan ${i + 1}`}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function CalibHandles({ wallId, scale }: { wallId: string; scale: PhotoScale }) {
  const pts = useStore(s => s.project.overview?.walls[wallId]);
  const drag = useRef<number | null>(null);
  if (!pts) return null;
  const r = 9 / scale.s;
  const toImage = (e: PointerEvent<SVGElement>): [number, number] => {
    const rc = (e.currentTarget.ownerSVGElement ?? e.currentTarget as SVGSVGElement).getBoundingClientRect();
    return [(e.clientX - rc.left) / scale.s, (e.clientY - rc.top) / scale.s];
  };
  return (
    <g>
      <polygon points={pts.map(p => `${p.px},${p.py}`).join(' ')} fill="none" stroke="#ffcc00" strokeWidth={2 / scale.s} strokeDasharray={`${6 / scale.s} ${4 / scale.s}`} />
      {pts.map((p, k) => (
        <g key={k} data-handle="overview" className="handle"
          onPointerDown={e => { drag.current = k; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); }}
          onPointerMove={e => { if (drag.current === k) moveOverviewPoint(wallId, k, ...toImage(e)); }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}>
          <circle cx={p.px} cy={p.py} r={r} fill="#ffcc00" stroke="#000" strokeWidth={1.5 / scale.s} />
          <text x={p.px} y={p.py + r * 0.42} fontSize={r * 1.2} textAnchor="middle" fontWeight="700">{k + 1}</text>
          <text x={p.px + r * 1.4} y={p.py - r * 1.2} fontSize={r * 1.1} fill="#fff" stroke="#000" strokeWidth={2 / scale.s} paintOrder="stroke">
            {cm(p.wx)} ; {cm(p.wy)}
          </text>
        </g>
      ))}
    </g>
  );
}

function GlobalView() {
  const project = useStore(s => s.project);
  const comps = useStore(s => s.comps);
  const images = useStore(s => s.images);
  const [calibId, setCalibId] = useState<string>('');
  const [photoSize, setPhotoSize] = useState<PhotoScale | null>(null);
  const ov = project.overview;
  const src = imageUrl(ov?.src, images);
  if (!ov || !src) {
    return (
      <div className="overview-missing big">
        <p>Ajoute une photo qui montre tous les pans à la fois : chaque pan y sera calé sur 4 repères, comme sur sa propre photo.</p>
        <FileButton accept="image/*" onFile={f => void uploadOverview(f)}>Choisir la photo d'ensemble…</FileButton>
      </div>
    );
  }
  const calibIndex = project.walls.findIndex(w => w.id === calibId);
  const calibWall = project.walls[calibIndex];
  // Voisins par un angle déjà posés sur la photo : l'arête commune peut se reprendre de leur calage.
  const joins = calibWall && ov.walls[calibWall.id]
    ? ([[calibIndex - 1, 'left', calibIndex], [calibIndex + 1, 'right', calibIndex + 1]] as const).flatMap(([j, side, link]) => {
      const n = project.walls[j];
      return n && ov.walls[n.id] && joinsPrevious(project.walls, link) ? [{ n, side }] : [];
    })
    : [];
  const edit = (path: string, fn: (o: NonNullable<typeof ov>) => void) => commit(p => { if (p.overview) fn(p.overview); }, { coalesce: `overview.${path}` });
  const layers = project.walls.flatMap((w, i) => (ov.walls[w.id] ? [{ wall: w, comp: comps[i]!, pts: ov.walls[w.id], uid: `g${i}`, outlines: w.id === calibId }] : []));
  return (
    <div className="overview-global">
      <div className="overview-tools">
        <label>Caler un pan
          <select value={calibId} onChange={e => setCalibId(e.target.value)}>
            <option value="">— aucun —</option>
            {project.walls.map(w => <option key={w.id} value={w.id}>{w.name}{ov.walls[w.id] ? '' : ' (pas encore placé)'}</option>)}
          </select>
        </label>
        <label>Opacité des carreaux
          <input type="range" min="0.2" max="1" step="0.05" value={ov.opacity} onChange={e => edit('opacity', o => { o.opacity = Number(e.target.value); })} />
        </label>
        <label className="inline"><input type="checkbox" checked={ov.blend} onChange={e => edit('blend', o => { o.blend = e.target.checked; })} /> Fondre dans la lumière de la photo</label>
        <FileButton accept="image/*" onFile={f => void uploadOverview(f)}>Changer la photo…</FileButton>
        <button onClick={removeOverview}>Retirer</button>
      </div>
      {calibWall && (
        <div className="overview-calib">
          <p className="hint">Place les 4 pastilles jaunes de « {calibWall.name} » sur les points du mur dont tu connais la position (coins, angle au ras du plan de travail, bas de hotte…), et saisis-la ici en cm.{joins.length > 0 && ' Pour l\'angle commun, place d\'abord le pan voisin, puis raccorde-le : seuls les deux repères du côté opposé restent à placer.'}</p>
          {calibWall.photo && (
            <button disabled={!photoSize} title="Si la photo d'ensemble est celle de ce pan, son calage s'applique tel quel"
              onClick={() => photoSize && void copyWallCalib(calibWall.id, photoSize.nw, photoSize.nh)}>Reprendre le calage de sa photo</button>
          )}
          {joins.map(({ n, side }) => (
            <button key={n.id} title="Les deux repères les plus proches de l'angle passent sur l'arête commune, telle que le pan voisin la place"
              onClick={() => joinOverviewCalib(calibWall.id, n.id, side)}>Raccorder à « {n.name} »</button>
          ))}
          {ov.walls[calibWall.id] ? (
            <table className="calib">
              <thead><tr><th>#</th><th>x (cm)</th><th>y (cm)</th></tr></thead>
              <tbody>
                {ov.walls[calibWall.id]!.map((pt, k) => (
                  <tr key={k}>
                    <td>{k + 1}</td>
                    <td><NumField aria-label={`x du repère ${k + 1} sur la photo d'ensemble`} step={0.5} value={pt.wx} onChange={v => edit(`${calibWall.id}.${k}.wx`, o => { o.walls[calibWall.id]![k]!.wx = v; })} /></td>
                    <td><NumField aria-label={`y du repère ${k + 1} sur la photo d'ensemble`} step={0.5} value={pt.wy} onChange={v => edit(`${calibWall.id}.${k}.wy`, o => { o.walls[calibWall.id]![k]!.wy = v; })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <button disabled={!photoSize} onClick={() => photoSize && placeWall(calibWall.id, photoSize)}>Placer « {calibWall.name} » sur la photo</button>
          )}
        </div>
      )}
      <PhotoComposite project={project} images={images} src={src} alt="Photo d'ensemble" opacity={ov.opacity} blend={ov.blend} layers={layers}
        className="overview-big" onScale={setPhotoSize} overlay={scale => (calibWall ? <CalibHandles wallId={calibWall.id} scale={scale} /> : null)} />
    </div>
  );
}

// Un pan ajouté après la photo d'ensemble démarre au centre de la photo.
function placeWall(wallId: string, size: PhotoScale): void {
  const w = getProject().walls.find(x => x.id === wallId);
  if (!w) return;
  commit(p => { if (p.overview) p.overview.walls[wallId] = defaultCalib(w, size.nw, size.nh, 0.3, 0.7); });
}

export function OverviewPage() {
  const hasGlobal = useStore(s => !!s.project.overview);
  const hasPhotos = useStore(s => s.project.walls.some(w => w.photo));
  const [mode, setMode] = useState<Mode>(hasGlobal ? 'global' : hasPhotos ? 'photos' : 'plan');
  return (
    <div id="page" className="overview">
      <div className="overview-bar">
        <SegRadio name="overview-mode" value={mode} onChange={setMode} options={MODES} />
      </div>
      {mode === 'plan' && <PlanView />}
      {mode === 'photos' && <PhotosView />}
      {mode === 'global' && <GlobalView />}
    </div>
  );
}
