'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { bodyRegionSchema, cancellationReasonSchema, partialWorkoutReasonSchema } from '@machi-gym/contracts';
import { RestTimer } from '../../../../components/rest-timer';
import { SetEditor } from '../../../../components/set-editor';
import { api } from '../../../../lib/api';
import { FeedbackState } from '../../../../lib/feedback';
import { enumText, loadText, t } from '../../../../lib/i18n';
import { WorkoutDetail, WorkoutExercise, WorkoutSet } from '../../../../lib/workouts';
import { useSession } from '../../../../lib/use-session';

const dateLabel = (value: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
const localToday = (timezone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function StudentWorkout() {
  const { id } = useParams<{ id: string }>(); const me = useSession('STUDENT');
  const [session, setSession] = useState<WorkoutDetail | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false); const [reason, setReason] = useState('');
  const [detail, setDetail] = useState(''); const [bodyRegion, setBodyRegion] = useState(''); const [intensity, setIntensity] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false); const [cancelReason, setCancelReason] = useState('OTHER');
  const [restTrigger, setRestTrigger] = useState(0); const [restSeconds, setRestSeconds] = useState(0);
  const [savingSetIds, setSavingSetIds] = useState<Set<string>>(() => new Set());
  const technique = useRef<HTMLDialogElement>(null); const [selectedExercise, setSelectedExercise] = useState<WorkoutExercise | null>(null);
  const load = useCallback(() => { void api<WorkoutDetail>(`/workout-sessions/${encodeURIComponent(id)}`).then((result) => { setSession(result); setError(''); }).catch((failure: unknown) => setError(String(failure))); }, [id]);
  useEffect(() => { if (me) load(); }, [me, load]);
  useEffect(() => { if (!session || !['COMPLETED', 'PARTIAL'].includes(session.status)) return; void api<FeedbackState>(`/workout-sessions/${encodeURIComponent(id)}/feedback`).then(setFeedback).catch((failure: unknown) => setError(String(failure))); }, [session?.status, id]);
  async function start() {
    setBusy(true); setError('');
    try { setSession(await api<WorkoutDetail>(`/workout-sessions/${id}/start`, { method: 'POST', body: '{}' })); }
    catch (failure) { setError(String(failure)); }
    finally { setBusy(false); }
  }
  function saved(set: WorkoutSet, exercise: WorkoutExercise, response: { set: WorkoutSet; progress: WorkoutDetail['progress'] }, justCompleted: boolean) {
    setSession((current) => current && ({ ...current, progress: response.progress, exercises: current.exercises.map((item) => item.id !== exercise.id ? item : { ...item, sets: item.sets.map((row) => row.id === set.id ? response.set : row) }) }));
    if (justCompleted && exercise.restSeconds) { setRestSeconds(exercise.restSeconds); setRestTrigger((count) => count + 1); }
  }
  function setSaving(setId: string, saving: boolean) { setSavingSetIds((current) => { const next = new Set(current); if (saving) next.add(setId); else next.delete(setId); return next; }); }
  async function finish() {
    if (!session) return;
    const partial = session.progress.completedSets < session.progress.totalSets;
    if (partial && !reason) { setError(t('workout.finishReason')); return; }
    setBusy(true); setError('');
    try {
      const result = await api<WorkoutDetail>(`/workout-sessions/${id}/finish`, { method: 'POST', body: JSON.stringify({ version: session.version, ...(partial ? { partialReason: reason, partialReasonDetail: detail || null, bodyRegion: reason === 'DISCOMFORT_OR_PAIN' ? bodyRegion || null : null, intensity: reason === 'DISCOMFORT_OR_PAIN' && intensity ? Number(intensity) : null } : {}) }) });
      setSession(result); setFinishOpen(false);
    } catch (failure) { setError(String(failure)); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!session) return;
    setBusy(true); setError('');
    try { setSession(await api<WorkoutDetail>(`/workout-sessions/${id}/cancel`, { method: 'POST', body: JSON.stringify({ version: session.version, reason: cancelReason }) })); setCancelOpen(false); }
    catch (failure) { setError(String(failure)); }
    finally { setBusy(false); }
  }
  function openTechnique(exercise: WorkoutExercise) { setSelectedExercise(exercise); technique.current?.showModal(); }
  if (!me || !session) return <p role="status">{error || t('common.loading')}</p>;
  const started = session.status === 'IN_PROGRESS';
  const finished = session.status === 'COMPLETED' || session.status === 'PARTIAL';
  const incomplete = session.progress.completedSets < session.progress.totalSets;
  const upcoming = session.scheduledDate.slice(0, 10) > localToday(session.timezone);
  const rest = (value: WorkoutExercise) => t('plans.restSummary', { seconds: value.restSeconds });
  const techniqueMedia = selectedExercise?.media.find((item) => item.type === 'ANIMATION') ?? selectedExercise?.media[0];
  const cancelPanel = () => <div className="cancel-flow"><button className="button link" onClick={() => setCancelOpen(!cancelOpen)}>{t('workout.cancel')}</button>{cancelOpen && <div className="form"><p>{t('workout.cancelConfirm')}</p><label>{t('workout.cancelReason')}<select value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}>{cancellationReasonSchema.options.map((value) => <option key={value} value={value}>{enumText(value)}</option>)}</select></label><button className="button secondary" disabled={busy} onClick={() => void cancel()}>{t('workout.cancel')}</button></div>}</div>;
  return <>
    <a href="/student" className="back">{t('workout.back')}</a>
    <div className="hero workout-hero"><div className="eyebrow">{started ? t('workout.inProgress') : finished ? t('workout.done') : t('workout.header')}</div><h1>{session.workout.name}</h1><p className="muted">{session.workout.planTitle} · {dateLabel(session.scheduledDate)}</p><div className="row wrap"><span className="badge">{enumText(session.status)}</span><span className="muted">{t('workout.progressExercises', { completed: session.progress.completedExercises, total: session.progress.totalExercises })}</span></div></div>
    {error && <div className="notice error" role="alert">{error} <button className="button secondary" onClick={load}>{t('workout.reload')}</button></div>}
    {session.status === 'NOT_STARTED' && <section className="card workout-start"><p>{upcoming ? t('workout.future', { date: dateLabel(session.scheduledDate) }) : t('workout.prescribed')}</p><button className="button" disabled={busy || upcoming} onClick={() => void start()}>{busy ? t('common.loading') : t('workout.start')}</button></section>}
    {session.status === 'NOT_STARTED' && <section className="card">{cancelPanel()}</section>}
    {started && <div className="workout-progress" role="status"><strong>{t('workout.progressSets', { completed: session.progress.completedSets, total: session.progress.totalSets })}</strong><progress max={session.progress.totalSets} value={session.progress.completedSets}/></div>}
    {started && <RestTimer sessionId={id} trigger={restTrigger} seconds={restSeconds}/>}
    <div className="workout-exercises">{session.exercises.map((exercise) => <section className="card exercise-execution" key={exercise.id}>
      <div className="exercise-execution-heading"><div><div className="eyebrow">{exercise.order.toString().padStart(2, '0')} · {t('workout.today')}</div><h2>{exercise.exerciseNameSnapshot}</h2></div><button className="button secondary" onClick={() => openTechnique(exercise)}>{t('workout.technique')}</button></div>
      <div className="workout-target"><div className="eyebrow">{t('workout.prescribed')}</div><strong>{t('plans.repsSummary', { sets: exercise.targetSets, min: exercise.targetRepsMin, max: exercise.targetRepsMax })}</strong><span>{exercise.intensityMode === 'RIR' ? `RIR ${exercise.targetRir}` : exercise.intensityMode === 'RPE' ? `RPE ${exercise.targetRpe}` : ''} · {rest(exercise)}</span>{exercise.loadEntryConventionSnapshot && <span className="muted small">{loadText(exercise.loadEntryConventionSnapshot)}</span>}{exercise.suggestedLoadKg && <p className="muted small">{t('workout.suggested', { weight: exercise.suggestedLoadKg })} · {t('workout.suggestedHelp')}</p>}</div>
      {exercise.previous ? <div className="previous-workout"><div className="eyebrow">{t('workout.lastTime', { date: dateLabel(exercise.previous.finishedAt) })}</div><ol>{exercise.previous.sets.map((set) => <li key={set.setNumber}>{exercise.performanceModeSnapshot === 'WEIGHT_REPS' ? `${set.actualLoadKg ?? '0'} kg × ` : ''}{set.actualRepetitions} {t('workout.repetitions').toLowerCase()}</li>)}</ol></div> : <p className="muted small">{t('workout.lastTimeEmpty')}</p>}
      {started ? <div className="set-list"><h3>{t('workout.today')}</h3>{exercise.sets.map((set) => <SetEditor key={set.id} sessionId={id} set={set} mode={exercise.performanceModeSnapshot} intensityMode={exercise.intensityMode} onSaved={(result, justCompleted) => saved(set, exercise, result, justCompleted)} onSavingChange={setSaving}/>)}</div> : finished ? <div className="set-list"><h3>{t('workout.today')}</h3>{exercise.sets.map((set) => <div className="read-only-entry" key={set.id}><span className="order-circle">{set.setNumber}</span><div><strong>{enumText(set.completionState)}</strong><p className="muted small">{set.completionState === 'COMPLETED' ? `${set.actualLoadKg === null ? '' : `${set.actualLoadKg} kg × `}${set.actualRepetitions} ${t('workout.repetitions').toLowerCase()}` : '—'}</p></div></div>)}</div> : null}
    </section>)}</div>
    {started && <section className="card finish-card"><button className="button" disabled={busy || savingSetIds.size > 0} onClick={() => incomplete ? setFinishOpen(true) : void finish()}>{savingSetIds.size > 0 ? t('common.saving') : t('workout.finish')}</button>{incomplete && <p className="muted small">{t('workout.progressSets', { completed: session.progress.completedSets, total: session.progress.totalSets })}</p>}{finishOpen && <div className="finish-confirm"><h3>{t('workout.finishConfirm')}</h3><label>{t('workout.finishReason')}<select value={reason} onChange={(event) => setReason(event.target.value)}><option value="">{t('common.choose')}</option>{partialWorkoutReasonSchema.options.map((value) => <option key={value} value={value}>{enumText(value)}</option>)}</select></label><label>{t('workout.reasonContext')}<textarea maxLength={500} value={detail} onChange={(event) => setDetail(event.target.value)}/></label>{reason === 'DISCOMFORT_OR_PAIN' && <div className="grid"><label>{t('workout.bodyRegion')}<select value={bodyRegion} onChange={(event) => setBodyRegion(event.target.value)}><option value="">{t('common.choose')}</option>{bodyRegionSchema.options.map((value) => <option key={value} value={value}>{enumText(value)}</option>)}</select></label><label>{t('workout.intensity')}<input type="number" inputMode="numeric" min={1} max={10} value={intensity} onChange={(event) => setIntensity(event.target.value)}/></label></div>}<button className="button" disabled={busy || savingSetIds.size > 0 || !reason} onClick={() => void finish()}>{t('workout.finishEarly')}</button></div>}
      {session.progress.completedSets === 0 && cancelPanel()}</section>}
    {finished && <div className="card subtle"><h2>{session.status === 'PARTIAL' ? t('workout.partialSaved') : t('workout.completedSaved')}</h2>{session.partialReason && <p>{enumText(session.partialReason)}</p>}<div className="row wrap feedback-navigation">{feedback?.eligible && <a className="button" href={`/student/workouts/${id}/feedback`}>{t('feedback.cta')}</a>}{feedback?.feedback && <a className="button secondary" href={`/student/workouts/${id}/feedback`}>{t('feedback.view')}</a>}{feedback?.reason === 'EXPIRED' && <p className="muted small">{t('feedback.expired')}</p>}<a className="button secondary" href="/student/workouts">{t('workout.historyLink')}</a>{feedback?.eligible && <a href="/student" className="button link">{t('feedback.skip')}</a>}</div></div>}
    <dialog ref={technique} className="technique-dialog" onClose={() => setSelectedExercise(null)}><div className="row"><h2>{selectedExercise?.exerciseNameSnapshot}</h2><button className="button secondary" onClick={() => technique.current?.close()}>{t('workout.techniqueClose')}</button></div>{selectedExercise && <><div className="technique-media">{techniqueMedia ? techniqueMedia.type === 'VIDEO' ? <video src={techniqueMedia.url} controls playsInline preload="metadata"/> : <img src={techniqueMedia.url} alt={t('catalog.mediaAlt', { name: selectedExercise.exerciseNameSnapshot })}/> : <p>{t('catalog.noMedia')}</p>}</div><p className="muted small">{t('catalog.referenceOnly')}</p><h3>{t('workout.instructions')}</h3><p>{selectedExercise.instructionsSnapshot}</p><h3>{t('workout.mistakes')}</h3><p>{selectedExercise.commonMistakesSnapshot}</p>{selectedExercise.cautionNotesSnapshot && <><h3>{t('workout.caution')}</h3><p>{selectedExercise.cautionNotesSnapshot}</p></>}</>}</dialog>
  </>;
}
