// Réduit une image choisie par l'utilisateur pour tenir dans le stockage du navigateur.
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
