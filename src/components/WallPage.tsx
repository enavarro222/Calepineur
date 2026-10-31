import { useState } from 'react';
import { cm } from '../core/format';
import { useStore } from '../store/store';
import type { HoverInfo } from '../store/tools';
import { Stage } from './Stage';
import { Toolbar } from './Toolbar';
import { WallSidebar } from './WallSidebar';

function StatusBar({ i, hover }: { i: number; hover: HoverInfo | null }) {
  const st = useStore(s => s.comps[i]?.stats);
  if (!st) return null;
  return (
    <div id="status" className="status">
      <span className="hov">{hover?.label && <b>{hover.label}</b>}{hover?.text ?? ' '}</span>
      <span className="stats" data-testid="stats">
        <b>{st.n}</b> carreaux · {st.full} entiers · {st.cut} coupés
        {st.small > 0 && <> · <span className="warn">{st.small} petite{st.small > 1 ? 's' : ''} coupe{st.small > 1 ? 's' : ''}</span></>}
        {' '}· perte ≈ {cm(st.waste)} carreau{st.waste >= 2 ? 'x' : ''} · {cm(st.area / 1e4, 2)} m²
      </span>
    </div>
  );
}

export function WallPage({ i }: { i: number }) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  return (
    <>
      <WallSidebar i={i} />
      <section className="work">
        <Toolbar i={i} />
        <Stage i={i} onHover={setHover} />
        <StatusBar i={i} hover={hover} />
      </section>
    </>
  );
}
