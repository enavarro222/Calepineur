// Vue d'ensemble, onglet Teintes : on pose sur le plan déplié des repères de couleur, que le style « Mes teintes »
// d'Harmoniser et Mélanger suivent ensuite. Le fond montre la teinte visée à chaque carreau.
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { WallComp } from '../core/compute';
import { cm, fmt } from '../core/format';
import { unfold } from '../core/layout';
import { designColors } from '../core/palette';
import { tintBalance, tintColor, wallStarts } from '../core/tints';
import type { Project, Wall } from '../core/types';
import { addTint, clearTints, moveTint, recolorTint, removeTint, setTintSharpness } from '../store/actions';
import { setUi, useStore } from '../store/store';
import { WallSvg } from './WallSvg';

interface Swatch {
  color: string;
  label: string;
}

// Couleurs proposées : celles des motifs, la dominante d'abord, sans doublon.
function swatches(project: Project): Swatch[] {
  const seen = new Map<string, string[]>();
  for (const d of project.designs) {
    designColors(d).forEach(c => {
      const k = c.toLowerCase();
      seen.set(k, [...(seen.get(k) ?? []), d.name || d.key]);
    });
  }
  return [...seen].map(([color, names]) => ({ color, label: `${color} (${names.join(', ')})` }));
}

// Point du pointeur, en cm depuis le coin bas-gauche du pan, ramené dans le pan.
function wallPoint(e: PointerEvent<SVGElement>, wall: Wall): [number, number] | null {
  const svg = e.currentTarget.ownerSVGElement ?? (e.currentTarget as SVGSVGElement);
  const m = svg.getScreenCTM?.();
  if (!m) return null;
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return [Math.min(wall.W, Math.max(0, p.x)), Math.min(wall.H, Math.max(0, wall.H - p.y))];
}

interface LayerProps {
  project: Project;
  wall: Wall;
  comp: WallComp;
  start: number;
  preview: boolean;
  color: string;
  selected: number | null;
  onSelect: (i: number | null) => void;
}

function TintLayer({ project, wall, comp, start, preview, color, selected, onSelect }: LayerProps) {
  const drag = useRef<number | null>(null);
  const { W, H } = wall;
  const g = comp.g;
  const fs = Math.max(W, H) / 75;
  const fills = useMemo(
    () => (preview ? comp.tiles.map(t => tintColor(project, { gx: start + t.c[0], y: t.c[1] })) : []),
    [preview, comp, project, start],
  );
  const spots = (project.tints?.spots ?? []).map((s, i) => ({ s, i })).filter(({ s }) => s.wall === wall.id);
  const sy = (y: number) => H - y;
  // l'aperçu ne couvre que ce qui est carrelé, comme le plan en dessous
  const clip = [comp.allowed, comp.base].map(mp => mp.map(poly => poly.map(ring => 'M' + ring.map(q => `${fmt(q[0])} ${fmt(sy(q[1]))}`).join('L') + 'Z').join('')).join(''));
  const clipId = `tint-${wall.id}`;
  return (
    <svg className="tint-layer" viewBox={`0 0 ${fmt(W)} ${fmt(H)}`} preserveAspectRatio="xMidYMid meet" data-testid={`tints-${wall.id}`}
      onPointerDown={e => {
        if (e.target !== e.currentTarget && !(e.target as Element).hasAttribute('data-tile')) return;
        const p = wallPoint(e, wall);
        if (!p) return;
        // un nouveau repère n'est pas choisi : la couleur suivante sert au prochain repère
        addTint(wall.id, p[0], p[1], color);
        onSelect(null);
      }}>
      <defs>
        <clipPath id={`${clipId}-al`}><path clipRule="evenodd" d={clip[0]} /></clipPath>
        <clipPath id={`${clipId}-ab`}><path clipRule="evenodd" d={clip[1]} /></clipPath>
      </defs>
      {fills.map((f, k) => {
        const t = comp.tiles[k]!;
        return f && (
          <polygon key={t.key} data-tile="" points={g.verts(t.c[0], t.c[1]).map(q => `${fmt(q[0])},${fmt(sy(q[1]))}`).join(' ')} fill={f} opacity=".6"
            clipPath={`url(#${clipId}-${t.forced ? 'ab' : 'al'})`} />
        );
      })}
      {spots.map(({ s, i }) => (
        <g key={i} className="tint-spot" data-spot={i} aria-label={`Repère ${s.color}`}
          onPointerDown={e => { e.stopPropagation(); onSelect(i); drag.current = i; e.currentTarget.setPointerCapture?.(e.pointerId); }}
          onPointerMove={e => {
            if (drag.current !== i) return;
            const p = wallPoint(e, wall);
            if (p) moveTint(i, wall.id, p[0], p[1]);
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}>
          <circle cx={fmt(s.x)} cy={fmt(sy(s.y))} r={fmt(fs * 2)} fill={s.color} stroke="#fff" strokeWidth={fmt(fs * (i === selected ? 0.7 : 0.4))} />
          <circle cx={fmt(s.x)} cy={fmt(sy(s.y))} r={fmt(fs * 2.4)} fill="none" stroke={i === selected ? '#e0218a' : '#111'} strokeWidth={fmt(fs * (i === selected ? 0.5 : 0.2))} />
        </g>
      ))}
    </svg>
  );
}

export function TintView() {
  const project = useStore(s => s.project);
  const comps = useStore(s => s.comps);
  const images = useStore(s => s.images);
  const colors = useMemo(() => swatches(project), [project]);
  const [picked, setPicked] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState(true);
  const spots = project.tints?.spots ?? [];
  const color = picked ?? colors[0]?.color ?? '#808080';
  const current = selected !== null ? spots[selected] : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selected === null || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? '')) return;
      if (e.key === 'Escape') setSelected(null);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        removeTint(selected);
        setSelected(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected]);

  const places = unfold(project.walls);
  const starts = wallStarts(project.walls);
  const runs = [...new Set(places.map(p => p.run))].map(run => project.walls.flatMap((w, i) => (places[i]!.run === run ? [{ w, i }] : [])));
  const widest = Math.max(1, ...runs.map(r => r.reduce((s, { w }) => s + w.W, 0)));
  const balance = tintBalance(project, comps);
  const sharpness = project.tints?.sharpness ?? 0.3;

  return (
    <div className="tint-view">
      <div className="overview-tools">
        <div>
          <span className="tint-label">{current ? 'Couleur du repère choisi' : 'Couleur des nouveaux repères'}</span>
          <div className="palette tint-palette">
            {colors.map(s => (
              <button key={s.color} className={(current ? current.color === s.color : color === s.color) ? 'on' : ''} title={s.label} aria-label={`Teinte ${s.label}`}
                onClick={() => {
                  setPicked(s.color);
                  if (selected !== null) recolorTint(selected, s.color);
                }}>
                <span className="tint-chip" style={{ background: s.color }} />
              </button>
            ))}
          </div>
        </div>
        <label>Transition
          <span className="tint-range">douce
            <input type="range" min="0" max="1" step="0.05" value={sharpness} aria-label="Transition entre les teintes"
              onChange={e => setTintSharpness(Number(e.target.value))} />
            franche</span>
        </label>
        <label className="inline"><input type="checkbox" checked={preview} onChange={e => setPreview(e.target.checked)} /> Voir la teinte visée</label>
        {current && <button onClick={() => { removeTint(selected!); setSelected(null); }}>Supprimer le repère</button>}
        {spots.length > 0 && <button onClick={() => { if (window.confirm('Effacer tous les repères de teinte ?')) { clearTints(); setSelected(null); } }}>Tout effacer</button>}
        <button className="primary" disabled={!spots.length} onClick={() => setUi({ harmonyOpen: true, harmonyStyle: 'tints' })}>Harmoniser avec ces teintes</button>
      </div>
      <p className="hint">
        Clique sur un pan pour poser un repère de la couleur choisie. Clique sur un repère pour le choisir : tu peux alors
        changer sa couleur, le faire glisser, ou l'enlever avec Suppr.
        Les motifs qui ont cette couleur y seront attirés, et les teintes se fondent d'un repère à l'autre, d'un pan à l'autre.
        Harmoniser et Mélanger les suivent une fois le style « Mes teintes » choisi.
      </p>
      {balance.length > 0 && (
        <ul className="tint-balance" aria-label="Part demandée et part disponible de chaque teinte">
          {balance.map(b => {
            const short = b.wanted > b.available * 1.15 + 0.02;
            return (
              <li key={b.color} className={short ? 'short' : ''}>
                <span className="tint-chip" style={{ background: b.color }} />
                {Math.round(b.wanted * 100)} % demandés, {Math.round(b.available * 100)} % disponibles
                {short && ' : pas assez de carreaux de cette teinte, elle débordera sur les autres'}
              </li>
            );
          })}
        </ul>
      )}
      <div className="overview-plan">
        {runs.map((run, k) => {
          const width = run.reduce((s, { w }) => s + w.W, 0);
          const low = Math.min(...run.map(({ i }) => places[i]!.y0));
          return (
            <div key={k} className="overview-run" style={{ width: `${(100 * width) / widest}%` }}>
              {run.map(({ w, i }, j) => (
                <figure key={w.id} className={j > 0 ? 'overview-wall joined' : 'overview-wall'}
                  style={{ width: `${(100 * w.W) / width}%`, marginBottom: `${(100 * (places[i]!.y0 - low)) / width}%` }}>
                  <div className="tint-wall">
                    <WallSvg project={project} wall={w} comp={comps[i]!} images={images} mode="print" uid={`t${i}`} bare />
                    <TintLayer project={project} wall={w} comp={comps[i]!} start={starts[i]!} preview={preview} color={color} selected={selected} onSelect={setSelected} />
                  </div>
                  <figcaption>{w.name || `Pan ${i + 1}`} · {cm(w.W)} × {cm(w.H)} cm</figcaption>
                </figure>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
