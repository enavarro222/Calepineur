// Préparer un projet avec une IA de discussion : consigne à emporter, réponse à coller.
import { useEffect, useMemo, useState } from 'react';
import { aiTargets, buildPrompt, GUIDE_URL } from '../core/aiPrompt';
import { describeChanges, resolveConfig } from '../core/aiReply';
import { applyConfig, copyText } from '../store/actions';
import { getProject, setUi, showToast, useStore } from '../store/store';
import type { Project } from '../core/types';

const close = () => setUi({ aiOpen: false });

function ChangeList({ next }: { next: Project }) {
  const current = useStore(s => s.project);
  const changes = describeChanges(current, next);
  if (!changes.length) return <p className="hint">Aucun changement.</p>;
  return <ul>{changes.map(l => <li key={l}>{l}</li>)}</ul>;
}

export function ConfigReview({ next }: { next: Project }) {
  const dismiss = () => setUi({ pending: null });
  return (
    <div className="dialog-back app-chrome">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="config-title">
        <h2 id="config-title">Appliquer ce lien de configuration ?</h2>
        <p className="hint">Ce lien propose de modifier ton projet. Rien ne change tant que tu ne valides pas. N'accepte que si tu as demandé ces changements.</p>
        <div className="ai-summary">
          <h4>Changements</h4>
          <ChangeList next={next} />
        </div>
        <div className="btns">
          <button className="primary" onClick={() => void applyConfig(next)}>Appliquer</button>
          <button onClick={dismiss}>Ignorer</button>
        </div>
      </div>
    </div>
  );
}

function PasteReply() {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState<Project | null>(null);

  const check = () => {
    setParsed(null);
    try {
      setParsed(resolveConfig(getProject(), text));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <label>
        Réponse de ton IA
        <textarea rows={6} spellCheck={false} value={text} onChange={e => { setText(e.target.value); setParsed(null); setError(''); }} />
      </label>
      {error && <p className="warn" role="alert">{error}</p>}
      {!parsed && <button disabled={!text.trim()} onClick={check}>Vérifier</button>}
      {parsed && (
        <div className="ai-summary">
          <h4>À appliquer</h4>
          <ChangeList next={parsed} />
          <p className="hint">Tu pourras revenir en arrière avec ↶.</p>
          <button className="primary" onClick={() => void applyConfig(parsed)}>Appliquer</button>
        </div>
      )}
    </>
  );
}

export function AiDialog() {
  const project = useStore(s => s.project);
  const isDemo = project.walls.every(w => w.id.startsWith('demo-'));
  const [fromCurrent, setFromCurrent] = useState(!isDemo);
  const prompt = useMemo(() => buildPrompt(fromCurrent ? project : null), [fromCurrent, project]);
  const targets = useMemo(() => aiTargets(buildPrompt(fromCurrent ? project : null, true)), [fromCurrent, project]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const copy = async () => {
    if (await copyText(prompt)) showToast('Consigne copiée.');
  };

  const copyGuide = async () => {
    if (await copyText(GUIDE_URL)) showToast('Lien copié.');
  };

  return (
    <div className="dialog-back app-chrome" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="ai-title">
        <button className="icon dialog-close" aria-label="Fermer" onClick={close}>×</button>
        <h2 id="ai-title">Préparer avec une IA</h2>
        <p className="hint">Ton IA lit tes photos et ta référence de carreaux, puis prépare les murs, les éléments et la zone. Ses cotes restent des estimations à vérifier au mètre.</p>

        <h3>1. Ouvre ton IA</h3>
        <div className="btns">
          {targets.map(t => (
            <a key={t.name} className="btn" href={t.url} target="_blank" rel="noopener noreferrer" onClick={() => void copyText(prompt)}>{t.name}</a>
          ))}
          <button onClick={() => void copy()}>Copier la consigne</button>
        </div>
        <label>
          Ou donne ce lien à ton IA, si elle a accès au web
          <span className="guide-link">
            <input readOnly value={GUIDE_URL} aria-label="Lien pour ton IA" onFocus={e => e.target.select()} />
            <button onClick={() => void copyGuide()}>Copier le lien</button>
          </span>
        </label>
        <p className="hint">Chaque bouton copie aussi la consigne. Si elle n'apparaît pas toute seule dans ton IA, colle-la. Pour une autre IA, utilise <b>Copier la consigne</b>.</p>
        <label className="inline">
          <input type="checkbox" checked={fromCurrent} onChange={e => setFromCurrent(e.target.checked)} /> Partir de mon projet actuel (dimensions et noms, sans les images)
        </label>
        <details>
          <summary>Voir la consigne</summary>
          <textarea aria-label="Consigne" rows={8} readOnly value={prompt} />
        </details>

        <h3>2. Ajoute tes photos dans la discussion</h3>
        <p className="hint">Joins une photo de chaque mur, sans la recadrer, et la référence des carreaux. Aucun lien ne peut le faire à ta place. Tes images restent entre toi et ton IA : Calepineur ne les envoie pas.</p>

        <h3>3. Colle sa réponse ici</h3>
        <p className="hint">Elle peut contenir un projet complet ou une simple correction. Si ton IA te donne un lien, clique dessus : Calepineur te montrera les changements. Ton IA ne peut pas renvoyer les photos, mais elle peut préparer leur calage : il s'appliquera quand tu les choisiras.</p>
        <PasteReply />
      </div>
    </div>
  );
}
