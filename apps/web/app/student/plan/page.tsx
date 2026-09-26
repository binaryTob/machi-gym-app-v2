'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { enumText, t } from '../../../lib/i18n';
import { StudentProgram } from '../../../lib/plans';
import { SignOut, useSession } from '../../../lib/use-session';

export default function StudentPlan() {
  const me = useSession('STUDENT');
  const [program, setProgram] = useState<StudentProgram | null>(null);
  const [loaded, setLoaded] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (me) void api<StudentProgram | null>('/student/me/plan').then((result) => { setProgram(result); setLoaded(true); }).catch((err: unknown) => { setError(String(err)); setLoaded(true); }); }, [me]);
  if (!me || !loaded) return <p role="status">{t('common.loading')}</p>;
  return <>
    <div className="row wrap hero"><div><div className="eyebrow">{t('plans.eyebrow')}</div><h1>{t('plans.studentTitle')}</h1><p className="muted">{t('plans.studentIntro')}</p></div><SignOut/></div>
    {error && <p role="alert" className="error">{error}</p>}
    {!program ? <section className="card subtle"><h2>{t('plans.studentEmpty')}</h2><a className="button secondary" href="/student">{t('common.goHome')}</a></section> : <>
      <div className="card plan-intro"><div className="eyebrow">{enumText(program.goal)}</div><h2>{program.title}</h2>{program.description && <p className="muted">{program.description}</p>}<span className="badge">{t('plans.sessionCount', { count: program.workouts.length })}</span></div>
      <div className="workout-stack">{program.workouts.map((workout) => <section className="card workout-card" key={workout.id}>
        <div className="row wrap"><div><div className="eyebrow">{workout.dayLabel ?? t('plans.version', { number: workout.order })}</div><h2>{workout.name}</h2></div>{workout.expectedDurationMinutes && <span className="badge">{workout.expectedDurationMinutes} min</span>}</div>
        {workout.description && <p className="muted">{workout.description}</p>}
        <div className="prescription-list">{workout.exercises.map((entry) => <article className="student-prescription" key={`${workout.id}-${entry.exerciseId}`}>
          <div className="student-prescription-visual">{entry.thumbnailUrl ? <img src={entry.thumbnailUrl} alt={t('catalog.mediaAlt', { name: entry.name ?? '' })}/> : <span>{t('catalog.noMedia')}</span>}</div>
          <div className="student-prescription-content"><div className="eyebrow">{entry.order.toString().padStart(2, '0')}</div><h3>{entry.name}</h3><p>{t('plans.repsSummary', { sets: entry.targetSets, min: entry.targetRepsMin, max: entry.targetRepsMax })}{entry.intensityMode === 'RIR' ? ` · RIR ${entry.targetRir}` : entry.intensityMode === 'RPE' ? ` · RPE ${entry.targetRpe}` : ''}</p><p className="muted small">{t('plans.restSummary', { seconds: entry.restSeconds })}{entry.suggestedLoadKg ? ` · ${t('plans.suggestedLoad')}: ${entry.suggestedLoadKg} kg (${t('plans.suggestedNotActual')})` : ''}</p><a href={`/student/exercises/${entry.exerciseId}`}>{t('plans.viewExercise')}</a></div>
        </article>)}</div>
      </section>)}</div>
    </>}
  </>;
}
