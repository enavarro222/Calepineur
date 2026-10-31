import { imageUrl } from '../core/project';
import type { Design } from '../core/types';
import { useStore } from '../store/store';

export function HexSwatch({ design, big }: { design: Design; big?: boolean }) {
  const src = useStore(s => imageUrl(design.img, s.images));
  return (
    <span
      className={big ? 'hexsw big' : 'hexsw'}
      style={{ backgroundColor: design.color || '#999', backgroundImage: src ? `url("${src}")` : undefined }}
    />
  );
}
