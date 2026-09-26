'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { equipmentSchema, exerciseDifficultySchema, loadEntryConventionSchema, movementPatternSchema, muscleGroupSchema, normalizeExerciseSearch, type ExerciseCreateInput } from '@machi-gym/contracts';
import { api } from '../lib/api';
import { CatalogExercise } from '../lib/catalog';
import { enumText, equipmentText, loadText, muscleText, patternText, t } from '../lib/i18n';

const empty: ExerciseCreateInput = { name: '', slug: '', aliases: [], description: '', primaryMuscleGroup: 'CHEST', secondaryMuscleGroups: [], equipment: ['BODYWEIGHT'], movementPattern: 'HORIZONTAL_PUSH', difficulty: 'BEGINNER', performanceMode: 'REPS_ONLY', loadEntryConvention: null, loadMultiplier: 1, instructions: '', commonMistakes: '', cautionNotes: null };
function fromExercise(exercise: CatalogExercise): ExerciseCreateInput {
  return { name: exercise.name, slug: exercise.slug, aliases: exercise.aliases, description: exercise.description, primaryMuscleGroup: exercise.primaryMuscleGroup as ExerciseCreateInput['primaryMuscleGroup'], secondaryMuscleGroups: exercise.secondaryMuscleGroups as ExerciseCreateInput['secondaryMuscleGroups'], equipment: exercise.equipment as ExerciseCreateInput['equipment'], movementPattern: exercise.movementPattern as ExerciseCreateInput['movementPattern'], difficulty: exercise.difficulty as ExerciseCreateInput['difficulty'], performanceMode: exercise.performanceMode, loadEntryConvention: exercise.loadEntryConvention as ExerciseCreateInput['loadEntryConvention'], loadMultiplier: Number(exercise.loadMultiplier), instructions: exercise.instructions, commonMistakes: exercise.commonMistakes, cautionNotes: exercise.cautionNotes };
}
export function ExerciseEditor({ exercise, onSaved }: { exercise?: CatalogExercise; onSaved?: (updated: CatalogExercise) => void }) {
  const router = useRouter();
  const [form, setForm] = useState<ExerciseCreateInput>(() => exercise ? fromExercise(exercise) : empty);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  function toggle(key: 'equipment' | 'secondaryMuscleGroups', value: string) {
    if (key === 'equipment') setForm({ ...form, equipment: form.equipment.includes(value as ExerciseCreateInput['equipment'][number]) ? form.equipment.filter((entry) => entry !== value) : [...form.equipment, value as ExerciseCreateInput['equipment'][number]] });
    else setForm({ ...form, secondaryMuscleGroups: form.secondaryMuscleGroups.includes(value as ExerciseCreateInput['primaryMuscleGroup']) ? form.secondaryMuscleGroups.filter((entry) => entry !== value) : [...form.secondaryMuscleGroups, value as ExerciseCreateInput['primaryMuscleGroup']] });
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const updated = await api<CatalogExercise>(exercise ? `/exercises/${exercise.id}` : '/exercises', { method: exercise ? 'PATCH' : 'POST', body: JSON.stringify(exercise ? { ...form, version: exercise.version } : form) });
      if (exercise) onSaved?.(updated);
      else router.push(`/trainer/exercises/${updated.id}`);
    } catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
    finally { setBusy(false); }
  }
  return <form className="form exercise-editor" onSubmit={submit}>
    <div className="grid"><label>{t('catalog.name')}<input required minLength={3} maxLength={120} value={form.name} onChange={(event) => { const name = event.target.value; setForm({ ...form, name, slug: !exercise && form.slug === normalizeExerciseSearch(form.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ? normalizeExerciseSearch(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : form.slug }); }}/></label><label>{t('catalog.slug')}<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })}/></label></div>
    <label>{t('catalog.aliases')}<input value={form.aliases.join(', ')} onChange={(event) => setForm({ ...form, aliases: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })}/></label>
    <label>{t('catalog.descriptionField')}<textarea required minLength={20} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label>
    <div className="grid three">
      <label>{t('catalog.primary')}<select value={form.primaryMuscleGroup} onChange={(event) => setForm({ ...form, primaryMuscleGroup: event.target.value as ExerciseCreateInput['primaryMuscleGroup'], secondaryMuscleGroups: form.secondaryMuscleGroups.filter((value) => value !== event.target.value) })}>{muscleGroupSchema.options.map((value) => <option key={value} value={value}>{muscleText(value)}</option>)}</select></label>
      <label>{t('catalog.patternField')}<select value={form.movementPattern} onChange={(event) => setForm({ ...form, movementPattern: event.target.value as ExerciseCreateInput['movementPattern'] })}>{movementPatternSchema.options.map((value) => <option key={value} value={value}>{patternText(value)}</option>)}</select></label>
      <label>{t('catalog.difficultyField')}<select value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value as ExerciseCreateInput['difficulty'] })}>{exerciseDifficultySchema.options.map((value) => <option key={value} value={value}>{enumText(value)}</option>)}</select></label>
    </div>
    <div className="grid"><fieldset><legend>{t('catalog.secondaryField')}</legend><div className="checkbox-list">{muscleGroupSchema.options.filter((value) => value !== form.primaryMuscleGroup).map((value) => <label key={value}><input type="checkbox" checked={form.secondaryMuscleGroups.includes(value)} onChange={() => toggle('secondaryMuscleGroups', value)}/>{muscleText(value)}</label>)}</div></fieldset><fieldset><legend>{t('catalog.equipmentField')}</legend><div className="checkbox-list">{equipmentSchema.options.map((value) => <label key={value}><input type="checkbox" checked={form.equipment.includes(value)} onChange={() => toggle('equipment', value)}/>{equipmentText(value)}</label>)}</div></fieldset></div>
    <div className="grid three"><label>{t('catalog.performance')}<select value={form.performanceMode} onChange={(event) => setForm({ ...form, performanceMode: event.target.value as ExerciseCreateInput['performanceMode'], loadEntryConvention: event.target.value === 'REPS_ONLY' ? null : 'TOTAL_EXTERNAL_LOAD', loadMultiplier: 1 })}><option value="REPS_ONLY">{t('catalog.repsOnly')}</option><option value="WEIGHT_REPS">{t('catalog.weightReps')}</option></select></label>{form.performanceMode === 'WEIGHT_REPS' && <><label>{t('catalog.loadConvention')}<select value={form.loadEntryConvention ?? ''} onChange={(event) => setForm({ ...form, loadEntryConvention: event.target.value as ExerciseCreateInput['loadEntryConvention'] })}>{loadEntryConventionSchema.options.map((value) => <option key={value} value={value}>{loadText(value)}</option>)}</select></label><label>{t('catalog.loadMultiplier')}<input type="number" min="0.1" max="4" step="0.1" value={form.loadMultiplier} onChange={(event) => setForm({ ...form, loadMultiplier: Number(event.target.value) })}/></label></>}</div>
    <label>{t('catalog.instructionsField')}<textarea required minLength={20} rows={4} value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })}/></label>
    <label>{t('catalog.mistakesField')}<textarea required minLength={10} rows={3} value={form.commonMistakes} onChange={(event) => setForm({ ...form, commonMistakes: event.target.value })}/></label>
    <label>{t('catalog.cautionField')}<textarea rows={2} value={form.cautionNotes ?? ''} onChange={(event) => setForm({ ...form, cautionNotes: event.target.value || null })}/></label>
    {error && <p role="alert" className="error">{error}</p>}
    <button disabled={busy} className="button">{busy ? t('common.saving') : t('catalog.save')}</button>
  </form>;
}
