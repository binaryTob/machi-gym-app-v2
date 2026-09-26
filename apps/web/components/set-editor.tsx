'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { SetState, WorkoutSet } from '../lib/workouts';

type Saved = { set: WorkoutSet; progress: { totalSets: number; completedSets: number; totalExercises: number; completedExercises: number } };
type Pending = { version: number; weight: string; reps: string; effort: string };
export function SetEditor({ sessionId, set, mode, intensityMode, onSaved, onSavingChange }: { sessionId: string; set: WorkoutSet; mode: 'WEIGHT_REPS' | 'REPS_ONLY'; intensityMode: 'NONE' | 'RIR' | 'RPE'; onSaved: (value: Saved, justCompleted: boolean) => void; onSavingChange?: (setId: string, saving: boolean) => void }) {
  const [weight, setWeight] = useState(set.actualLoadKg ?? '');
  const [reps, setReps] = useState(set.actualRepetitions === null ? '' : String(set.actualRepetitions));
  const [effort, setEffort] = useState(set.rir === null && set.rpe === null ? '' : String(set.rir ?? set.rpe));
  const [pending, setPending] = useState(false); const [saved, setSaved] = useState(false);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const key = `machi-pending-${sessionId}-${set.id}`;
  useEffect(() => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try { const draft = JSON.parse(raw) as Pending; setWeight(draft.weight); setReps(draft.reps); setEffort(draft.effort); setPending(true); } catch { localStorage.removeItem(key); }
  }, [key]);
  function change(values: Partial<Pending>) {
    const next: Pending = { version: set.version, weight, reps, effort, ...values };
    setWeight(next.weight); setReps(next.reps); setEffort(next.effort); setPending(true); setSaved(false);
    localStorage.setItem(key, JSON.stringify(next));
  }
  async function save(completionState: SetState) {
    if (completionState === 'COMPLETED' && (!reps || (mode === 'WEIGHT_REPS' && !weight))) { setError(t('workout.requiredActual')); return; }
    setBusy(true); onSavingChange?.(set.id, true); setError('');
    try {
      const value = await api<Saved>(`/workout-sessions/${sessionId}/sets/${set.id}`, { method: 'PUT', body: JSON.stringify({ version: set.version, completionState, actualLoadKg: mode === 'WEIGHT_REPS' && weight ? weight : null, actualRepetitions: reps ? Number(reps) : null, rir: intensityMode === 'RIR' && effort ? Number(effort) : null, rpe: intensityMode === 'RPE' && effort ? Number(effort) : null }) });
      localStorage.removeItem(key); setPending(false); setSaved(true);
      onSaved(value, set.completionState !== 'COMPLETED' && completionState === 'COMPLETED');
    } catch (failure) { setError(String(failure)); setSaved(false); }
    finally { setBusy(false); onSavingChange?.(set.id, false); }
  }
  return <div className={`set-entry ${set.completionState === 'COMPLETED' ? 'completed' : ''}`}>
    <div className="row"><strong>{t('workout.set', { number: set.setNumber })}</strong><span className="badge">{set.completionState === 'COMPLETED' ? t('enum.COMPLETED') : t('enum.NOT_STARTED')}</span></div>
    <div className="set-inputs">{mode === 'WEIGHT_REPS' && <label>{t('workout.weight')}<input type="number" inputMode="decimal" min="0" max="9999" step="0.01" value={weight} onChange={(event) => change({ weight: event.target.value })}/></label>}<label>{t('workout.repetitions')}<input type="number" inputMode="numeric" min="1" max="1000" value={reps} onChange={(event) => change({ reps: event.target.value })}/></label>{intensityMode !== 'NONE' && <label>{intensityMode === 'RIR' ? t('workout.actualRir') : t('workout.actualRpe')}<input type="number" inputMode="decimal" min={intensityMode === 'RIR' ? 0 : 1} max="10" step={intensityMode === 'RIR' ? 1 : 0.5} value={effort} onChange={(event) => change({ effort: event.target.value })}/></label>}</div>
    {pending && <p className="muted small" role="status">{t('workout.pendingDraft')}</p>}{saved && !pending && <p className="success small" role="status">{t('workout.saved')}</p>}{error && <p className="error small" role="alert">{error} {t('workout.notSaved')}</p>}
    <div className="row wrap set-actions">{set.completionState === 'COMPLETED' ? <><button disabled={busy} className="button" onClick={() => void save('COMPLETED')}>{busy ? t('common.saving') : t('workout.saveEdit')}</button><button disabled={busy} className="button secondary" onClick={() => void save('NOT_STARTED')}>{t('workout.undoCompletion')}</button></> : <><button disabled={busy} className="button" onClick={() => void save('COMPLETED')}>{busy ? t('common.saving') : t('workout.completeSet')}</button><button disabled={busy} className="button secondary" onClick={() => void save('NOT_STARTED')}>{t('workout.saveDraft')}</button></>}</div>
  </div>;
}
