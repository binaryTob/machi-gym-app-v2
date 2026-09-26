'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { goalSchema } from '@machi-gym/contracts';
import { WorkoutEditor } from '../../../../components/workout-editor';
import { api, StudentRow } from '../../../../lib/api';
import { enumText, t } from '../../../../lib/i18n';
import { PlanAssignment, PlanSummary, PlanVersion } from '../../../../lib/plans';
import { useSession } from '../../../../lib/use-session';

const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };

export default function PlanEditor() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const me = useSession('COACH');
  const [plan, setPlan] = useState<PlanSummary | null>(null); const [version, setVersion] = useState<PlanVersion | null>(null);
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [goal, setGoal] = useState('GENERAL_FITNESS');
  const [workoutName, setWorkoutName] = useState(''); const [dayLabel, setDayLabel] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]); const [studentSearch, setStudentSearch] = useState(''); const [studentId, setStudentId] = useState('');
  const [assignment, setAssignment] = useState<PlanAssignment | null>(null); const [startDate, setStartDate] = useState(today()); const [endDate, setEndDate] = useState('');
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async (selectedId?: string) => {
    try {
      const next = await api<PlanSummary>(`/training-plans/${encodeURIComponent(id)}`);
      setPlan(next);
      const chosen = next.versions.find((candidate) => candidate.id === selectedId) ?? next.versions.find((candidate) => candidate.status === 'DRAFT') ?? next.versions.find((candidate) => candidate.status === 'ACTIVE') ?? next.versions[0];
      if (chosen) setVersion(await api<PlanVersion>(`/plan-versions/${chosen.id}`));
      setError('');
    } catch (failure) { setError(String(failure)); }
  }, [id]);
  useEffect(() => { if (me) void load(); }, [me, load]);
  useEffect(() => { if (!version) return; setName(version.title); setDescription(version.description ?? ''); setGoal(version.goal); }, [version?.id, version?.title, version?.description, version?.goal]);
  useEffect(() => { if (!me) return; const timer = setTimeout(() => { void api<{ students: StudentRow[] }>(`/students?q=${encodeURIComponent(studentSearch)}`).then((value) => setStudents(value.students)).catch((failure: unknown) => setError(String(failure))); }, 220); return () => clearTimeout(timer); }, [me, studentSearch]);
  useEffect(() => { if (!studentId) { setAssignment(null); return; } void api<PlanAssignment | null>(`/students/${studentId}/plan-assignment`).then(setAssignment).catch((failure: unknown) => setError(String(failure))); }, [studentId]);

  async function command<T>(path: string, data: Record<string, unknown>): Promise<T | null> {
    setBusy(true); setError('');
    try { return await api<T>(path, { method: 'POST', body: JSON.stringify(data) }); }
    catch (failure) { setError(String(failure)); return null; }
    finally { setBusy(false); }
  }
  async function saveMetadata(event: FormEvent) {
    event.preventDefault(); if (!version) return;
    setBusy(true); setError('');
    try { const updated = await api<PlanVersion>(`/plan-versions/${version.id}`, { method: 'PATCH', body: JSON.stringify({ revision: version.revision, title: name, description: description || null, goal }) }); setVersion(updated); setMessage(t('plans.saved')); }
    catch (failure) { setError(String(failure)); }
    finally { setBusy(false); }
  }
  async function addWorkout(event: FormEvent) {
    event.preventDefault(); if (!version) return;
    const updated = await command<PlanVersion>(`/plan-versions/${version.id}/workouts`, { revision: version.revision, name: workoutName, dayLabel: dayLabel || null });
    if (updated) { setVersion(updated); setWorkoutName(''); setDayLabel(''); setMessage(t('plans.saved')); }
  }
  async function publish() {
    if (!version) return;
    if (!version.workouts.length || version.workouts.some((workout) => !workout.exercises.length)) { setError(t('plans.noWorkouts')); return; }
    const updated = await command<PlanVersion>(`/plan-versions/${version.id}/publish`, { revision: version.revision });
    if (updated) { setVersion(updated); setMessage(t('plans.published')); await load(updated.id); }
  }
  async function newVersion() {
    if (!plan) return;
    const created = await command<PlanVersion>(`/training-plans/${id}/versions`, { planVersion: plan.version });
    if (created) { setVersion(created); await load(created.id); }
  }
  async function duplicate() {
    const created = await command<PlanSummary>(`/training-plans/${id}/duplicate`, {});
    if (created) router.push(`/trainer/plans/${created.id}`);
  }
  async function voidDraft() {
    if (!version) return;
    const reason = window.prompt(t('plans.voidReason'));
    if (!reason) return;
    const updated = await command<PlanVersion>(`/plan-versions/${version.id}/void`, { revision: version.revision, reason });
    if (updated) await load();
  }
  async function archive() {
    if (!plan || !window.confirm(t('plans.archiveConfirm'))) return;
    const updated = await command<PlanSummary>(`/training-plans/${plan.id}/archive`, { version: plan.version });
    if (updated) { setPlan(updated); await load(); }
  }
  async function assign(event: FormEvent) {
    event.preventDefault(); if (!studentId || !plan) return;
    const endpoint = `/students/${studentId}/plan-assignment${assignment ? '/replace' : ''}`;
    const updated = await command<PlanAssignment>(endpoint, { planId: plan.id, startDate, endDate: endDate || null });
    if (updated) { setAssignment(updated); setMessage(assignment ? t('plans.replaced') : t('plans.assigned')); await load(version?.id); }
  }
  async function end() {
    if (!studentId) return;
    const result = await command<{ active: boolean }>(`/students/${studentId}/plan-assignment/end`, {});
    if (result) { setAssignment(null); setMessage(t('plans.assignmentEnded')); await load(version?.id); }
  }
  if (!me || !plan || !version) return <p role="status">{error || t('common.loading')}</p>;
  const draft = version.status === 'DRAFT' && plan.status !== 'ARCHIVED';
  const activeVersion = plan.versions.find((item) => item.status === 'ACTIVE');
  return <>
    <a className="back" href="/trainer/plans">{t('plans.back')}</a>
    <div className="row wrap hero"><div><div className="eyebrow">{t('plans.eyebrow')} · {plan.status === 'ARCHIVED' ? t('plans.archived') : plan.status === 'ACTIVE' ? t('plans.active') : t('plans.draft')}</div><h1>{plan.name}</h1><p className="muted">{enumText(plan.goal)} · {t('plans.version', { number: version.versionNumber })}</p></div><div className="row wrap"><button className="button secondary" disabled={busy} onClick={() => void duplicate()}>{t('plans.duplicate')}</button>{plan.status !== 'ARCHIVED' && (plan.status === 'ACTIVE' || !plan.versions.some((item) => item.status === 'DRAFT')) && <button className="button secondary" disabled={busy} onClick={() => void archive()}>{t('plans.archive')}</button>}</div></div>
    {message && <p role="status" className="success">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
    <div className="plan-version-bar"><label>{t('plans.version', { number: version.versionNumber })}<select value={version.id} onChange={(event) => void load(event.target.value)}>{plan.versions.map((item) => <option key={item.id} value={item.id}>{t('plans.version', { number: item.versionNumber })} · {item.status === 'DRAFT' ? t('plans.draft') : item.status === 'ACTIVE' ? t('plans.active') : item.status === 'RETIRED' ? t('plans.retired') : t('plans.void')}</option>)}</select></label><span className="badge">{t('plans.draftRevision', { number: version.revision })}</span>{!plan.versions.some((item) => item.status === 'DRAFT') && plan.status !== 'ARCHIVED' && <button className="button secondary" onClick={() => void newVersion()}>{t('plans.newRevision')}</button>}</div>
    {draft && <section className="card plan-meta"><form className="form" onSubmit={saveMetadata}><div className="grid three"><label>{t('plans.name')}<input required minLength={3} maxLength={120} value={name} onChange={(event) => setName(event.target.value)}/></label><label>{t('plans.goal')}<select value={goal} onChange={(event) => setGoal(event.target.value)}>{goalSchema.options.map((option) => <option key={option} value={option}>{enumText(option)}</option>)}</select></label><label>{t('plans.description')}<input value={description} maxLength={1500} onChange={(event) => setDescription(event.target.value)}/></label></div><button className="button secondary" disabled={busy}>{t('common.save')}</button></form></section>}
    <div className="row wrap section-header"><div><div className="eyebrow">{t('plans.eyebrow')}</div><h2>{t('plans.workouts')}</h2></div><span className="badge">{t('plans.sessionCount', { count: version.workouts.length })}</span></div>
    {!version.workouts.length && <p className="muted">{t('plans.noWorkouts')}</p>}
    <div className="workout-stack">{version.workouts.map((workout, index) => draft ? <WorkoutEditor key={workout.id} workout={workout} version={version} position={index} total={version.workouts.length} onChanged={setVersion} onError={setError}/> : <section key={workout.id} className="card workout-card"><div className="eyebrow">{workout.dayLabel ?? t('plans.version', { number: workout.order })}</div><h2>{workout.name}</h2><div className="prescription-list">{workout.exercises.map((entry) => <div className="read-only-entry" key={entry.id}><span className="order-circle">{entry.order}</span><div><strong>{entry.exerciseNameSnapshot ?? entry.exercise.name}</strong><p className="muted small">{t('plans.repsSummary', { sets: entry.targetSets, min: entry.targetRepsMin, max: entry.targetRepsMax })} · {t('plans.restSummary', { seconds: entry.restSeconds })}</p></div></div>)}</div></section>)}</div>
    {draft && <><form className="card form add-workout-form" onSubmit={addWorkout}><h3>{t('plans.addWorkout')}</h3><div className="grid"><label>{t('plans.workoutName')}<input required minLength={2} value={workoutName} onChange={(event) => setWorkoutName(event.target.value)}/></label><label>{t('plans.dayLabel')}<input value={dayLabel} maxLength={60} onChange={(event) => setDayLabel(event.target.value)}/></label></div><button disabled={busy} className="button">{t('plans.addWorkout')}</button></form><div className="card subtle publish-panel"><h3>{t('plans.publish')}</h3><p>{t('plans.publishHelp')}</p><div className="row wrap"><button className="button" disabled={busy} onClick={() => void publish()}>{t('plans.publish')}</button><button className="button link" disabled={busy} onClick={() => void voidDraft()}>{t('plans.voidDraft')}</button></div></div></>}
    {activeVersion && <section className="card assignment-panel"><h2>{t('plans.assignTitle')}</h2><p className="muted small">{t('plans.publishHelp')}</p><label>{t('plans.searchStudent')}<input type="search" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)}/></label><form className="form" onSubmit={assign}><div className="grid three"><label>{t('plans.student')}<select value={studentId} onChange={(event) => setStudentId(event.target.value)} required><option value="">{t('common.choose')}</option>{students.map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}</select></label><label>{t('plans.startDate')}<input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)}/></label><label>{t('plans.endDate')}<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)}/></label></div>{studentId && <p className="muted small">{assignment ? `${t('plans.assignmentCurrent')} ${assignment.planVersion.title} (${t('plans.version', { number: assignment.planVersion.versionNumber })})` : t('plans.noAssignment')}</p>}<div className="row wrap"><button className="button" disabled={busy || !studentId}>{assignment ? t('plans.replace') : t('plans.assign')}</button>{assignment && <button type="button" className="button secondary" onClick={() => void end()}>{t('plans.endAssignment')}</button>}</div></form></section>}
  </>;
}
