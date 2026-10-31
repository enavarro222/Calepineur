// Vignette d'une coupe : vue de face, carreau dans son orientation posée, cotes de chaque côté de la pièce.
import type { ReactNode } from 'react';
import type { PlacedTile, WallComp } from '../core/compute';
import { cm, fmt } from '../core/format';
import { distToSeg, ringCentroid } from '../core/geom';
import type { ImageStore } from '../core/project';
import type { Point, Project, Wall } from '../core/types';
import { DesignDefs, designHref, tileAngle } from './WallSvg';

interface CutCardProps {
  project: Project;
  wall: Wall;
  comp: WallComp;
  tile: PlacedTile;
  images: ImageStore;
  uid: string;
}

export function CutCard({ project, wall, comp, tile: t, images, uid }: CutCardProps) {
  const g = comp.g;
  const a = wall.tiles[t.key];
  const box = g.R * 1.32;
  const tx = (p: Point) => p[0] - t.c[0];
  const ty = (p: Point) => -(p[1] - t.c[1]);
  const hexV = g.verts(t.c[0], t.c[1]);
  const onHexEdge = (p: Point, q: Point) => hexV.some((A, i) => {
    const B = hexV[(i + 1) % 6]!;
    return distToSeg(p, A, B) < 0.03 && distToSeg(q, A, B) < 0.03;
  });
  const fs = g.F * 0.085;
  const href = designHref(project.designs, uid, a?.d);
  const d = t.piece.map(poly => poly.map(ring => 'M' + ring.map(p => `${fmt(tx(p))} ${fmt(ty(p))}`).join('L') + 'Z').join('')).join('');

  const edges: ReactNode[] = [];
  t.piece.forEach((poly, pi) => poly.forEach((ring, ri) => {
    const ctr = ringCentroid(ring);
    for (let i = 0; i < ring.length - 1; i++) {
      const p = ring[i]!;
      const q = ring[i + 1]!;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 0.05) continue;
      const cut = !onHexEdge(p, q);
      const key = `${pi}-${ri}-${i}`;
      edges.push(
        <line key={key} x1={fmt(tx(p))} y1={fmt(ty(p))} x2={fmt(tx(q))} y2={fmt(ty(q))}
          stroke={cut ? '#c62828' : '#1b1b1b'} strokeWidth={fmt(fs * (cut ? .3 : .16))} strokeLinecap="round" />,
      );
      if (len < 0.4) continue;
      // cote placée vers l'intérieur de la pièce
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      let nx = -(q[1] - p[1]) / len;
      let ny = (q[0] - p[0]) / len;
      if ((ctr[0] - mx) * nx + (ctr[1] - my) * ny < 0) { nx = -nx; ny = -ny; }
      const off = fs * 1.1;
      edges.push(
        <text key={`t${key}`} x={fmt(tx([mx + nx * off, 0]))} y={fmt(ty([0, my + ny * off]) + fs * .35)} fontSize={fmt(fs)} textAnchor="middle"
          fill={cut ? '#c62828' : '#333'} fontWeight={cut ? 700 : 400} paintOrder="stroke" stroke="#fff" strokeWidth={fmt(fs * .25)}>
          {cm(len)}
        </text>,
      );
    }
  }));

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${fmt(-box)} ${fmt(-box)} ${fmt(2 * box)} ${fmt(2 * box)}`}>
      <defs><DesignDefs designs={project.designs} g={g} uid={uid} images={images} /></defs>
      {href && <use href={href} opacity=".28" transform={`rotate(${fmt(-tileAngle(g, a))})`} />}
      <polygon points={hexV.map(p => `${fmt(tx(p))},${fmt(ty(p))}`).join(' ')} fill="none" stroke="#888" strokeWidth={fmt(fs * .12)}
        strokeDasharray={`${fmt(fs * .5)} ${fmt(fs * .3)}`} />
      <path d={d} fill="rgba(31,111,139,.22)" fillRule="evenodd" stroke="none" />
      {edges}
    </svg>
  );
}
