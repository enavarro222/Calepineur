// Réduit une image choisie par l'utilisateur pour tenir dans le stockage du navigateur.
import { extractPalette } from '../core/palette';
import type { DesignCrop } from '../core/types';

export interface ReadImage {
  url: string;
  w: number;
  h: number;
}

export function readImageFile(file: File, maxSide: number): Promise<ReadImage> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('lecture impossible'));
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => reject(new Error('image illisible'));
      im.onload = () => {
        const k = Math.min(1, maxSide / Math.max(im.width, im.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.width * k);
        cv.height = Math.round(im.height * k);
        cv.getContext('2d')!.drawImage(im, 0, 0, cv.width, cv.height);
        resolve({ url: cv.toDataURL('image/jpeg', 0.86), w: cv.width, h: cv.height });
      };
      im.src = fr.result as string;
    };
    fr.readAsDataURL(file);
  });
}

export function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onerror = () => reject(new Error('image illisible'));
    im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
    im.src = url;
  });
}

export function cropImage(url: string, crop: DesignCrop, maxSide: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onerror = () => reject(new Error('image illisible'));
    im.onload = () => {
      const sw = crop.w * im.naturalWidth;
      const sh = crop.h * im.naturalHeight;
      const k = Math.min(1, maxSide / Math.max(sw, sh));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(sw * k));
      cv.height = Math.max(1, Math.round(sh * k));
      cv.getContext('2d')!.drawImage(im, crop.u * im.naturalWidth, crop.v * im.naturalHeight, sw, sh, 0, 0, cv.width, cv.height);
      resolve(cv.toDataURL('image/jpeg', 0.9));
    };
    im.src = url;
  });
}

// Couleur moyenne d'une image : sert de teinte du motif pour l'équilibre clair/sombre.
export function averageColor(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onerror = () => reject(new Error('image illisible'));
    im.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = 16;
      cv.height = 16;
      const g = cv.getContext('2d')!;
      g.drawImage(im, 0, 0, 16, 16);
      const px = g.getImageData(0, 0, 16, 16).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < px.length; i += 4) for (let k = 0; k < 3; k++) sum[k]! += px[i + k]!;
      resolve('#' + sum.map(v => Math.round(v / (px.length / 4)).toString(16).padStart(2, '0')).join(''));
    };
    im.src = url;
  });
}

// Couleurs principales d'un motif, lues au centre de l'image : les coins montrent souvent les carreaux voisins.
export function dominantColors(url: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onerror = () => reject(new Error('image illisible'));
    im.onload = () => {
      const n = 48;
      const cv = document.createElement('canvas');
      cv.width = n;
      cv.height = n;
      const g = cv.getContext('2d')!;
      g.drawImage(im, 0, 0, n, n);
      const px = g.getImageData(0, 0, n, n).data;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) > n * 0.42) px[(y * n + x) * 4 + 3] = 0;
        }
      }
      resolve(extractPalette(px));
    };
    im.src = url;
  });
}
