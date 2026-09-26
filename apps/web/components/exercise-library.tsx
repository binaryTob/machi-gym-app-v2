'use client';

import { FormEvent, useEffect, useState } from 'react';
import { equipmentSchema, exerciseDifficultySchema, movementPatternSchema, muscleGroupSchema } from '@machi-gym/contracts';
import { api } from '../lib/api';
import { CatalogExercise, CatalogPage, mediaPreview } from '../lib/catalog';
import { equipmentText, enumText, muscleText, patternText, t } from '../lib/i18n';
import { SignOut, useSession } from '../lib/use-session';

type Filters = { q: string; muscle: string; equipment: string; pattern: string; difficulty: string; active: string };
const initial: Filters = { q: '', muscle: '', equipment: '', pattern: '', difficulty: '', active: 'true' };

export function ExerciseLibrary({ mode }: { mode: 'trainer' | 'student' }) {
  const me = useSession(mode === 'trainer' ? 'COACH' : 'STUDENT');
  const [filters, setFilters] = useState<Filters>(initial);
  const [items, setItems] = useState<CatalogExercise[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!me) return;
    const cancel = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
      void api<CatalogPage>(`/exercises?${params.toString()}`, { signal: cancel.signal }).then((result) => { setItems(result.items); setNextCursor(result.nextCursor); setLoading(false); setError(''); }).catch((err: unknown) => { if (!cancel.signal.aborted) { setError(String(err)); setLoading(false); } });
    }, 220);
    return () => { clearTimeout(timer); cancel.abort(); };
  }, [me, filters]);
  function change(key: keyof Filters, value: string) { setFilters((previous) => ({ ...previous, [key]: value })); setItems([]); setLoading(true); }
  async function more() {
    if (!nextCursor) return;
    const params = new URLSearchParams([...Object.entries(filters).filter(([, value]) => value), ['cursor', nextCursor]]);
    try { const result = await api<CatalogPage>(`/exercises?${params.toString()}`); setItems((previous) => [...previous, ...result.items]); setNextCursor(result.nextCursor); }
    catch (err) { setError(String(err)); }
  }
  function search(event: FormEvent) { event.preventDefault(); }
  if (!me) return <p role="status">{t('common.loading')}</p>;
  const detailBase = mode === 'trainer' ? '/trainer/exercises' : '/student/exercises';
  return <>
    <div className="row wrap hero"><div><div className="eyebrow">{t('catalog.eyebrow')}</div><h1>{t('catalog.title')}</h1><p className="muted">{mode === 'trainer' ? t('catalog.description') : t('catalog.studentDescription')}</p></div><SignOut /></div>
    <div className="catalog-toolbar"><form onSubmit={search}><label>{t('catalog.search')}<input type="search" placeholder={t('catalog.searchPlaceholder')} value={filters.q} onChange={(event) => change('q', event.target.value)}/></label></form>{mode === 'trainer' && <a className="button" href="/trainer/exercises/new">{t('catalog.create')}</a>}</div>
    <div className="catalog-filters">
      <label>{t('catalog.muscle')}<select value={filters.muscle} onChange={(event) => change('muscle', event.target.value)}><option value="">{t('catalog.all')}</option>{muscleGroupSchema.options.map((muscle) => <option key={muscle} value={muscle}>{muscleText(muscle)}</option>)}</select></label>
      <label>{t('catalog.equipment')}<select value={filters.equipment} onChange={(event) => change('equipment', event.target.value)}><option value="">{t('catalog.all')}</option>{equipmentSchema.options.map((equipment) => <option key={equipment} value={equipment}>{equipmentText(equipment)}</option>)}</select></label>
      <label>{t('catalog.pattern')}<select value={filters.pattern} onChange={(event) => change('pattern', event.target.value)}><option value="">{t('catalog.all')}</option>{movementPatternSchema.options.map((pattern) => <option key={pattern} value={pattern}>{patternText(pattern)}</option>)}</select></label>
      <label>{t('catalog.difficulty')}<select value={filters.difficulty} onChange={(event) => change('difficulty', event.target.value)}><option value="">{t('catalog.all')}</option>{exerciseDifficultySchema.options.map((difficulty) => <option key={difficulty} value={difficulty}>{enumText(difficulty)}</option>)}</select></label>
      {mode === 'trainer' && <label>{t('catalog.status')}<select value={filters.active} onChange={(event) => change('active', event.target.value)}><option value="">{t('catalog.all')}</option><option value="true">{t('catalog.active')}</option><option value="false">{t('catalog.inactive')}</option></select></label>}
    </div>
    {error && <p role="alert" className="error">{error}</p>}
    {loading && <p role="status">{t('common.loading')}</p>}
    {!loading && items.length === 0 && <div className="card"><p>{t('catalog.empty')}</p></div>}
    <div className="catalog-grid">{items.map((exercise) => <a className="exercise-card" href={`${detailBase}/${exercise.id}`} key={exercise.id}>
      <div className="exercise-visual">{mediaPreview(exercise) ? <img src={mediaPreview(exercise)!} alt={t('catalog.mediaAlt', { name: exercise.name })} loading="lazy"/> : <div className="empty-media">{t('catalog.noMedia')}</div>}</div>
      <div className="exercise-card-body"><div className="row"><span className="eyebrow">{patternText(exercise.movementPattern)}</span>{mode === 'trainer' && <span className="badge">{exercise.active ? t('catalog.active') : t('catalog.inactive')}</span>}</div><h2>{exercise.name}</h2><p className="muted small">{exercise.description}</p><div className="tag-list"><span>{muscleText(exercise.primaryMuscleGroup)}</span>{exercise.equipment.slice(0, 2).map((value) => <span key={value}>{equipmentText(value)}</span>)}</div><span className="preview-link">{t('catalog.preview')}</span></div>
    </a>)}</div>
    {nextCursor && <button className="button secondary load-more" onClick={() => void more()}>{t('catalog.loadMore')}</button>}
  </>;
}
