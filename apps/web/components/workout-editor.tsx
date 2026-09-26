'use client';

import { FormEvent, useEffect, useState } from 'react';
import { equipmentSchema, muscleGroupSchema } from '@machi-gym/contracts';
import { api } from '../lib/api';
import { CatalogPage } from '../lib/catalog';
import { equipmentText, muscleText, t } from '../lib/i18n';
import { PlanVersion, PlannedWorkout } from '../lib/plans';
import { PrescriptionEditor } from './prescription-editor';

export function WorkoutEditor({ workout, version, position, total, onChanged, onError }: { workout: PlannedWorkout; version: PlanVersion; position: number; total: number; onChanged: (value: PlanVersion) => void; onError: (message: string) => void }) {
  const [editing, setEditing] = useState(false); const [picker, setPicker] = useState(false);
  const [name, setName] = useState(workout.name); const [dayLabel, setDayLabel] = useState(workout.dayLabel ?? '');
  const [duration, setDuration] = useState(String(workout.expectedDurationMinutes ?? '')); const [notes, setNotes] = useState(workout.trainerNotes ?? '');
  const [q, setQ] = useState(''); const [muscle, setMuscle] = useState(''); const [equipment, setEquipment] = useState('');
  const [results, setResults] = useState<CatalogPage['items']>([]);
  useEffect(() => { setName(workout.name); setDayLabel(workout.dayLabel ?? ''); setDuration(String(workout.expectedDurationMinutes ?? '')); setNotes(workout.trainerNotes ?? ''); }, [workout]);
  useEffect(() => {
    if (!picker) return;
    const controller = new AbortController(); const timer = setTimeout(() => {
      const params = new URLSearchParams({ active: 'true', ...(q ? { q } : {}), ...(muscle ? { muscle } : {}), ...(equipment ? { equipment } : {}) });
      void api<CatalogPage>(`/exercises?${params.toString()}`, { signal: controller.signal }).then((value) => setResults(value.items)).catch((error: unknown) => { if (!controller.signal.aborted) onError(String(error)); });
    }, 220);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [picker, q, muscle, equipment, onError]);
  async function mutate(path: string, body: Record<string, unknown>) {
    onError('');
    try { onChanged(await api<PlanVersion>(path, { method: 'POST', body: JSON.stringify({ revision: version.revision, ...body }) })); }
    catch (error) { onError(String(error)); }
  }
  async function saveWorkout(event: FormEvent) {
    event.preventDefault(); onError('');
    try { onChanged(await api<PlanVersion>(`/workout-templates/${workout.id}`, { method: 'PATCH', body: JSON.stringify({ revision: version.revision, name, dayLabel: dayLabel || null, expectedDurationMinutes: duration ? Number(duration) : null, trainerNotes: notes || null }) })); setEditing(false); }
    catch (error) { onError(String(error)); }
  }
  function moveTemplate(direction: -1 | 1) {
    const ordered = version.workouts.map((item) => item.id);
    const swap = position + direction;
    [ordered[position], ordered[swap]] = [ordered[swap]!, ordered[position]!];
    void mutate(`/plan-versions/${version.id}/workouts/reorder`, { orderedIds: ordered });
  }
  function moveExercise(index: number, direction: -1 | 1) {
    const ordered = workout.exercises.map((entry) => entry.id);
    [ordered[index], ordered[index + direction]] = [ordered[index + direction]!, ordered[index]!];
    void mutate(`/workout-templates/${workout.id}/exercises/reorder`, { orderedIds: ordered });
  }
  async function addExercise(exerciseId: string) {
    await mutate(`/workout-templates/${workout.id}/exercises`, { exerciseId, targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, intensityMode: 'NONE', targetRir: null, targetRpe: null, restSeconds: 90, suggestedLoadKg: null, trainerNotes: null });
    setPicker(false);
  }
  return <section className="card workout-builder">
    <div className="row wrap"><div><div className="eyebrow">{workout.dayLabel ?? t('plans.version', { number: workout.order })}</div><h2>{workout.name}</h2>{workout.expectedDurationMinutes && <span className="muted small">{workout.expectedDurationMinutes} min</span>}</div><div className="row wrap"><button type="button" className="button link" aria-label={`${t('plans.moveUp')} ${workout.name}`} disabled={position === 0} onClick={() => moveTemplate(-1)}>↑ {t('plans.moveUp')}</button><button type="button" className="button link" aria-label={`${t('plans.moveDown')} ${workout.name}`} disabled={position === total - 1} onClick={() => moveTemplate(1)}>↓ {t('plans.moveDown')}</button></div></div>
    <div className="row wrap builder-actions"><button className="button secondary" onClick={() => setEditing(!editing)}>{t('catalog.edit')}</button><button className="button secondary" onClick={() => void mutate(`/workout-templates/${workout.id}/duplicate`, {})}>{t('plans.duplicateWorkout')}</button><button className="button link" onClick={() => void mutate(`/workout-templates/${workout.id}/remove`, {})}>{t('plans.removeWorkout')}</button></div>
    {editing && <form className="form inset-form" onSubmit={saveWorkout}><label>{t('plans.workoutName')}<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)}/></label><label>{t('plans.dayLabel')}<input value={dayLabel} maxLength={60} onChange={(event) => setDayLabel(event.target.value)}/></label><label>{t('plans.duration')}<input type="number" min={10} max={240} value={duration} onChange={(event) => setDuration(event.target.value)}/></label><label>{t('plans.notes')}<textarea maxLength={1500} value={notes} onChange={(event) => setNotes(event.target.value)}/></label><button className="button">{t('common.save')}</button></form>}
    {!workout.exercises.length && <p className="muted">{t('plans.noExercises')}</p>}
    <div className="prescription-list">{workout.exercises.map((entry, index) => <div className="prescription-editor" key={entry.id}>
      <div className="row wrap"><div className="row"><span className="order-circle">{entry.order}</span><div><strong>{entry.exerciseNameSnapshot ?? entry.exercise.name}</strong>{!entry.exercise.active && <span className="badge">{t('plans.inactiveExercise')}</span>}<div className="muted small">{t('plans.repsSummary', { sets: entry.targetSets, min: entry.targetRepsMin, max: entry.targetRepsMax })} · {t('plans.restSummary', { seconds: entry.restSeconds })}</div></div></div><div className="row"><button className="button link" aria-label={`${t('plans.moveUp')} ${entry.exercise.name}`} disabled={index === 0} onClick={() => moveExercise(index, -1)}>↑</button><button className="button link" aria-label={`${t('plans.moveDown')} ${entry.exercise.name}`} disabled={index === workout.exercises.length - 1} onClick={() => moveExercise(index, 1)}>↓</button><button className="button link" onClick={() => void mutate(`/programmed-exercises/${entry.id}/remove`, {})}>{t('plans.removeEntry')}</button></div></div>
      <PrescriptionEditor entry={entry} version={version} onChanged={onChanged} onError={onError}/>
    </div>)}</div>
    <button className="button secondary" onClick={() => setPicker(!picker)}>{t('plans.selectExercise')}</button>
    {picker && <div className="inset-form"><div className="grid three"><label>{t('plans.searchExercise')}<input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('catalog.searchPlaceholder')}/></label><label>{t('catalog.muscle')}<select value={muscle} onChange={(event) => setMuscle(event.target.value)}><option value="">{t('catalog.all')}</option>{muscleGroupSchema.options.map((value) => <option key={value} value={value}>{muscleText(value)}</option>)}</select></label><label>{t('catalog.equipment')}<select value={equipment} onChange={(event) => setEquipment(event.target.value)}><option value="">{t('catalog.all')}</option>{equipmentSchema.options.map((value) => <option key={value} value={value}>{equipmentText(value)}</option>)}</select></label></div><div className="catalog-picker">{results.filter((item) => !workout.exercises.some((entry) => entry.exerciseId === item.id)).map((item) => <div className="picker-row" key={item.id}><img src={item.media[0]?.url ?? '/media/exercises/conditioning.svg'} alt={t('catalog.mediaAlt', { name: item.name })}/><span><strong>{item.name}</strong><br/><span className="muted small">{muscleText(item.primaryMuscleGroup)}</span></span><button className="button secondary" onClick={() => void addExercise(item.id)}>{t('plans.addExercise')}</button></div>)}</div></div>}
  </section>;
}
