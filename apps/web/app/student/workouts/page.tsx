'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { enumText, t } from '../../../lib/i18n';
import { WorkoutList, WorkoutSummary } from '../../../lib/workouts';
import { useSession } from '../../../lib/use-session';

export default function StudentWorkouts() {
  const me = useSession('STUDENT');
  const [items, setItems] = useState<WorkoutSummary[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (!me) return; void api<WorkoutList>('/student/me/workouts').then((result) => { setItems(result.items); setCursor(result.nextCursor); setLoaded(true); }).catch((failure: unknown) => { setError(String(failure)); setLoaded(true); }); }, [me]);
  async function more() { if (!cursor) return; try { const result = await api<WorkoutList>(`/student/me/workouts?cursor=${encodeURIComponent(cursor)}`); setItems((previous) => [...previous, ...result.items]); setCursor(result.nextCursor); } catch (failure) { setError(String(failure)); } }
  if (!me || !loaded) return <p role="status">{t('common.loading')}</p>;
  return <><a href="/student" className="back">{t('workout.back')}</a><div className="hero"><div className="eyebrow">{t('student.eyebrow')}</div><h1>{t('workout.history')}</h1></div>{error && <p className="error" role="alert">{error}</p>}<section className="card roster">{items.length ? items.map((item) => <a key={item.id} href={`/student/workouts/${item.id}`}><span><strong>{item.workoutTemplate.name}</strong><br/><span className="muted small">{item.scheduledDate.slice(0, 10)} · {enumText(item.status)}</span></span><span>{t('workout.view')} →</span></a>) : <p className="muted">{t('workout.noHistory')}</p>}</section>{cursor && <button className="button secondary load-more" onClick={() => void more()}>{t('workout.more')}</button>}</>;
}
