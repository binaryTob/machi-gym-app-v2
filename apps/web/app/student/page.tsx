'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, Student } from '../../lib/api';
import { enumText, t } from '../../lib/i18n';
import { WorkoutHome } from '../../lib/workouts';
import { SignOut, useSession } from '../../lib/use-session';

export default function StudentHome() {
  const me = useSession('STUDENT');
  const [home, setHome] = useState<WorkoutHome | null>(null);
  const [displayName, setDisplayName] = useState(''); const [birthDate, setBirthDate] = useState('');
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { if (!me) return; void api<WorkoutHome>('/student/home').then((data) => { setHome(data); setDisplayName(data.profile.displayName); setBirthDate(data.profile.birthDate?.slice(0, 10) ?? ''); }).catch((failure: unknown) => setError(String(failure))); }, [me]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!home) return; setError('');
    try { const profile = await api<Student>('/student/me/profile', { method: 'PATCH', body: JSON.stringify({ version: home.profile.version, displayName, birthDate: birthDate || null }) }); setHome({ ...home, profile }); setMessage(t('student.saved')); }
    catch (failure) { setError(String(failure)); }
  }
  if (!me || !home) return <p role="status">{t('student.loading')} {error}</p>;
  const current = home.today;
  return <>
    <div className="row wrap hero"><div><div className="eyebrow">{t('student.eyebrow')}</div><h1>{t('student.greeting', { name: home.profile.displayName })}</h1><p className="muted">{t('student.intro')}</p></div><SignOut/></div>
    <section className="card workout-home"><div className="eyebrow">{current?.kind === 'IN_PROGRESS' ? t('workout.inProgress') : current?.kind === 'DUE' ? t('workout.homeEyebrow') : t('workout.homeUpcoming')}</div>
      {current ? <><h2>{current.name}</h2><div className="row wrap"><span className="badge">{current.kind === 'IN_PROGRESS' ? t('workout.progressSets', { completed: current.progress.completedSets, total: current.progress.totalSets }) : t('workout.progressExercises', { completed: 0, total: current.progress.totalExercises })}</span>{current.expectedDurationMinutes && <span>{current.expectedDurationMinutes} min</span>}</div><p className="muted">{current.scheduledDate.slice(0, 10)} · {enumText(current.status)}</p><a className="button" href={`/student/workouts/${current.id}`}>{current.kind === 'IN_PROGRESS' ? t('workout.resume') : current.kind === 'DUE' ? t('workout.start') : t('workout.view')}</a></> : <><h2>{t('workout.homeEmpty')}</h2><a href="/student/plan" className="button secondary">{t('plans.navStudent')}</a></>}
      <p className="muted small">{t('workout.week', { count: home.completedThisWeek })}</p><a href="/student/workouts">{t('workout.historyLink')}</a>
    </section>
    <div className="grid"><section className="card"><h2>{t('student.basic')}</h2><p className="muted small">{t('student.privacy')}</p><form className="form" onSubmit={save}><label>{t('common.name')}<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required/></label><label>{t('common.birthDate')}<input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)}/></label>{message && <p className="success" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}<button className="button">{t('common.save')}</button></form></section>
      <section className="card subtle"><div className="eyebrow">{t('student.context')}</div><h2>{t('student.progress')}</h2><p>{t('student.status')} <strong>{home.profile.status === 'READY' ? t('student.ready') : t('student.pending')}</strong></p><p className="muted">{current ? t('student.next') : t('student.future')}</p><div className="row wrap"><a className="button secondary" href="/student/exercises">{t('catalog.navStudent')}</a>{current && <a className="button secondary" href="/student/plan">{t('plans.navStudent')}</a>}</div></section>
    </div>
  </>;
}
