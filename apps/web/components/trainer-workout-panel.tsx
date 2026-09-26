'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, Student } from '../lib/api';
import { RecentSignals } from '../lib/feedback';
import { enumText, t } from '../lib/i18n';
import { PlanAssignment, PlanVersion } from '../lib/plans';
import { WorkoutDetail, WorkoutList } from '../lib/workouts';

const localDate = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

export function TrainerWorkoutPanel({ student }: { student: Student }) {
  const [assignment, setAssignment] = useState<PlanAssignment | null>(null);
  const [version, setVersion] = useState<PlanVersion | null>(null);
  const [sessions, setSessions] = useState<WorkoutList['items']>([]);
  const [signals, setSignals] = useState<RecentSignals | null>(null);
  const [templateId, setTemplateId] = useState(''); const [date, setDate] = useState(localDate());
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const scheduleKey = useRef<string | null>(null);
  const load = useCallback(() => {
    void api<PlanAssignment | null>(`/students/${student.id}/plan-assignment`).then((result) => { setAssignment(result); if (result) void api<PlanVersion>(`/plan-versions/${result.planVersion.id}`).then((details) => { setVersion(details); setTemplateId((current) => details.workouts.some((workout) => workout.id === current) ? current : details.workouts[0]?.id ?? ''); }).catch((failure: unknown) => setError(String(failure))); else setVersion(null); }).catch((failure: unknown) => setError(String(failure)));
    void api<WorkoutList>(`/students/${student.id}/workout-sessions`).then((result) => setSessions(result.items)).catch((failure: unknown) => setError(String(failure)));
    void api<RecentSignals>(`/students/${student.id}/feedback-signals`).then(setSignals).catch((failure: unknown) => setError(String(failure)));
  }, [student.id]);
  useEffect(() => load(), [load]);
  async function schedule(event: FormEvent) {
    event.preventDefault(); if (!templateId) return;
    setBusy(true); setError(''); if (!scheduleKey.current) scheduleKey.current = crypto.randomUUID();
    try {
      const result = await api<WorkoutDetail & { availabilityWarning: boolean }>(`/students/${student.id}/workout-sessions`, { method: 'POST', body: JSON.stringify({ workoutTemplateId: templateId, scheduledDate: date, requestKey: scheduleKey.current }) });
      setMessage(result.availabilityWarning ? `${t('workout.scheduled')} ${t('workout.outsideAvailability')}` : t('workout.scheduled'));
      scheduleKey.current = null; load();
    } catch (failure) { setError(String(failure)); }
    finally { setBusy(false); }
  }
  return <section className="card trainer-workouts"><div className="eyebrow">{t('workout.trainerSessions')}</div><h2>{t('workout.schedule')}</h2>
    {!assignment || !version ? <p className="muted">{t('workout.noAssignment')} <a href="/trainer/plans">{t('plans.navTrainer')}</a></p> : <form className="form" onSubmit={schedule}>
      <p className="muted small">{assignment.planVersion.title} · {student.availableDays.length ? student.availableDays.map(enumText).join(' / ') : t('workout.flexibleDays')}</p>
      <div className="grid"><label>{t('workout.chooseTemplate')}<select required value={templateId} onChange={(event) => { setTemplateId(event.target.value); scheduleKey.current = null; }}>{version.workouts.map((workout) => <option key={workout.id} value={workout.id}>{workout.name}{workout.dayLabel ? ` · ${workout.dayLabel}` : ''}</option>)}</select></label><label>{t('workout.scheduledDate')}<input type="date" required value={date} onChange={(event) => { setDate(event.target.value); scheduleKey.current = null; }}/></label></div>
      <button className="button" disabled={busy || !templateId}>{busy ? t('common.saving') : t('workout.scheduleSubmit')}</button>
    </form>}
    {message && <p className="success" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    {signals && <div className="signal-strip"><div className="eyebrow">{t('feedback.trainerRecent')}</div>{signals.latestFeedback && <p>{t('feedback.effortReported', { value: signals.latestFeedback.sessionRpe })} · {t('feedback.recoveryReported', { value: enumText(signals.latestFeedback.recoveryState) })}</p>}{signals.latestDiscomfort && <p>{t('feedback.discomfortReported')}: {signals.latestDiscomfort.bodyRegion ? enumText(signals.latestDiscomfort.bodyRegion) : t('feedback.unknownLocation')}{signals.latestDiscomfort.intensity ? ` · ${signals.latestDiscomfort.intensity}/10` : ''}</p>}<p className="muted small">{t('feedback.sessionsWithDiscomfort', { count: signals.sessionsWithDiscomfort28Days })}</p></div>}
    <h3>{t('workout.trainerSessions')}</h3>{sessions.length ? <div className="roster">{sessions.map((session) => <a href={`/trainer/workouts/${session.id}`} key={session.id}><span><strong>{session.workoutTemplate.name}</strong><br/><span className="muted small">{session.scheduledDate.slice(0, 10)} · {enumText(session.status)}</span></span><span>{t('workout.view')} →</span></a>)}</div> : <p className="muted">{t('workout.trainerEmpty')}</p>}
  </section>;
}
