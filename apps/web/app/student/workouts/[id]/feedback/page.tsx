'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { bodyRegionSchema, perceivedStateSchema, recoveryStateSchema } from '@machi-gym/contracts';
import { FeedbackSummary } from '../../../../../components/feedback-summary';
import { api } from '../../../../../lib/api';
import { FeedbackRecord, FeedbackState } from '../../../../../lib/feedback';
import { enumText, t } from '../../../../../lib/i18n';
import { WorkoutDetail } from '../../../../../lib/workouts';
import { useSession } from '../../../../../lib/use-session';

type ReportInput = { bodyRegion: string; otherLocation: string; intensity: string; exerciseId: string; notes: string };
const blank = (): ReportInput => ({ bodyRegion: '', otherLocation: '', intensity: '', exerciseId: '', notes: '' });

export default function StudentFeedbackPage() {
  const { id } = useParams<{ id: string }>(); const me = useSession('STUDENT');
  const [state, setState] = useState<FeedbackState | null>(null); const [session, setSession] = useState<WorkoutDetail | null>(null);
  const [effort, setEffort] = useState<number | null>(null); const [perceived, setPerceived] = useState(''); const [recovery, setRecovery] = useState('');
  const [discomfort, setDiscomfort] = useState<boolean | null>(null); const [reports, setReports] = useState<ReportInput[]>([]);
  const [generalNotes, setGeneralNotes] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<FeedbackRecord | null>(null);
  useEffect(() => {
    if (!me) return;
    void Promise.all([api<FeedbackState>(`/workout-sessions/${encodeURIComponent(id)}/feedback`), api<WorkoutDetail>(`/workout-sessions/${encodeURIComponent(id)}`)]).then(([value, workout]) => {
      setState(value); setSession(workout); setSaved(value.feedback);
      const early = value.earlyEvents.find((event) => event.type === 'DISCOMFORT_OR_PAIN');
      if (early && !value.feedback) { setDiscomfort(true); setReports([{ bodyRegion: early.bodyRegion ?? '', intensity: early.intensity ? String(early.intensity) : '', exerciseId: '', otherLocation: '', notes: early.notes ?? '' }]); }
    }).catch((failure: unknown) => setError(String(failure)));
  }, [me, id]);
  function update(index: number, fields: Partial<ReportInput>) { setReports((current) => current.map((report, position) => position === index ? { ...report, ...fields } : report)); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!state?.eligible || busy) return;
    if (effort === null || !perceived || !recovery || discomfort === null) { setError(t('feedback.required')); return; }
    if (discomfort && reports.some((report) => !report.bodyRegion || !report.intensity || Number(report.intensity) < 1 || Number(report.intensity) > 10)) { setError(t('feedback.regionRequired')); return; }
    if (discomfort && new Set(reports.map((report) => report.bodyRegion)).size !== reports.length) { setError(t('feedback.regionUnique')); return; }
    setBusy(true); setError('');
    try {
      const feedback = await api<FeedbackRecord>(`/workout-sessions/${id}/feedback`, { method: 'POST', body: JSON.stringify({
        sessionRpe: effort, perceivedState: perceived, recoveryState: recovery,
        discomfortPresent: discomfort, generalNotes: generalNotes || null,
        discomfortReports: discomfort ? reports.map((report) => ({ bodyRegion: report.bodyRegion, otherLocation: report.bodyRegion === 'OTHER' ? report.otherLocation || null : null, intensity: Number(report.intensity), exerciseId: report.exerciseId || null, notes: report.notes || null })) : [],
      }) });
      setSaved(feedback); setState({ ...state, eligible: false, reason: 'ALREADY_SUBMITTED', feedback });
    } catch (failure) { setError(String(failure)); }
    finally { setBusy(false); }
  }
  if (!me || !state || !session) return <p role="status">{error || t('common.loading')}</p>;
  const earlyDiscomfort = state.earlyEvents.find((event) => event.type === 'DISCOMFORT_OR_PAIN');
  const earlyUnwell = state.earlyEvents.some((event) => event.type === 'FEELING_UNWELL');
  const exerciseNames = Object.fromEntries(state.exercises.map((exercise) => [exercise.exerciseId, exercise.exerciseNameSnapshot]));
  const duration = session.startedAt && session.finishedAt ? Math.max(0, Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000)) : null;
  return <>
    <a href={`/student/workouts/${id}`} className="back">{t('workout.back')}</a>
    <div className="hero"><div className="eyebrow">{t('feedback.eyebrow')}</div><h1>{saved ? t('feedback.successTitle') : t('feedback.title')}</h1><p className="muted">{session.workout.name} · {saved ? t('feedback.saved') : t('feedback.intro')}</p></div>
    {error && <p className="error" role="alert">{error}</p>}
    {saved ? <><section className="card subtle"><h2>{t('feedback.summary')}</h2><p>{enumText(session.status)} · {t('workout.progressSets', { completed: session.progress.completedSets, total: session.progress.totalSets })}</p>{duration !== null && <p>{t('feedback.duration', { minutes: duration })}</p>}<FeedbackSummary feedback={saved} exerciseNames={exerciseNames}/><p className="muted small">{t('feedback.locked')}</p></section><div className="row wrap feedback-navigation"><a className="button" href="/student">{t('common.goHome')}</a><a className="button secondary" href="/student/workouts">{t('workout.historyLink')}</a></div></> : !state.eligible ? <section className="card"><p>{state.reason === 'EXPIRED' ? t('feedback.expired') : t('feedback.invalid')}</p><a href="/student/workouts" className="button secondary">{t('workout.historyLink')}</a></section> : <>
      {state.deadline && <p className="muted small">{t('feedback.deadline', { date: new Date(state.deadline).toLocaleString('es-AR') })}</p>}
      {earlyDiscomfort && <div className="notice">{t('feedback.earlyDiscomfort')}</div>}{earlyUnwell && <div className="notice">{t('feedback.earlyUnwell')}</div>}
      <form className="form feedback-form" onSubmit={(event) => void submit(event)}>
        <section className="card"><h2>{t('feedback.effort')}</h2><div className="choice-grid effort-grid" role="group" aria-label={t('feedback.effort')}>{Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <button type="button" key={value} className={`choice ${effort === value ? 'selected' : ''}`} aria-pressed={effort === value} onClick={() => setEffort(value)}>{value}</button>)}</div><div className="row muted small"><span>{t('feedback.easy')}</span><span>{t('feedback.maximum')}</span></div></section>
        <section className="card"><h2>{t('feedback.perceived')}</h2><div className="choice-grid" role="group" aria-label={t('feedback.perceived')}>{perceivedStateSchema.options.map((value) => <button type="button" key={value} className={`choice ${perceived === value ? 'selected' : ''}`} aria-pressed={perceived === value} onClick={() => setPerceived(value)}>{enumText(value)}</button>)}</div></section>
        <section className="card"><h2>{t('feedback.recovery')}</h2><div className="choice-grid" role="group" aria-label={t('feedback.recovery')}>{recoveryStateSchema.options.map((value) => <button type="button" key={value} className={`choice ${recovery === value ? 'selected' : ''}`} aria-pressed={recovery === value} onClick={() => setRecovery(value)}>{enumText(value)}</button>)}</div></section>
        <section className="card"><h2>{t('feedback.discomfort')}</h2><div className="row wrap"><button type="button" disabled={Boolean(earlyDiscomfort)} className={`choice ${discomfort === false ? 'selected' : ''}`} aria-pressed={discomfort === false} onClick={() => { setDiscomfort(false); setReports([]); }}>{t('feedback.no')}</button><button type="button" className={`choice ${discomfort === true ? 'selected' : ''}`} aria-pressed={discomfort === true} onClick={() => { setDiscomfort(true); if (!reports.length) setReports([blank()]); }}>{t('feedback.yes')}</button></div>
          {discomfort && <><p className="muted small">{t('feedback.professional')}</p>{reports.map((report, index) => <div className="discomfort-entry" key={index}>
            <div className="grid"><label>{t('feedback.where')}<select value={report.bodyRegion} disabled={index === 0 && Boolean(earlyDiscomfort?.bodyRegion)} onChange={(event) => update(index, { bodyRegion: event.target.value, otherLocation: '' })}><option value="">{t('common.choose')}</option>{bodyRegionSchema.options.map((value) => <option key={value} value={value}>{enumText(value)}</option>)}</select></label><label>{t('feedback.intensity')}<input type="number" min={1} max={10} inputMode="numeric" value={report.intensity} onChange={(event) => update(index, { intensity: event.target.value })}/></label></div>
            {report.bodyRegion === 'OTHER' && <label>{t('feedback.otherLocation')}<input maxLength={100} value={report.otherLocation} onChange={(event) => update(index, { otherLocation: event.target.value })}/></label>}
            <label>{t('feedback.relatedExercise')}<select value={report.exerciseId} onChange={(event) => update(index, { exerciseId: event.target.value })}><option value="">{t('feedback.relatedUnknown')}</option>{state.exercises.map((exercise) => <option key={exercise.exerciseId} value={exercise.exerciseId}>{exercise.exerciseNameSnapshot}</option>)}</select></label>
            <label>{t('feedback.discomfortNote')}<textarea rows={2} maxLength={500} value={report.notes} onChange={(event) => update(index, { notes: event.target.value })}/></label>
            {(reports.length > 1 && !(index === 0 && earlyDiscomfort)) && <button type="button" className="button link" onClick={() => setReports((current) => current.filter((_, position) => position !== index))}>{t('feedback.removeRegion')}</button>}
          </div>)}{reports.length < 8 && <button type="button" className="button secondary" onClick={() => setReports((current) => [...current, blank()])}>{t('feedback.addRegion')}</button>}</>}
        </section>
        <section className="card"><label>{t('feedback.generalNotes')}<textarea rows={3} maxLength={1000} value={generalNotes} onChange={(event) => setGeneralNotes(event.target.value)}/></label></section>
        <div className="row wrap"><button className="button" type="submit" disabled={busy}>{busy ? t('feedback.submitting') : t('feedback.submit')}</button><a href="/student" className="button secondary">{t('feedback.skip')}</a></div>
      </form>
    </>}
  </>;
}
