// Plan d'un pan en SVG : même dessin pour l'écran, le calque photo et l'impression.
import { memo, type ReactNode } from 'react';
import type { PlacedTile, WallComp } from '../core/compute';
import { cm, fmt } from '../core/format';
import { mpCentroid } from '../core/geom';
import type { Defect, DefectType } from '../core/harmony';
import type { Lattice } from '../core/lattice';
import { imageUrl, type ImageStore } from '../core/project';
import type { Design, MultiPolygon, Point, Project, TileOverride, Wall } from '../core/types';
import type { Tool } from '../store/store';

export function DesignDefs({ designs, g, uid, images }: { designs: Design[]; g: Lattice; uid: string; images: ImageStore }) {
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = i * Math.PI / 3;
    return `${fmt(g.R * Math.cos(a))},${fmt(g.R * Math.sin(a))}`;
  }).join(' ');
  return (
    <>
      <clipPath id={`${uid}hx`}><polygon points={hex} /></clipPath>
      {designs.map((d, k) => {
        const href = imageUrl(d.img, images);
        return (
          <g id={`${uid}d${k}`} key={k}>
            <polygon points={hex} fill={d.color || '#999'} />
            {href && (
              <image href={href} x={fmt(-g.R)} y={fmt(-g.F / 2)} width={fmt(2 * g.R)} height={fmt(g.F)}
                preserveAspectRatio="none" clipPath={`url(#${uid}hx)`} />
            )}
          </g>
        );
      })}
    </>
  );
}

// Les identifiants SVG utilisent l'indice du motif : une clé peut contenir n'importe quel caractère.
export const designHref = (designs: Design[], uid: string, key: string | null | undefined): string | undefined => {
  const k = designs.findIndex(d => d.key === key);
  return k >= 0 ? `#${uid}d${k}` : undefined;
};

export const tileAngle = (g: Lattice, a: TileOverride | undefined): number => g.base + 60 * (a?.rot ?? 0);

export interface WallSvgProps {
  project: Project;
  wall: Wall;
  comp: WallComp;
  images: ImageStore;
  mode: 'plan' | 'photo' | 'print';
  uid: string;
  labels?: boolean;
  cuts?: boolean;
  tool?: Tool;
  outlines?: boolean;
  k?: number;
  bare?: boolean; // sans règles ni marges, pour les miniatures
  defects?: Defect[];
  selected?: string | null;
}

export const DEFECT_COLORS: Record<DefectType, string> = { adjacent: '#d6202e', line: '#ef7d00', clump: '#8a2be2', tone: '#111111' };

function DefectMarks({ comp, defects, sy, r, sw, fs }: { comp: WallComp; defects: Defect[]; sy: (y: number) => number; r: number; sw: number; fs: number }) {
  const center = (key: string): string => {
    const c = comp.byKey.get(key)!.c;
    return `${fmt(c[0])},${fmt(sy(c[1]))}`;
  };
  const known = defects.filter(d => d.keys.every(k => comp.byKey.has(k)));
  return (
    <g data-testid="defects" pointerEvents="none" fill="none">
      {known.map((d, i) => {
        const stroke = DEFECT_COLORS[d.type];
        if (d.type === 'adjacent' || d.type === 'line') {
          return <polyline key={i} data-defect={d.type} points={d.keys.map(center).join(' ')} stroke={stroke} strokeWidth={fmt(sw * 5)} strokeLinecap="round" />;
        }
        return (
          <g key={i} data-defect={d.type} stroke={stroke} strokeWidth={fmt(sw * 3)} strokeDasharray={d.type === 'tone' ? `${fmt(fs * .5)} ${fmt(fs * .3)}` : undefined}>
            {d.keys.map(k => {
              const [x, y] = comp.byKey.get(k)!.c;
              return <polygon key={k} points={comp.g.verts(x, y, r).map(q => `${fmt(q[0])},${fmt(sy(q[1]))}`).join(' ')} />;
            })}
          </g>
        );
      })}
    </g>
  );
}

function Rulers({ W, H, fs, sw }: { W: number; H: number; fs: number; sw: number }) {
  const sy = (y: number) => H - y;
  const stepLbl = W > 250 ? 50 : 20;
  const stepLblY = H > 150 ? 50 : 20;
  const ticks: ReactNode[] = [];
  for (let x = 0; x <= W + 1e-6; x += 10) {
    const big = x % stepLbl === 0;
    ticks.push(<line key={`x${x}`} x1={fmt(x)} y1={fmt(H)} x2={fmt(x)} y2={fmt(H + fs * (big ? 1.2 : .6))} />);
    if (big) ticks.push(<text key={`tx${x}`} x={fmt(x)} y={fmt(H + fs * 2.6)} textAnchor="middle" stroke="none">{x}</text>);
  }
  for (let y = 0; y <= H + 1e-6; y += 10) {
    const big = y % stepLblY === 0;
    ticks.push(<line key={`y${y}`} x1="0" y1={fmt(sy(y))} x2={fmt(-fs * (big ? 1.2 : .6))} y2={fmt(sy(y))} />);
    if (big) ticks.push(<text key={`ty${y}`} x={fmt(-fs * 1.6)} y={fmt(sy(y) + fs * .35)} textAnchor="end" stroke="none">{y}</text>);
  }
  return (
    <g className="ruler" fontSize={fmt(fs * 1.05)} fill="#555" stroke="#777" strokeWidth={fmt(sw)}>
      <line x1="0" y1={fmt(H)} x2={fmt(W)} y2={fmt(H)} />
      <line x1="0" y1="0" x2="0" y2={fmt(H)} />
      {ticks}
      <text x={fmt(W)} y={fmt(H + fs * 3.8)} textAnchor="end" stroke="none" fontWeight="700">{cm(W)} cm</text>
    </g>
  );
}

const WallContent = memo(function WallContent(p: WallSvgProps) {
  const { project, wall, comp, images, mode, uid, labels, cuts, tool, outlines, bare, defects, selected } = p;
  const { W, H } = wall;
  const g = comp.g;
  const sy = (y: number) => H - y;
  const pts = (arr: Point[]) => arr.map(q => `${fmt(q[0])},${fmt(sy(q[1]))}`).join(' ');
  const mpPath = (mp: MultiPolygon) =>
    mp.map(poly => poly.map(ring => 'M' + ring.map(q => `${fmt(q[0])} ${fmt(sy(q[1]))}`).join('L') + 'Z').join('')).join('');
  const photo = mode === 'photo';
  const fs = Math.max(W, H) / 75;
  const sw = fs * 0.08;
  const anyForced = comp.tiles.some(t => t.forced);

  // joints + carreaux, découpés par la zone autorisée (ou par le mur seul pour les carreaux ajoutés au pinceau)
  const groutR = g.R * (g.F + g.j) / g.F;
  const layer = (list: PlacedTile[]) => (
    <>
      {list.map(t => <polygon key={t.key} points={pts(g.verts(t.c[0], t.c[1], groutR))} fill={project.tile.grout} />)}
      {list.map(t => {
        const a = wall.tiles[t.key];
        const href = designHref(project.designs, uid, a?.d);
        if (!href) return null;
        return <use key={`u${t.key}`} href={href} transform={`translate(${fmt(t.c[0])},${fmt(sy(t.c[1]))}) rotate(${fmt(-tileAngle(g, a))})`} />;
      })}
    </>
  );

  const freeSlots: ReactNode[] = [];
  if (tool === 'toggle') {
    const rg = g.range(W, H, comp.ox, comp.oy);
    for (let q = rg.q0; q <= rg.q1; q++) {
      for (let r = rg.r0; r <= rg.r1; r++) {
        if (comp.byKey.has(`${q},${r}`)) continue;
        const c = g.center(q, r, comp.ox, comp.oy);
        if (c[0] < 0 || c[0] > W || c[1] < 0 || c[1] > H) continue;
        freeSlots.push(<polygon key={`${q},${r}`} data-slot="" points={pts(g.verts(c[0], c[1], g.R * .92))} />);
      }
    }
  }

  return (
    <>
      <defs>
        <DesignDefs designs={project.designs} g={g} uid={uid} images={images} />
        <clipPath id={`${uid}al`}><path clipRule="evenodd" d={mpPath(comp.allowed)} /></clipPath>
        {anyForced && <clipPath id={`${uid}ab`}><path clipRule="evenodd" d={mpPath(comp.base)} /></clipPath>}
        <pattern id={`${uid}hatch`} width={fmt(fs * 0.6)} height={fmt(fs * 0.6)} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={fmt(fs * 0.25)} height={fmt(fs * 0.6)} fill="rgba(200,30,30,.55)" />
        </pattern>
      </defs>

      {!photo && <rect x="0" y="0" width={fmt(W)} height={fmt(H)} fill={wall.color || '#eee'} />}

      {tool === 'toggle' && (
        <g fill="none" stroke={photo ? 'rgba(15,70,90,.8)' : 'rgba(31,111,139,.45)'} strokeWidth={fmt(sw * (photo ? 2.2 : 1))}
          strokeDasharray={`${fmt(fs * .25)} ${fmt(fs * .2)}`}>
          {freeSlots}
        </g>
      )}

      <g clipPath={`url(#${uid}al)`}>{layer(comp.tiles.filter(t => !t.forced))}</g>
      {anyForced && <g clipPath={`url(#${uid}ab)`}>{layer(comp.tiles.filter(t => t.forced))}</g>}

      {(!photo || outlines) && wall.obstacles.map((ob, i) => {
        if (!(ob.w > 0 && ob.h > 0)) return null;
        const y = sy(ob.y + ob.h);
        const cx = Math.max(0, ob.x) + Math.min(ob.w, W - Math.max(0, ob.x)) / 2;
        const cy = Math.max(0, y) + Math.min(ob.h, H) / 2;
        return (
          <g key={i}>
            <rect className="obst" x={fmt(ob.x)} y={fmt(y)} width={fmt(ob.w)} height={fmt(ob.h)}
              fill={photo ? 'none' : 'rgba(70,72,80,.13)'} stroke="rgba(50,52,60,.6)" strokeWidth={fmt(photo ? sw * 2 : sw)}
              strokeDasharray={photo ? undefined : fmt(fs * .4)} />
            {!photo && (
              <text x={fmt(cx)} y={fmt(Math.min(cy, H - fs))} fontSize={fmt(fs * 1.1)} textAnchor="middle" fill="rgba(40,42,50,.65)">{ob.name}</text>
            )}
          </g>
        );
      })}

      {cuts && comp.tiles.filter(t => !t.full).map(t => (
        <g key={t.key}>
          {t.small && <path d={mpPath(t.piece)} fill={`url(#${uid}hatch)`} fillRule="evenodd" />}
          <path d={mpPath(t.piece)} fill="none" stroke={t.small ? '#c41d1d' : '#d0473a'} strokeWidth={fmt(sw * (t.small ? 2.2 : 1.3))}
            strokeDasharray={`${fmt(fs * .35)} ${fmt(fs * .2)}`} />
        </g>
      ))}

      {labels && comp.tiles.map(t => {
        const a = wall.tiles[t.key];
        const c = t.full ? t.c : mpCentroid(t.piece) ?? t.c;
        const small = !t.full && t.frac < 0.35;
        const f = g.F * 0.2 * (small ? 0.7 : 1);
        return (
          <g key={t.key} className="lbl" fontSize={fmt(f)} textAnchor="middle" fill="#fff" stroke="rgba(0,0,0,.8)" strokeWidth={fmt(f * .16)} paintOrder="stroke">
            <text x={fmt(c[0])} y={fmt(sy(c[1]) + (small ? f * .35 : -f * 0.05))} fontWeight="700">{t.label}</text>
            {!small && <text x={fmt(c[0])} y={fmt(sy(c[1]) + f * 1.05)} fontSize={fmt(f * .78)}>{a?.d ?? '?'}{a?.rot ? ` ↻${a.rot * 60}°` : ''}</text>}
          </g>
        );
      })}

      {comp.zone && (!photo || outlines || tool === 'zone') && (
        <polygon points={pts(comp.zone.slice(0, -1))} fill="none" stroke="#1f6f8b" strokeWidth={fmt(sw * (photo ? 3 : 1.6))}
          strokeDasharray={`${fmt(fs * .6)} ${fmt(fs * .3)}`} pointerEvents="none" />
      )}
      {photo && outlines && <rect x="0" y="0" width={fmt(W)} height={fmt(H)} fill="none" stroke="#ffcc00" strokeWidth={fmt(sw * 3)} />}

      {tool === 'zone' && comp.zone && (
        <>
          {wall.zone.map((q, i) => {
            const n = wall.zone[(i + 1) % wall.zone.length]!;
            return <circle key={i} cx={fmt((q[0] + n[0]) / 2)} cy={fmt(sy((q[1] + n[1]) / 2))} r={fmt(fs * .45)} fill="#fff" stroke="#1f6f8b" strokeWidth={fmt(sw)} opacity=".85" />;
          })}
          {wall.zone.map((q, i) => (
            <circle key={i} data-handle="zone" cx={fmt(q[0])} cy={fmt(sy(q[1]))} r={fmt(fs * .7)} fill="#1f6f8b" stroke="#fff" strokeWidth={fmt(sw * 1.5)} />
          ))}
        </>
      )}
      {tool === 'obst' && wall.obstacles.flatMap((ob, i) => (
        ([[ob.x, ob.y], [ob.x + ob.w, ob.y], [ob.x + ob.w, ob.y + ob.h], [ob.x, ob.y + ob.h]] as Point[]).map(([x, y], j) => (
          <rect key={`${i}-${j}`} x={fmt(x - fs * .5)} y={fmt(sy(y) - fs * .5)} width={fmt(fs)} height={fmt(fs)} fill="#fff" stroke="#333" strokeWidth={fmt(sw)} />
        ))
      ))}
      {tool === 'grid' && (
        <>
          <g stroke="#e0218a" strokeWidth={fmt(sw * 2)}>
            <line x1={fmt(comp.ox - fs * 1.2)} y1={fmt(sy(comp.oy))} x2={fmt(comp.ox + fs * 1.2)} y2={fmt(sy(comp.oy))} />
            <line x1={fmt(comp.ox)} y1={fmt(sy(comp.oy) - fs * 1.2)} x2={fmt(comp.ox)} y2={fmt(sy(comp.oy) + fs * 1.2)} />
          </g>
          <polygon points={pts(g.verts(comp.ox, comp.oy))} fill="none" stroke="#e0218a" strokeWidth={fmt(sw * 2)} />
        </>
      )}

      {defects && <DefectMarks comp={comp} defects={defects} sy={sy} r={g.R * .86} sw={sw} fs={fs} />}
      {selected && comp.byKey.has(selected) && (
        <polygon data-testid="swap-from" points={pts(comp.byKey.get(selected)!.v)} fill="rgba(224,33,138,.25)" stroke="#e0218a" strokeWidth={fmt(sw * 4)} pointerEvents="none" />
      )}

      {!photo && !bare && <Rulers W={W} H={H} fs={fs} sw={sw} />}
    </>
  );
});

export function WallSvg({ hoverPoints, ...p }: WallSvgProps & { hoverPoints?: string }) {
  const { W, H } = p.wall;
  const photo = p.mode === 'photo';
  const fs = Math.max(W, H) / 75;
  const m = photo || p.bare ? { l: 0, r: 0, t: 0, b: 0 } : { l: fs * 4.5, r: fs * 1.5, t: fs * 1.5, b: fs * 4 };
  const vb = [-m.l, -m.t, W + m.l + m.r, H + m.t + m.b].map(fmt).join(' ');
  const size = photo ? { width: fmt(W * (p.k ?? 1)), height: fmt(H * (p.k ?? 1)) } : {};
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="wall-svg" viewBox={vb} {...size} preserveAspectRatio="xMidYMid meet">
      <WallContent {...p} />
      {!photo && p.mode === 'plan' && (
        <polygon className="hover" points={hoverPoints ?? ''} fill="rgba(255,255,255,.25)" stroke="#111" strokeWidth={fmt(fs * 0.16)} pointerEvents="none" />
      )}
    </svg>
  );
}
