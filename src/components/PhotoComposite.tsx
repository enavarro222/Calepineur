// Une photo et les carreaux de un ou plusieurs pans projetés dessus, chacun selon son calage.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { WallComp } from '../core/compute';
import { calibMatrix, PHOTO_K } from '../core/photo';
import type { ImageStore } from '../core/project';
import type { CalibPoint, Project, Wall } from '../core/types';
import { WallSvg } from './WallSvg';

export interface PhotoLayer {
  wall: Wall;
  comp: WallComp;
  pts: CalibPoint[] | undefined;
  uid: string;
  outlines?: boolean;
}

export interface PhotoScale {
  s: number; // px affichés par px de l'image
  nw: number;
  nh: number;
}

interface Props {
  project: Project;
  images: ImageStore;
  src: string;
  alt: string;
  layers: PhotoLayer[];
  opacity: number;
  blend: boolean;
  className?: string;
  overlay?: (scale: PhotoScale) => ReactNode; // dessiné en pixels de l'image
  onScale?: (scale: PhotoScale) => void;
}

export function PhotoComposite({ project, images, src, alt, layers, opacity, blend, className, overlay, onScale }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState<PhotoScale | null>(null);
  const measure = useCallback(() => {
    const img = imgRef.current;
    if (!img?.naturalWidth) return;
    const next = { s: img.clientWidth / img.naturalWidth, nw: img.naturalWidth, nh: img.naturalHeight };
    setScale(next);
    onScale?.(next);
  }, [onScale]);
  useEffect(() => {
    const img = imgRef.current;
    if (!img || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(img);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div className={`photo-wrap composite ${className ?? ''}`}>
      <img ref={imgRef} className="ph-img" alt={alt} draggable={false} src={src} onLoad={measure} />
      {scale && layers.map(l => {
        const matrix = calibMatrix(l.pts, l.wall.H, scale.s);
        if (!matrix) return null;
        return (
          <div key={l.uid} className="ph-tiles" data-testid="photo-layer" style={{ transform: matrix, opacity: l.outlines ? 0.75 : opacity, mixBlendMode: blend && !l.outlines ? 'multiply' : 'normal' }}>
            <WallSvg project={project} wall={l.wall} comp={l.comp} images={images} mode="photo" uid={l.uid} k={PHOTO_K} outlines={l.outlines} />
          </div>
        );
      })}
      {scale && overlay && <svg className="ph-over" viewBox={`0 0 ${scale.nw} ${scale.nh}`}>{overlay(scale)}</svg>}
    </div>
  );
}
