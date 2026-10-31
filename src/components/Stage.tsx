// Scène d'un pan : vue Plan ou vue Photo, et traduction du pointeur vers les outils.
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { fmt, cm } from '../core/format';
import { applyH, invH } from '../core/geom';
import { PHOTO_K, photoH, photoMatrix } from '../core/photo';
import { imageUrl } from '../core/project';
import type { Point, Wall } from '../core/types';
import { uploadPhoto } from '../store/actions';
import { getProject, useStore, type View } from '../store/store';
import { hoverInfo, isDragging, moveDrag, press, release, type HoverInfo, type StagePoint } from '../store/tools';
import { FileButton } from './fields';
import { WallSvg } from './WallSvg';

interface StageProps {
  i: number;
  onHover: (h: HoverInfo | null) => void;
}

interface ImageScale {
  s: number;
  nw: number;
  nh: number;
}

function planPoint(root: HTMLElement, e: PointerEvent, wall: Wall): StagePoint | null {
  const svg = root.querySelector<SVGSVGElement>('svg.wall-svg');
  const m = svg?.getScreenCTM();
  if (!m) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { w: [p.x, wall.H - p.y], tol: 12 / m.a };
}

function photoPoint(img: HTMLImageElement, e: PointerEvent, wall: Wall): StagePoint | null {
  if (!img.naturalWidth) return null;
  const rc = img.getBoundingClientRect();
  const s = img.clientWidth / img.naturalWidth;
  const nat: Point = [(e.clientX - rc.left) / s, (e.clientY - rc.top) / s];
  const Hw = photoH(wall);
  const Hi = Hw && invH(Hw);
  if (!Hi) return { nat, s, w: null, tol: 0 };
  const wp = applyH(Hi, nat);
  const w2 = applyH(Hi, [nat[0] + 14 / s, nat[1]]);
  return { nat, s, w: wp, tol: Math.hypot(w2[0] - wp[0], w2[1] - wp[1]) };
}

function CalibMarks({ wall, scale }: { wall: Wall; scale: ImageScale }) {
  const { s } = scale;
  const r = 9 / s;
  return (
    <>
      {wall.photo!.pts.map((p, k) => (
        <g key={k}>
          <circle data-handle="calib" cx={p.px} cy={p.py} r={r} fill="#ffcc00" stroke="#000" strokeWidth={1.5 / s} />
          <text x={p.px} y={p.py + r * 0.42} fontSize={r * 1.2} textAnchor="middle" fontWeight="700">{k + 1}</text>
          <text x={p.px + r * 1.4} y={p.py - r * 1.2} fontSize={r * 1.1} fill="#fff" stroke="#000" strokeWidth={2 / s} paintOrder="stroke">
            {cm(p.wx)} ; {cm(p.wy)}
          </text>
        </g>
      ))}
    </>
  );
}

export function Stage({ i, onHover }: StageProps) {
  const project = useStore(s => s.project);
  const comp = useStore(s => s.comps[i]);
  const images = useStore(s => s.images);
  const tool = useStore(s => s.ui.tool);
  const labels = useStore(s => s.ui.labels);
  const cuts = useStore(s => s.ui.cuts);
  const view: View = useStore(s => s.ui.view[i] ?? 'plan');
  const wall = project.walls[i];

  const root = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState<ImageScale | null>(null);
  const [hoverPts, setHoverPts] = useState('');

  const measure = useCallback(() => {
    const img = imgRef.current;
    if (img?.naturalWidth) setScale({ s: img.clientWidth / img.naturalWidth, nw: img.naturalWidth, nh: img.naturalHeight });
  }, []);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const src = wall ? imageUrl(wall.photo?.src, images) : '';
  if (!wall || !comp) return null;

  const photoView = view === 'photo';
  const stagePoint = (e: PointerEvent): StagePoint | null => {
    const w = getProject().walls[i]!;
    if (photoView) return imgRef.current ? photoPoint(imgRef.current, e, w) : null;
    return root.current ? planPoint(root.current, e, w) : null;
  };

  const hover = (pt: StagePoint) => {
    const h = hoverInfo(i, pt, photoView);
    setHoverPts(h?.points ? h.points.map(p => p.map(fmt).join(',')).join(' ') : '');
    onHover(h);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 2) return;
    const pt = stagePoint(e);
    if (!pt) return;
    if (press(i, pt, { button: e.button, altKey: e.altKey })) {
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  };
  const onMove = (e: PointerEvent) => {
    const pt = stagePoint(e);
    if (!pt) return;
    if (isDragging()) moveDrag(i, pt);
    hover(pt);
  };

  const calib = tool === 'calib';
  const empty = photoView && !src;
  const className = !photoView ? 'stage plan' : empty ? 'stage empty' : 'stage photo';
  const matrix = scale && photoMatrix(wall, scale.s);

  return (
    <div
      id="stage"
      ref={root}
      data-testid="stage"
      className={className}
      data-tool={tool}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={e => e.preventDefault()}
    >
      {!photoView && (
        <WallSvg project={project} wall={wall} comp={comp} images={images} mode="plan" uid="p"
          labels={labels} cuts={cuts} tool={tool} hoverPoints={hoverPts} />
      )}
      {empty && (
        <div className="empty-msg">
          <p>{wall.calib ? 'Calage prêt : choisis la photo de ce mur, sans la recadrer.' : 'Pas de photo pour ce pan.'}</p>
          <FileButton accept="image/*" onFile={f => void uploadPhoto(i, f)}>Choisir une photo…</FileButton>
        </div>
      )}
      {photoView && src && (
        <div className="photo-wrap">
          <img ref={imgRef} className="ph-img" alt={`Photo de ${wall.name}`} draggable={false} src={src} onLoad={measure} />
          {scale && (
            <div
              className="ph-tiles"
              style={{
                transform: matrix ?? undefined,
                display: matrix ? undefined : 'none',
                opacity: calib ? 0.75 : wall.photo!.opacity,
                mixBlendMode: wall.photo!.blend && !calib ? 'multiply' : 'normal',
              }}
            >
              <WallSvg project={project} wall={wall} comp={comp} images={images} mode="photo" uid="f" k={PHOTO_K}
                outlines={calib} labels={labels} tool={tool} />
            </div>
          )}
          {scale && (
            <svg className="ph-over" viewBox={`0 0 ${scale.nw} ${scale.nh}`}>
              {calib && <CalibMarks wall={wall} scale={scale} />}
              <polygon className="hover" points={hoverPts} fill="rgba(255,255,255,.2)" stroke="#111" strokeWidth={2 / scale.s} pointerEvents="none" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}
