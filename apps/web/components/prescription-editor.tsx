'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { PlanVersion, PrescribedExercise } from '../lib/plans';

export function PrescriptionEditor({ entry, version, onChanged, onError }: { entry: PrescribedExercise; version: PlanVersion; onChanged: (value: PlanVersion) => void; onError: (message: string) => void }) {
  const [targetSets, setSets] = useState(entry.targetSets);
  const [repsMin, setRepsMin] = useState(entry.targetRepsMin); const [repsMax, setRepsMax] = useState(entry.targetRepsMax);
  const [mode, setMode] = useState(entry.intensityMode);
  const [target, setTarget] = useState(entry.targetRir ?? (entry.targetRpe ? Number(entry.targetRpe) : 2));
  const [restSeconds, setRest] = useState(entry.restSeconds);
  const [suggested, setSuggested] = useState(entry.suggestedLoadKg ?? '');
  const [notes, setNotes] = useState(entry.trainerNotes ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSets(entry.targetSets); setRepsMin(entry.targetRepsMin); setRepsMax(entry.targetRepsMax); setMode(entry.intensityMode); setTarget(entry.targetRir ?? (entry.targetRpe ? Number(entry.targetRpe) : 2)); setRest(entry.restSeconds); setSuggested(entry.suggestedLoadKg ?? ''); setNotes(entry.trainerNotes ?? ''); }, [entry]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); onError('');
    try {
      const updated = await api<PlanVersion>(`/programmed-exercises/${entry.id}`, { method: 'PATCH', body: JSON.stringify({ revision: version.revision, targetSets, targetRepsMin: repsMin, targetRepsMax: repsMax, intensityMode: mode, targetRir: mode === 'RIR' ? target : null, targetRpe: mode === 'RPE' ? target : null, restSeconds, suggestedLoadKg: suggested || null, trainerNotes: notes || null }) });
      onChanged(updated);
    } catch (error) { onError(String(error)); }
    finally { setBusy(false); }
  }
  return <form className="form prescription-fields" onSubmit={save}>
    <div className="grid three"><label>{t('plans.sets')}<input type="number" min={1} max={15} required value={targetSets} onChange={(event) => setSets(Number(event.target.value))}/></label><label>{t('plans.repsMin')}<input type="number" min={1} max={50} required value={repsMin} onChange={(event) => setRepsMin(Number(event.target.value))}/></label><label>{t('plans.repsMax')}<input type="number" min={1} max={50} required value={repsMax} onChange={(event) => setRepsMax(Number(event.target.value))}/></label></div>
    <div className="grid three"><label>{t('plans.intensity')}<select value={mode} onChange={(event) => setMode(event.target.value as 'NONE' | 'RIR' | 'RPE')}><option value="NONE">{t('plans.none')}</option><option value="RIR">RIR</option><option value="RPE">RPE</option></select></label>{mode !== 'NONE' && <label>{mode === 'RIR' ? t('plans.rir') : t('plans.rpe')}<input type="number" min={mode === 'RIR' ? 0 : 1} max={10} step={mode === 'RIR' ? 1 : 0.5} value={target} onChange={(event) => setTarget(Number(event.target.value))}/></label>}<label>{t('plans.rest')}<input type="number" min={0} max={600} value={restSeconds} onChange={(event) => setRest(Number(event.target.value))}/></label></div>
    <label>{t('plans.suggestedLoad')}<input inputMode="decimal" value={suggested} onChange={(event) => setSuggested(event.target.value)}/><span className="muted small">{t('plans.suggestedNotActual')}</span></label>
    <label>{t('plans.notes')}<textarea maxLength={1500} value={notes} onChange={(event) => setNotes(event.target.value)} rows={2}/></label>
    <button className="button secondary" disabled={busy}>{busy ? t('common.saving') : t('plans.savePrescription')}</button>
  </form>;
}
