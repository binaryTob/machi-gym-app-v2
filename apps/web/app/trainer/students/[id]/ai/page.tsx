'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { type AiProposal } from '@machi-gym/contracts';
import { equipmentSchema } from '@machi-gym/contracts';
import { api } from '../../../../../lib/api';
import { type PlanVersion } from '../../../../../lib/plans';
import { useSession } from '../../../../../lib/use-session';

type Record = { id: string; type: 'INITIAL' | 'ADAPTATION'; status: string; revision: number; sourceVersionId: string | null; approvedVersionId: string | null;
  originalProposal: AiProposal | null; editedProposal: AiProposal | null; validationResult: { valid: boolean; errors: string[] }; createdAt: string;
  contextSummary: { period: { start: string; end: string }; adherencePercent: number | null; averageRpe: number | null; terminalSessions: number; discomfort: { bodyRegion: string; count: number }[]; sourceVersionId: string | null }; catalog: { id: string; name: string }[] };
type Preview = { student: { goal: string | null; frequency: number | null; sessionMinutes: number | null }; analytics: { adherencePercent: number | null; averageRpe: number | null; terminalSessions: number; discomfort: { bodyRegion: string; count: number }[] }; allowedExercises: { exerciseId: string; name: string; equipment: string[] }[] };

export default function TrainingAiReview() {
  const { id } = useParams<{ id: string }>(); const me = useSession('COACH');
  const [enabled, setEnabled] = useState(false); const [records, setRecords] = useState<Record[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null); const [excluded, setExcluded] = useState<string[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record | null>(null); const [draft, setDraft] = useState<AiProposal | null>(null);
  const [current, setCurrent] = useState<PlanVersion | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [approvedPlanId, setApprovedPlanId] = useState<string | null>(null);
  const load = useCallback(async (proposalId?: string) => {
    try {
      const list = await api<Record[]>(`/students/${encodeURIComponent(id)}/ai-proposals`);
      setRecords(list);
      const target = proposalId ?? list[0]?.id;
      if (!target) return;
      const detail = await api<Record>(`/ai-proposals/${encodeURIComponent(target)}`);
      setSelected(detail); setDraft(detail.editedProposal ?? detail.originalProposal);
      setCurrent(detail.sourceVersionId ? await api<PlanVersion>(`/plan-versions/${detail.sourceVersionId}`) : null);
      setApprovedPlanId(detail.approvedVersionId ? (await api<PlanVersion>(`/plan-versions/${detail.approvedVersionId}`)).trainingPlanId : null);
    } catch (failure) { setError(String(failure)); }
  }, [id]);
  useEffect(() => { if (me) { void api<{ enabled: boolean }>('/trainer/ai/availability').then((value) => setEnabled(value.enabled)).catch((failure: unknown) => setError(String(failure)));
    void api<Preview>(`/students/${encodeURIComponent(id)}/ai-context`).then(setPreview).catch((failure: unknown) => setError(String(failure))); void load(); } }, [me, id, load]);
  async function act(action: 'request' | 'retry' | 'edit' | 'reject' | 'approve', type?: 'INITIAL' | 'ADAPTATION') {
    if (!me) return;
    setBusy(true); setError('');
    try {
      if (action === 'request') {
        const result = await api<Record>(`/students/${encodeURIComponent(id)}/ai-proposals`, { method: 'POST', body: JSON.stringify({ type, requestKey: crypto.randomUUID(), excludedExerciseIds: excluded, unavailableEquipment: unavailable }) });
        await load(result.id);
      } else if (selected) {
        const base = `/ai-proposals/${selected.id}`;
        if (action === 'edit' && draft) await api(base, { method: 'PATCH', body: JSON.stringify({ revision: selected.revision, proposal: draft }) });
        if (action === 'reject') { const reason = window.prompt('Motivo de rechazo'); if (!reason) return; await api(`${base}/reject`, { method: 'POST', body: JSON.stringify({ revision: selected.revision, reason }) }); }
        if (action === 'retry') await api(`${base}/retry`, { method: 'POST', body: JSON.stringify({ revision: selected.revision }) });
        if (action === 'approve') await api(`${base}/approve`, { method: 'POST', body: JSON.stringify({ revision: selected.revision }) });
        await load(selected.id);
      }
    } catch (failure) { setError(String(failure)); }
    finally { setBusy(false); }
  }
  function editExercise(workoutIndex: number, exerciseIndex: number, patch: Partial<AiProposal['workouts'][number]['exercises'][number]>) {
    if (!draft) return;
    setDraft({ ...draft, workouts: draft.workouts.map((workout, index) => index === workoutIndex ? { ...workout,
      exercises: workout.exercises.map((exercise, position) => position === exerciseIndex ? { ...exercise, ...patch } : exercise) } : workout) });
  }
  if (!me) return <p role="status">Cargando…</p>;
  const facts = selected?.contextSummary;
  const name = (exerciseId: string) => selected?.catalog.find((row) => row.id === exerciseId)?.name ?? current?.workouts.flatMap((row) => row.exercises).find((row) => row.exerciseId === exerciseId)?.exercise.name ?? 'Ejercicio no disponible';
  return <div className="stack">
    <a className="back" href={`/trainer/students/${encodeURIComponent(id)}/progress`}>← Volver al progreso</a>
    <div className="hero"><div className="eyebrow">Revisión del entrenador</div><h1>Propuestas con IA</h1><p>La IA sólo sugiere. Aprobar crea un borrador; publicar y asignar son decisiones separadas.</p></div>
    {error && <p role="alert" className="error">{error}</p>}
    {!enabled && <p className="notice">La generación con IA no está configurada. Los programas manuales siguen disponibles.</p>}
    {preview && <section className="card"><h2>Contexto seleccionado</h2><p>Objetivo: {preview.student.goal ?? 'sin declarar'} · Frecuencia: {preview.student.frequency ?? 'sin declarar'} · Duración: {preview.student.sessionMinutes ?? 'sin declarar'} min.</p>
      <p>Últimos treinta días: {preview.analytics.terminalSessions} sesiones finalizadas · Adherencia: {preview.analytics.adherencePercent === null ? 'sin datos' : `${preview.analytics.adherencePercent}%`} · RPE: {preview.analytics.averageRpe ?? 'sin datos'}.</p>
      {preview.analytics.discomfort.map((row) => <p key={row.bodyRegion}>Molestia declarada {row.bodyRegion}: {row.count} reportes.</p>)}
      {enabled && <><h3>Límites explícitos para la generación</h3><p className="muted">Excluí ejercicios y marcá equipamiento no disponible antes de enviar los datos al proveedor.</p>
        <details><summary>Ejercicios excluidos</summary>{preview.allowedExercises.map((item) => <label key={item.exerciseId} style={{ display: 'block' }}><input type="checkbox" checked={excluded.includes(item.exerciseId)} onChange={(event) => setExcluded(event.target.checked ? [...excluded, item.exerciseId] : excluded.filter((entry) => entry !== item.exerciseId))}/>{item.name}</label>)}</details>
        <details><summary>Equipamiento no disponible</summary>{equipmentSchema.options.map((item) => <label key={item} style={{ display: 'block' }}><input type="checkbox" checked={unavailable.includes(item)} onChange={(event) => setUnavailable(event.target.checked ? [...unavailable, item] : unavailable.filter((entry) => entry !== item))}/>{item}</label>)}</details>
      </>}
    </section>}
    {enabled && <div className="row wrap"><button className="button" disabled={busy} onClick={() => void act('request', 'INITIAL')}>Generar propuesta inicial</button><button className="button secondary" disabled={busy} onClick={() => void act('request', 'ADAPTATION')}>Adaptar rutina actual</button></div>}
    {busy && <p role="status">Generando o guardando propuesta…</p>}
    {records.length > 0 && <label>Historial de propuestas<select value={selected?.id ?? ''} onChange={(event) => void load(event.target.value)}>{records.map((row) => <option key={row.id} value={row.id}>{row.type === 'INITIAL' ? 'Inicial' : 'Adaptación'} · {row.status} · {new Date(row.createdAt).toLocaleDateString('es-AR')}</option>)}</select></label>}
    {selected && <><section className="card"><h2>{selected.type === 'INITIAL' ? 'Propuesta inicial basada en perfil' : 'Adaptación basada en progreso'} · {selected.status}</h2>
      <p className="muted">Registros considerados: {facts?.period.start} a {facts?.period.end}. Sesiones finalizadas: {facts?.terminalSessions}. Adherencia: {facts?.adherencePercent === null ? 'sin datos' : `${facts?.adherencePercent}%`}. RPE: {facts?.averageRpe === null ? 'sin datos' : facts?.averageRpe}.</p>
      {facts?.discomfort.map((row) => <p key={row.bodyRegion}>Molestia reportada ({row.bodyRegion}): {row.count} reportes. Observación, no diagnóstico.</p>)}
      {selected.validationResult.errors.map((message) => <p role="alert" key={message}>{message}</p>)}
      {['PROVIDER_FAILED', 'VALIDATION_FAILED'].includes(selected.status) && enabled && <button className="button" disabled={busy} onClick={() => void act('retry')}>Reintentar generación</button>}
    </section>
    {draft && <><section className="card"><h2>Comparación y revisión</h2><p>{draft.summary}</p>
      {selected.status === 'READY' && <label>Nombre del plan<input value={draft.planName} onChange={(event) => setDraft({ ...draft, planName: event.target.value })}/></label>}
      {draft.workouts.map((workout, index) => {
        const previous = current?.workouts[index]; const old = previous?.exercises ?? [];
        return <div className="card subtle" key={index}><h3>{workout.name}</h3><p className="muted">{workout.reason} · Duración prevista: {workout.estimatedDurationMinutes} min</p>
          {workout.exercises.map((entry, position) => {
            const before = old.find((item) => item.exerciseId === entry.exerciseId);
            const changes = !before ? 'Añadido' : [before.targetSets !== entry.sets && `Series ${before.targetSets} → ${entry.sets}`,
              (before.targetRepsMin !== entry.repsMin || before.targetRepsMax !== entry.repsMax) && `Repeticiones ${before.targetRepsMin}–${before.targetRepsMax} → ${entry.repsMin}–${entry.repsMax}`,
              before.restSeconds !== entry.restSeconds && `Descanso ${before.restSeconds} → ${entry.restSeconds}`,
              before.targetRir !== entry.targetRir && `RIR ${before.targetRir ?? 'sin objetivo'} → ${entry.targetRir ?? 'sin objetivo'}`].filter(Boolean).join(' · ') || 'Sin cambios';
            return <div key={position} className="read-only-entry"><div><strong>{name(entry.exerciseId)}</strong><p>{changes}</p><p className="muted">{entry.reason}</p>
              {selected.status === 'READY' && <div className="row wrap"><label>Ejercicio<select value={entry.exerciseId} onChange={(event) => editExercise(index, position, { exerciseId: event.target.value })}>{selected.catalog.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                <label>Series<input type="number" min="1" max="6" value={entry.sets} onChange={(event) => editExercise(index, position, { sets: Number(event.target.value) })}/></label>
                <label>Reps mínimas<input type="number" min="1" max="30" value={entry.repsMin} onChange={(event) => editExercise(index, position, { repsMin: Number(event.target.value) })}/></label>
                <label>Reps máximas<input type="number" min="1" max="30" value={entry.repsMax} onChange={(event) => editExercise(index, position, { repsMax: Number(event.target.value) })}/></label>
                <label>Descanso (s)<input type="number" min="30" max="300" value={entry.restSeconds} onChange={(event) => editExercise(index, position, { restSeconds: Number(event.target.value) })}/></label>
                {entry.intensityMode === 'RIR' && <label>RIR<input type="number" min="0" max="10" value={entry.targetRir ?? ''} onChange={(event) => editExercise(index, position, { targetRir: Number(event.target.value) })}/></label>}
              </div>}</div></div>;
          })}
          {old.filter((entry) => !workout.exercises.some((item) => item.exerciseId === entry.exerciseId)).map((entry) => <p key={entry.id} className="muted">Eliminado: {entry.exercise.name}</p>)}
        </div>;
      })}</section>
      {selected.status === 'READY' && <div className="row wrap"><button className="button secondary" disabled={busy} onClick={() => void act('edit')}>Guardar edición</button><button className="button" disabled={busy || JSON.stringify(draft) !== JSON.stringify(selected.editedProposal ?? selected.originalProposal)} onClick={() => void act('approve')}>Aprobar y crear borrador</button><button className="button secondary" disabled={busy} onClick={() => void act('reject')}>Rechazar</button></div>}
      {approvedPlanId && <a className="button" href={`/trainer/plans/${approvedPlanId}`}>Ver borrador y publicar por separado →</a>}
    </>}
    </>}
  </div>;
}
