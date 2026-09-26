'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FeedbackSummary } from '../../../../components/feedback-summary';
import { api } from '../../../../lib/api';
import { FeedbackState } from '../../../../lib/feedback';
import { enumText, t } from '../../../../lib/i18n';
import { WorkoutDetail } from '../../../../lib/workouts';
import { useSession } from '../../../../lib/use-session';

export default function TrainerWorkout() {
  const { id } = useParams<{ id: string }>(); const me = useSession('COACH');
  const [session, setSession] = useState<WorkoutDetail | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const load = useCallback(() => { void api<WorkoutDetail>(`/workout-sessions/${encodeURIComponent(id)}`).then((value) => { setSession(value); setError(''); }).catch((failure: unknown) => setError(String(failure))); }, [id]);
  useEffect(() => { if (me) load(); }, [me, load]);
  useEffect(() => { if (!session || !['COMPLETED', 'PARTIAL'].includes(session.status)) return; void api<FeedbackState>(`/workout-sessions/${encodeURIComponent(id)}/feedback`).then(setFeedback).catch((failure: unknown) => setError(String(failure))); }, [session?.status, id]);
  async function command(action: 'skip' | 'cancel') {
    if (!session || !window.confirm(action === 'skip' ? t('workout.skipConfirm') : t('workout.cancelConfirm'))) return;
    setBusy(true); setError('');
    try { setSession(await api<WorkoutDetail>(`/workout-sessions/${id}/${action}`, { method: 'POST', body: JSON.stringify(action === 'skip' ? { version: session.version } : { version: session.version, reason: 'SCHEDULE_CHANGE' }) })); }
    catch (failure) { setError(String(failure)); }
    finally { setBusy(false); }
  }
  if (!me || !session) return <p role="status">{error || t('common.loading')}</p>;
  const pastDue = session.scheduledDate.slice(0, 10) < new Intl.DateTimeFormat('en-CA', { timeZone: session.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return <><a className="back" href={`/trainer/students/${session.studentId}`}>{t('workout.trainerBack')}</a><div className="hero"><div className="eyebrow">{t('workout.trainerSessions')}</div><h1>{session.workout.name}</h1><p className="muted">{session.workout.planTitle} · {session.scheduledDate.slice(0, 10)}</p><span className="badge">{enumText(session.status)}</span></div>
    {error && <p role="alert" className="error">{error}</p>}
    <section className="card"><h2>{t('workout.progressSets', { completed: session.progress.completedSets, total: session.progress.totalSets })}</h2><p>{t('workout.progressExercises', { completed: session.progress.completedExercises, total: session.progress.totalExercises })}</p>{session.startedAt && <p>{t('workout.startedAt')}: {new Date(session.startedAt).toLocaleString('es-AR')}</p>}{session.finishedAt && <p>{t('workout.finishedAt')}: {new Date(session.finishedAt).toLocaleString('es-AR')}</p>}{session.partialReason && <p>{t('workout.finishReason')} {enumText(session.partialReason)} {session.partialReasonDetail}</p>}{session.cancellationReason && <p>{t('workout.cancelReason')}: {enumText(session.cancellationReason)}</p>}{session.status === 'NOT_STARTED' && <div className="row wrap">{pastDue && <button disabled={busy} className="button secondary" onClick={() => void command('skip')}>{t('workout.skip')}</button>}<button disabled={busy} className="button secondary" onClick={() => void command('cancel')}>{t('workout.cancel')}</button></div>}</section>
    <div className="workout-stack">{session.exercises.map((exercise) => <section className="card" key={exercise.id}><div className="eyebrow">{exercise.order.toString().padStart(2, '0')}</div><h2>{exercise.exerciseNameSnapshot}</h2><p className="muted">{t('plans.repsSummary', { sets: exercise.targetSets, min: exercise.targetRepsMin, max: exercise.targetRepsMax })}</p>{exercise.sets.map((set) => <div className="read-only-entry" key={set.id}><span className="order-circle">{set.setNumber}</span><div><strong>{enumText(set.completionState)}</strong><p className="muted small">{set.completionState === 'COMPLETED' ? `${set.actualLoadKg === null ? '' : `${set.actualLoadKg} kg × `}${set.actualRepetitions} ${t('workout.repetitions').toLowerCase()}${set.rir !== null ? ` · RIR ${set.rir}` : set.rpe !== null ? ` · RPE ${set.rpe}` : ''}` : '—'}</p></div></div>)}</section>)}</div>
    {session.safetyEvents.length > 0 && <section className="card"><h2>{t('workout.caution')}</h2>{session.safetyEvents.map((event) => <p key={event.id}>{enumText(event.type)}{event.bodyRegion ? ` · ${enumText(event.bodyRegion)}` : ''}{event.intensity ? ` · ${event.intensity}/10` : ''}{event.notes ? ` · ${event.notes}` : ''}</p>)}</section>}
    {feedback && <section className="card trainer-feedback"><div className="eyebrow">{t('feedback.eyebrow')}</div><h2>{t('feedback.trainerTitle')}</h2>{feedback.feedback ? <FeedbackSummary feedback={feedback.feedback} exerciseNames={Object.fromEntries(session.exercises.map((exercise) => [exercise.exerciseId, exercise.exerciseNameSnapshot]))}/> : <p className="muted">{t('feedback.trainerPending')}</p>}</section>}
  </>;
}
