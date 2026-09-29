'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, Student } from '../../../../lib/api';
import { enumText, t } from '../../../../lib/i18n';
import { useSession } from '../../../../lib/use-session';
import { TrainerWorkoutPanel } from '../../../../components/trainer-workout-panel';

const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const levels = ['BEGINNER', 'NOVICE', 'INTERMEDIATE', 'ADVANCED'];
const goals = ['WEIGHT_LOSS', 'HYPERTROPHY', 'STRENGTH', 'BODY_RECOMPOSITION', 'GENERAL_FITNESS', 'SPORT_PERFORMANCE'];
type Form = { displayName: string; birthDate: string; heightCm: string; trainingFrequencyPerWeek: string; approximateSessionMinutes: string; primaryGoal: string; experienceLevel: string; availableDays: string[] };
const empty: Form = { displayName: '', birthDate: '', heightCm: '', trainingFrequencyPerWeek: '', approximateSessionMinutes: '', primaryGoal: '', experienceLevel: '', availableDays: [] };

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const me = useSession('COACH');
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const load = useCallback(() => {
    void api<Student>(`/students/${encodeURIComponent(id)}`).then((value) => {
      setStudent(value);
      setForm({ displayName: value.displayName, birthDate: value.birthDate?.slice(0, 10) ?? '', heightCm: value.heightCm ?? '', trainingFrequencyPerWeek: String(value.trainingFrequencyPerWeek ?? ''), approximateSessionMinutes: String(value.approximateSessionMinutes ?? ''), primaryGoal: value.primaryGoal ?? '', experienceLevel: value.experienceLevel ?? '', availableDays: value.availableDays });
    }).catch((err: unknown) => setError(String(err)));
  }, [id]);
  useEffect(() => { if (me) load(); }, [me, load]);

  async function save(event: FormEvent) {
    event.preventDefault(); if (!student) return;
    setBusy(true); setError('');
    try {
      await api(`/students/${id}/profile`, { method: 'PATCH', body: JSON.stringify({ version: student.version, displayName: form.displayName, birthDate: form.birthDate || null, heightCm: form.heightCm ? Number(form.heightCm) : null, trainingFrequencyPerWeek: form.trainingFrequencyPerWeek ? Number(form.trainingFrequencyPerWeek) : null, approximateSessionMinutes: form.approximateSessionMinutes ? Number(form.approximateSessionMinutes) : null, primaryGoal: form.primaryGoal || null, experienceLevel: form.experienceLevel || null, availableDays: form.availableDays }) });
      setMessage(t('profile.saved')); load();
    } catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
    finally { setBusy(false); }
  }

  if (!me || !student) return <p role="status">{t('profile.loading')} {error}</p>;
  return <>
    <a className="button secondary" href={`/trainer/students/${encodeURIComponent(id)}/progress`}>Ver progreso →</a>
    <a className="back" href="/trainer">{t('profile.back')}</a>
    <div className="hero"><div className="eyebrow">{t('profile.eyebrow')} · {enumText(student.status)}</div><h1>{student.displayName}</h1><p className="muted">{t('profile.intro')}</p></div>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}
    <div className="grid">
      <section className="card"><h2>{t('profile.training')}</h2><form className="form" onSubmit={save}>
        <label>{t('common.name')}<input required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })}/></label>
        <label>{t('common.birthDate')}<input type="date" value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })}/></label>
        <label>{t('profile.height')}<input type="number" min="50" max="280" value={form.heightCm} onChange={(event) => setForm({ ...form, heightCm: event.target.value })}/></label>
        <label>{t('profile.weekly')}<input type="number" min="1" max="7" value={form.trainingFrequencyPerWeek} onChange={(event) => setForm({ ...form, trainingFrequencyPerWeek: event.target.value })}/></label>
        <label>{t('profile.duration')}<input type="number" min="10" max="240" value={form.approximateSessionMinutes} onChange={(event) => setForm({ ...form, approximateSessionMinutes: event.target.value })}/></label>
        <label>{t('profile.experience')}<select value={form.experienceLevel} onChange={(event) => setForm({ ...form, experienceLevel: event.target.value })}><option value="">{t('common.choose')}</option>{levels.map((level) => <option key={level} value={level}>{enumText(level)}</option>)}</select></label>
        <label>{t('profile.goal')}<select value={form.primaryGoal} onChange={(event) => setForm({ ...form, primaryGoal: event.target.value })}><option value="">{t('common.choose')}</option>{goals.map((goal) => <option key={goal} value={goal}>{enumText(goal)}</option>)}</select></label>
        <fieldset><legend>{t('profile.days')}</legend>{days.map((day) => <label key={day} style={{ display: 'inline-flex', alignItems: 'center', margin: '8px 14px 8px 0' }}><input style={{ width: 18, minHeight: 18, marginRight: 7 }} type="checkbox" checked={form.availableDays.includes(day)} onChange={(event) => setForm({ ...form, availableDays: event.target.checked ? [...form.availableDays, day] : form.availableDays.filter((value) => value !== day) })}/>{enumText(day)}</label>)}</fieldset>
        <button className="button" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
      </form></section>
      <section className="stack">
        <div className="card subtle"><h2>{t('profile.planning')}</h2><p>{student.status === 'READY' ? t('profile.ready') : t('profile.needsReview')}</p><p className="muted small">{t('profile.revision', { number: student.planningRevision })}</p><button className="button secondary" onClick={() => { void api(`/students/${id}/profile/confirm-ready`, { method: 'POST', body: JSON.stringify({ version: student.version }) }).then(() => { setMessage(t('profile.reviewed')); load(); }).catch((err: unknown) => setError(String(err))); }}>{t('profile.confirm')}</button></div>
        <div className="card"><h2>{t('profile.constraints')}</h2>{student.constraints?.length ? student.constraints.map((constraint) => <p key={constraint.id}>{enumText(constraint.type)} · {constraint.description}</p>) : <p className="muted">{t('profile.noConstraints')}</p>}<h3>{t('profile.activity')}</h3>{student.activities?.length ? student.activities.map((activity) => <p key={activity.id}>{activity.name}</p>) : <p className="muted">{t('profile.noActivity')}</p>}</div>
      </section>
    </div>
    <div style={{ marginTop: 22 }}><TrainerWorkoutPanel student={student}/></div>
  </>;
}
