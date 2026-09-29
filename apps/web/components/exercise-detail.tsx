'use client';

import { useCallback, useEffect, useState } from 'react';
import { exerciseAssets } from '@machi-gym/contracts';
import { api } from '../lib/api';
import { CatalogExercise, CatalogMedia, mediaPreview } from '../lib/catalog';
import { assetText, enumText, equipmentText, mediaTypeText, muscleText, patternText, t } from '../lib/i18n';
import { ExerciseEditor } from './exercise-editor';
import { useSession } from '../lib/use-session';

export function ExerciseDetail({ id, mode }: { id: string; mode: 'trainer' | 'student' }) {
  const me = useSession(mode === 'trainer' ? 'COACH' : 'STUDENT');
  const [exercise, setExercise] = useState<CatalogExercise | null>(null);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [mediaId, setMediaId] = useState('');
  const [asset, setAsset] = useState<string>(exerciseAssets[0]);
  const load = useCallback(() => { void api<CatalogExercise>(`/exercises/${encodeURIComponent(id)}`).then((value) => { setExercise(value); setError(''); }).catch((err: unknown) => setError(String(err))); }, [id]);
  useEffect(() => { if (me) load(); }, [me, load]);

  async function status() {
    if (!exercise || exercise.version === undefined) return;
    if (exercise.active && !window.confirm(t('catalog.confirmDeactivate'))) return;
    try { await api(`/exercises/${id}/status`, { method: 'PATCH', body: JSON.stringify({ version: exercise.version, active: !exercise.active }) }); setMessage(exercise.active ? t('catalog.deactivated') : t('catalog.activated')); load(); }
    catch (err) { setError(String(err)); }
  }
  async function aiEligibility() {
    if (!exercise || exercise.version === undefined) return;
    try { await api(`/exercises/${id}/status`, { method: 'PATCH', body: JSON.stringify({ version: exercise.version, aiEligible: !exercise.aiEligible }) });
      setMessage(exercise.aiEligible ? 'Ejercicio excluido de propuestas con IA.' : 'Ejercicio habilitado para propuestas con IA.'); load(); }
    catch (err) { setError(String(err)); }
  }
  async function addMedia(type: 'THUMBNAIL' | 'ANIMATION') {
    try { await api(`/exercises/${id}/media`, { method: 'POST', body: JSON.stringify({ type, url: asset, source: 'PROJECT_ORIGINAL', licenseName: 'Arte original Machi Gym', attributionText: 'Machi Gym · ilustración original' }) }); setMessage(t('catalog.mediaAdded')); load(); }
    catch (err) { setError(String(err)); }
  }
  async function verify(media: CatalogMedia) {
    try { await api(`/exercises/${id}/media/${media.id}/verify`, { method: 'POST' }); setMessage(t('catalog.mediaPublished')); load(); }
    catch (err) { setError(String(err)); }
  }
  if (!me || !exercise) return <p role="status">{error || t('common.loading')}</p>;
  const chosen = exercise.media.find((item) => item.id === mediaId && item.active) ?? exercise.media.find((item) => item.type === 'ANIMATION' && item.active) ?? exercise.media.find((item) => item.type === 'THUMBNAIL' && item.active);
  const preview = chosen?.url ?? mediaPreview(exercise);
  const back = mode === 'trainer' ? '/trainer/exercises' : '/student/exercises';
  return <>
    <a className="back" href={back}>{t('catalog.back')}</a>
    <div className="row wrap hero"><div><div className="eyebrow">{patternText(exercise.movementPattern)} · {enumText(exercise.difficulty)}</div><h1>{exercise.name}</h1><p className="muted">{exercise.description}</p></div>{mode === 'trainer' && <span className="badge">{exercise.active ? t('catalog.active') : t('catalog.inactive')}</span>}</div>
    {message && <p className="success" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    <div className="exercise-detail-grid">
      <section className="stack">
        <div className="detail-visual">{preview ? chosen?.type === 'VIDEO' ? <video src={preview} controls playsInline preload="metadata"/> : <img src={preview} alt={t('catalog.mediaAlt', { name: exercise.name })}/> : <div className="empty-media">{t('catalog.noMedia')}</div>}</div>
        {exercise.media.filter((item) => item.active).length > 1 && <div className="media-selector">{exercise.media.filter((item) => item.active).map((item) => <button key={item.id} className={`media-option ${chosen?.id === item.id ? 'selected' : ''}`} onClick={() => setMediaId(item.id)}><img src={item.url} alt={t('catalog.mediaAlt', { name: exercise.name })}/><span>{item.type === 'ANIMATION' ? t('catalog.addAnimation') : t('catalog.media')}</span></button>)}</div>}
        <p className="muted small">{t('catalog.referenceOnly')}</p>
        <div className="card"><h2>{t('catalog.instructions')}</h2><p>{exercise.instructions}</p><h3>{t('catalog.mistakes')}</h3><p>{exercise.commonMistakes}</p>{exercise.cautionNotes && <><h3>{t('catalog.caution')}</h3><p>{exercise.cautionNotes}</p></>}</div>
      </section>
      <section className="stack"><div className="card"><h2>{t('catalog.details')}</h2><div className="detail-fact"><span>{t('catalog.primary')}</span><strong>{muscleText(exercise.primaryMuscleGroup)}</strong></div>{exercise.secondaryMuscleGroups.length > 0 && <div className="detail-fact"><span>{t('catalog.secondary')}</span><strong>{exercise.secondaryMuscleGroups.map(muscleText).join(', ')}</strong></div>}<div className="detail-fact"><span>{t('catalog.equipment')}</span><strong>{exercise.equipment.map(equipmentText).join(', ')}</strong></div><div className="detail-fact"><span>{t('catalog.pattern')}</span><strong>{patternText(exercise.movementPattern)}</strong></div></div>
        {mode === 'trainer' && <div className="card"><h2>{t('catalog.edit')}</h2><div className="stack"><button className="button secondary" onClick={() => setEditing(!editing)}>{t('catalog.edit')}</button><button className="button secondary" onClick={() => void status()}>{exercise.active ? t('catalog.deactivate') : t('catalog.activate')}</button><button className="button secondary" disabled={!exercise.active && !exercise.aiEligible} onClick={() => void aiEligibility()}>{exercise.aiEligible ? 'Excluir de propuestas con IA' : 'Habilitar en propuestas con IA'}</button><p className="muted small">Sólo ejercicios activos y habilitados podrán sugerirse; el entrenador revisa cada propuesta.</p></div></div>}
        {mode === 'trainer' && <div className="card"><h2>{t('catalog.media')}</h2><p className="muted small">{t('catalog.addMediaHelp')}</p>{exercise.media.map((item) => <div key={item.id} className="media-row"><span>{mediaTypeText(item.type)} · {item.active ? t('catalog.mediaVerified') : t('catalog.mediaPending')}</span>{!item.active && <button className="button secondary" onClick={() => void verify(item)}>{t('catalog.verify')}</button>}</div>)}<label>{t('catalog.addMedia')}<select value={asset} onChange={(event) => setAsset(event.target.value)}>{exerciseAssets.map((value) => <option key={value} value={value}>{assetText(value)}</option>)}</select></label><div className="row wrap" style={{ marginTop: 12 }}><button className="button secondary" disabled={asset.endsWith('-motion.svg')} onClick={() => void addMedia('THUMBNAIL')}>{t('catalog.addAsset')}</button><button className="button secondary" disabled={!asset.endsWith('-motion.svg')} onClick={() => void addMedia('ANIMATION')}>{t('catalog.addAnimation')}</button></div></div>}
      </section>
    </div>
    {mode === 'trainer' && editing && <section className="card" style={{ marginTop: 24 }}><h2>{t('catalog.edit')}</h2><ExerciseEditor key={exercise.version} exercise={exercise} onSaved={(updated) => { setExercise(updated); setEditing(false); setMessage(t('catalog.updated')); }}/></section>}
  </>;
}
