// Modèle d'un projet. Unités : cm, y vers le haut, origine au coin bas-gauche du pan.

export type Point = [number, number];
export type Ring = Point[];
export type MultiPolygon = Ring[][];
export type BBox = [number, number, number, number];

export type Orient = 'flat' | 'pointy';
export type RotMode = 'none' | '180' | '60';
export type ZoneMode = 'organic' | 'cut';
export type BrushState = 'add' | 'del';
export type HarmonyStyle = 'natural' | 'waves' | 'gradient';

export interface TileSpec {
  F: number; // largeur plat à plat
  joint: number;
  orient: Orient; // 'flat' = pointes sur les côtés, 'pointy' = pointes en haut
  grout: string;
  edgeGap: number; // retrait le long des bords durs (plan de travail, angle, fenêtre…)
  waste: number; // % de casse
  minPiece: number; // % sous lequel une coupe est signalée « petite »
  perBox: number;
  m2PerBox: number;
}

// Rectangle autour d'un carreau sur une photo de tous les motifs, en proportions de l'image.
export interface DesignCrop {
  u: number;
  v: number;
  w: number;
  h: number;
}

export interface Design {
  key: string;
  name: string;
  img: string; // 'img:<id>' (image stockée), 'data:…' (intégrée) ou '' (couleur seule)
  color: string; // teinte moyenne
  colors?: string[]; // couleurs principales, la dominante d'abord
  weight: number;
  crop?: DesignCrop; // découpe préparée, en attente de la photo
}

export interface Obstacle {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CalibPoint {
  wx: number;
  wy: number;
  px: number;
  py: number;
}

// Calage préparé avant de disposer de la photo : u et v vont de 0 à 1, depuis le coin haut-gauche de l'image.
export interface CalibHint {
  wx: number;
  wy: number;
  u: number;
  v: number;
}

export interface WallPhoto {
  src: string;
  opacity: number;
  blend: boolean;
  pts: CalibPoint[];
}

// Réglages d'un emplacement « q,r » : motif, rotation par 60°, verrou manuel, retouche au pinceau.
export interface TileOverride {
  d?: string | null;
  rot?: number;
  lk?: boolean;
  st?: BrushState;
}

export interface Wall {
  id: string;
  name: string;
  W: number;
  H: number;
  color: string;
  ox: number;
  oy: number;
  zoneMode: ZoneMode;
  zone: Point[];
  obstacles: Obstacle[];
  photo: WallPhoto | null;
  calib?: CalibHint[];
  joinPrev?: boolean; // bord gauche contre le bord droit du pan précédent (angle commun)
  tiles: Record<string, TileOverride>;
}

// Photo de toute la pièce : chaque pan y est calé sur ses propres repères, pour voir l'ensemble d'un coup d'œil.
export interface Overview {
  src: string;
  opacity: number;
  blend: boolean;
  walls: Record<string, CalibPoint[]>; // calage de chaque pan, par identifiant de pan
}

export interface Project {
  version: 1;
  name: string;
  tile: TileSpec;
  rotMode: RotMode;
  seed: number;
  style?: HarmonyStyle; // style de la dernière répartition harmonisée, que Mélanger conserve
  styleVariant?: number; // sens du dégradé
  designs: Design[];
  walls: Wall[];
  overview?: Overview;
}
