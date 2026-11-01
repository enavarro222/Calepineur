// Note d'harmonie et choix entre plusieurs répartitions.
import { useEffect, useState } from 'react';
import { harmonyProposals, type DefectType, type HarmonyReport, type Proposal } from '../core/harmony';
import { chooseProposal } from '../store/actions';
import { useHarmony } from '../store/harmony';
import { getComps, getProject, setUi, useStore } from '../store/store';
import { DEFECT_COLORS, WallSvg } from './WallSvg';

const LABELS: Record<DefectType, [string, string]> = {
  adjacent: ['voisin identique', 'voisins identiques'],
  line: ['alignement', 'alignements'],
  pattern: ['répétition régulière', 'répétitions régulières'],
  clump: ['amas', 'amas'],
  tone: ['tache de teinte', 'taches de teinte'],
};

function DefectList({ report }: { report: HarmonyReport }) {
  const present = (Object.keys(LABELS) as DefectType[]).filter(t => report.counts[t] > 0);
  if (!present.length) return <span>aucun défaut</span>;
  return (
    <>
      {present.map((t, i) => (
        <span key={t}>
          {i > 0 && ' · '}
          <span className="defect-dot" style={{ background: DEFECT_COLORS[t] }} />
          {report.counts[t]} {LABELS[t][report.counts[t] > 1 ? 1 : 0]}
        </span>
      ))}
    </>
  );
}

export function HarmonyCounts() {
  const report = useHarmony();
  return <span data-testid="harmony">Harmonie <b>{report.score}</b>/100 · <DefectList report={report} /></span>;
}

function ProposalCard({ index, proposal }: { index: number; proposal: Proposal }) {
  const comps = useStore(s => s.comps);
  const images = useStore(s => s.images);
  const { project, report, assignment } = proposal;
  return (
    <article className="proposal" data-testid="proposal">
      <h3>Proposition {index + 1} <small>{report.score}/100</small></h3>
      <div className="proposal-walls">
        {project.walls.map((w, i) => (
          <WallSvg key={w.id} project={project} wall={w} comp={comps[i]!} images={images} mode="print" uid={`h${index}w${i}`} bare />
        ))}
      </div>
      <p className="hint"><DefectList report={report} /></p>
      <button className="primary" onClick={() => chooseProposal(assignment)}>Choisir</button>
    </article>
  );
}

export function HarmonyDialog() {
  const current = useHarmony();
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const close = () => setUi({ harmonyOpen: false });

  // Laisse la fenêtre s'afficher avant le calcul.
  useEffect(() => {
    const timer = setTimeout(() => setProposals(harmonyProposals(getProject(), getComps())), 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setUi({ harmonyOpen: false }); };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="dialog-back app-chrome" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="harmony-title">
        <button className="icon dialog-close" aria-label="Fermer" onClick={close}>×</button>
        <h2 id="harmony-title">Harmoniser la répartition</h2>
        <p className="hint">
          Répartition actuelle : <b>{current.score}/100</b>, <DefectList report={current} />.
          {' '}Ces propositions échangent seulement des carreaux d'un même pan : les quantités ne changent pas, et les carreaux peints ou échangés à la main restent en place.
        </p>
        {!proposals && <p role="status">Recherche en cours…</p>}
        {proposals && (
          <>
            <div className="proposals">{proposals.map((p, i) => <ProposalCard key={i} index={i} proposal={p} />)}</div>
            <p className="hint">La note aide à repérer les défauts, mais ton œil décide. Tu pourras revenir en arrière avec ↶, et corriger avec l'outil Échanger.</p>
          </>
        )}
      </div>
    </div>
  );
}
