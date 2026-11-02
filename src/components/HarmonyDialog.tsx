// Note d'harmonie et choix entre plusieurs répartitions.
import { useEffect, useState } from 'react';
import { harmonyProposals, type DefectType, type HarmonyReport, type Proposal } from '../core/harmony';
import type { HarmonyStyle } from '../core/types';
import { chooseProposal } from '../store/actions';
import { useHarmony } from '../store/harmony';
import { getComps, getProject, setUi, useStore } from '../store/store';
import { SegRadio } from './fields';
import { DEFECT_COLORS, WallSvg } from './WallSvg';

const LABELS: Record<DefectType, [string, string]> = {
  adjacent: ['voisin identique', 'voisins identiques'],
  line: ['alignement', 'alignements'],
  pattern: ['répétition régulière', 'répétitions régulières'],
  clump: ['amas', 'amas'],
  tone: ['tache de teinte', 'taches de teinte'],
  clash: ['paire sans couleur commune', 'paires sans couleur commune'],
};

const STYLES: { value: HarmonyStyle; label: string; hint: string }[] = [
  { value: 'natural', label: 'Naturel', hint: 'Un mélange homogène, sans voisins identiques, alignements ni taches. Les échanges restent dans chaque pan.' },
  { value: 'waves', label: 'Vagues de couleur', hint: 'Les voisins partagent une couleur, et les teintes se regroupent en vagues irrégulières.' },
  { value: 'gradient', label: 'Dégradé', hint: 'Les motifs suivent la chaîne de leurs couleurs, du plus sombre au plus clair, d\'un bout à l\'autre. Chaque proposition prend un sens différent.' },
];

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
  const { project, report, assignment, style, variant, label } = proposal;
  return (
    <article className="proposal" data-testid="proposal">
      <h3>Proposition {index + 1} <small>{report.score}/100</small></h3>
      {label && <p className="proposal-label">{label}</p>}
      <div className="proposal-walls">
        {project.walls.map((w, i) => (
          <WallSvg key={w.id} project={project} wall={w} comp={comps[i]!} images={images} mode="print" uid={`h${index}w${i}`} bare />
        ))}
      </div>
      <p className="hint"><DefectList report={report} /></p>
      <button className="primary" onClick={() => chooseProposal(assignment, style, variant)}>Choisir</button>
    </article>
  );
}

export function HarmonyDialog() {
  const current = useHarmony();
  const [style, setStyle] = useState<HarmonyStyle>(() => getProject().style ?? 'natural');
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const close = () => setUi({ harmonyOpen: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setUi({ harmonyOpen: false }); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Laisse la fenêtre s'afficher avant le calcul.
  useEffect(() => {
    setProposals(null);
    const timer = setTimeout(() => setProposals(harmonyProposals(getProject(), getComps(), style)), 30);
    return () => clearTimeout(timer);
  }, [style]);

  const colorful = style !== 'natural';
  return (
    <div className="dialog-back app-chrome" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="harmony-title">
        <button className="icon dialog-close" aria-label="Fermer" onClick={close}>×</button>
        <h2 id="harmony-title">Harmoniser la répartition</h2>
        <SegRadio name="harmony-style" value={style} onChange={setStyle} options={STYLES} />
        <p className="hint">{STYLES.find(s => s.value === style)!.hint}</p>
        <p className="hint">
          Répartition actuelle : <b>{current.score}/100</b>, <DefectList report={current} />.
          {' '}Ces propositions échangent des carreaux {colorful ? 'entre les pans' : 'd\'un même pan'} : le total à commander ne change pas
          {colorful ? ' (la part de chaque pan, oui)' : ''}, et les carreaux peints ou échangés à la main restent en place.
          {colorful && ' Les couleurs de chaque motif se règlent dans Carreaux & motifs.'}
        </p>
        {!proposals && <p role="status">Recherche en cours…</p>}
        {proposals && (
          <>
            <div className="proposals">{proposals.map((p, i) => <ProposalCard key={`${style}${i}`} index={i} proposal={p} />)}</div>
            <p className="hint">La note aide à repérer les défauts, mais ton œil décide. Tu pourras revenir en arrière avec ↶, et corriger avec l'outil Échanger.</p>
          </>
        )}
      </div>
    </div>
  );
}
