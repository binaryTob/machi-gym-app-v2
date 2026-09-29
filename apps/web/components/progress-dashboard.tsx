'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { enumText } from '../lib/i18n';

type Weight = { date: string; weightKg: number };
type Adherence = { eligible: number; scheduled: number; completed: number; partial: number; skipped: number; cancelled: number; pending: number; adherencePercent: number | null };
type Metrics = {
  studentName: string; primaryGoal: string | null; timezone: string; period: { start: string; end: string }; adherence: Adherence;
  weights: { start: Weight | null; end: Weight | null; deltaKg: number | null; history: Weight[] };
  volume: { volumeKgReps: number | null; comparableSets: number };
  feedback: { sampleSize: number; averageRpe: number | null; recovery: Record<string, number> };
  duration: { sampleSize: number; totalMinutes: number | null };
  partialReasons: Record<string, number>;
  discomfortLast30Days: { bodyRegion: string; count: number; averageIntensity: number | null; lastReportedAt: string; exercises: { name: string; count: number }[] }[];
  exerciseProgress: { exerciseId: string; name: string; previous: { loadKg: number; reps: number } | null; current: { loadKg: number; reps: number }; comparison: { kind: string; delta: number } | null }[];
  previousMonth: { adherence: Adherence; weights: { end: Weight | null }; feedback: { averageRpe: number | null; sampleSize: number } } | null;
};
const number = (value: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value);
const minutes = (value: number) => `${Math.floor(value / 60)} h ${Math.round(value % 60)} min`;
const setText = (set: { loadKg: number; reps: number }) => `${number(set.loadKg)} kg × ${set.reps}`;
const labels: Record<string, string> = { 'current-month': 'Mes actual', 'previous-month': 'Mes anterior', 'current-week': 'Semana actual', 'previous-week': 'Semana anterior', 'last-30-days': 'Últimos 30 días', custom: 'Período personalizado' };
const canFinalize = (month: string) => /^\d{4}-\d{2}$/.test(month) && Date.now() >= Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1) + 48 * 3_600_000;

function WeightChart({ history }: { history: Weight[] }) {
  if (history.length < 2) return <p className="muted">Necesitamos al menos dos registros de peso en este período para mostrar el cambio.</p>;
  const low = Math.min(...history.map((row) => row.weightKg)); const high = Math.max(...history.map((row) => row.weightKg));
  const points = history.map((row, index) => `${16 + index * 268 / (history.length - 1)},${68 - 48 * (row.weightKg - low) / (high - low || 1)}`).join(' ');
  return <><svg viewBox="0 0 300 86" role="img" aria-label="Evolución del peso registrado" style={{ width: '100%', maxWidth: 440 }}><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2"/>
    {history.map((row, index) => <circle key={`${row.date}-${index}`} cx={16 + index * 268 / (history.length - 1)} cy={68 - 48 * (row.weightKg - low) / (high - low || 1)} r="4" fill="currentColor"/>)}</svg>
    <ul>{history.map((row, index) => <li key={`${row.date}-${index}`}>{row.date}: {number(row.weightKg)} kg</li>)}</ul></>;
}

export function ProgressDashboard({ studentId }: { studentId?: string }) {
  const base = studentId ? `/students/${encodeURIComponent(studentId)}/analytics` : '/student/me/analytics';
  const [period, setPeriod] = useState('current-month'); const [start, setStart] = useState(''); const [end, setEnd] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(''); const [report, setReport] = useState<{ finalized: boolean; metrics: Metrics; revision: number | null } | null>(null);
  const [summary, setSummary] = useState<Metrics | null>(null); const [error, setError] = useState('');
  useEffect(() => { let alive = true; const query = new URLSearchParams({ period }); if (period === 'custom') { if (!start || !end) return; query.set('start', start); query.set('end', end); }
    void api<Metrics>(`${base}?${query}`).then((data) => { if (alive) { setSummary(data); setError(''); } }).catch((failure: unknown) => { if (alive) setError(String(failure)); });
    return () => { alive = false; };
  }, [base, period, start, end]);
  async function openMonth(month: string) { if (!/^\d{4}-\d{2}$/.test(month)) return; setSelectedMonth(month);
    try { setReport(await api<{ finalized: boolean; metrics: Metrics; revision: number | null }>(`${base}/monthly/${month.slice(0, 4)}/${Number(month.slice(5))}`)); setError(''); }
    catch (failure) { setError(String(failure)); }
  }
  async function finalizeMonth() { if (!studentId || !selectedMonth) return;
    try { const saved = await api<{ finalized: boolean; metrics: Metrics; revision: number | null }>(`${base}/monthly/${selectedMonth.slice(0, 4)}/${Number(selectedMonth.slice(5))}/finalize`, { method: 'POST' }); setReport(saved); setError(''); }
    catch (failure) { setError(String(failure)); }
  }
  const data = report?.metrics ?? summary;
  return <div className="stack">
    <div className="hero"><div className="eyebrow">PROGRESO REGISTRADO</div><h1>{studentId ? `Progreso de ${summary?.studentName ?? 'tu alumno'}` : 'Mi progreso'}</h1><p className="muted">Datos registrados, sin puntajes ni estimaciones. Cada período usa el huso horario del alumno.</p>{data?.primaryGoal && <p className="muted small">Objetivo declarado: {enumText(data.primaryGoal)}. {data.primaryGoal === 'WEIGHT_LOSS' ? 'Consultá el historial de peso junto a tus entrenamientos.' : data.primaryGoal === 'STRENGTH' ? 'Consultá las series realizadas en la progresión por ejercicio.' : 'Consultá tus sesiones y tendencias sin reducir el objetivo a una cifra.'}</p>}</div>
    <section className="card"><label>Período <select value={period} onChange={(event) => { setPeriod(event.target.value); setReport(null); }}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {period === 'custom' && <div className="row wrap"><label>Desde<input type="date" value={start} onChange={(event) => setStart(event.target.value)}/></label><label>Hasta<input type="date" value={end} onChange={(event) => setEnd(event.target.value)}/></label></div>}
      <label>Resumen mensual <input type="month" value={selectedMonth} onChange={(event) => void openMonth(event.target.value)}/></label>
      {report && <p className="muted">{report.finalized ? `Informe finalizado · revisión ${report.revision}` : 'Informe provisional calculado desde los registros actuales'}. {studentId && !report.finalized && canFinalize(selectedMonth) && <button type="button" className="button secondary" onClick={() => void finalizeMonth()}>Finalizar informe del mes cerrado</button>} <button type="button" className="button secondary" onClick={() => setReport(null)}>Volver al período</button></p>}
    </section>
    {error && <p className="error" role="alert">{error}</p>}
    {!data ? <p role="status">Cargando progreso…</p> : <>
      <section className="card"><div className="eyebrow">{data.period.start} → {data.period.end} (fin excluido) · {data.timezone}</div><h2>Resumen del período</h2>
        <div className="grid"><div><h3>Entrenamientos</h3><p>{data.adherence.completed + data.adherence.partial} de {data.adherence.eligible} elegibles · {data.adherence.adherencePercent === null ? 'Sin sesiones elegibles' : `${number(data.adherence.adherencePercent)}% adherencia`}</p>
          <p className="muted small">{data.adherence.completed} completos · {data.adherence.partial} parciales · {data.adherence.skipped} omitidos · {data.adherence.cancelled} cancelados · {data.adherence.pending} pendientes vencidos. {data.adherence.scheduled} programados hasta hoy.</p></div>
          <div><h3>Peso registrado</h3><p>{data.weights.end ? `${number(data.weights.end.weightKg)} kg` : 'Sin mediciones en el período'}</p><p className="muted small">{data.weights.deltaKg === null ? 'Sin datos suficientes para calcular el cambio.' : `${number(data.weights.start!.weightKg)} → ${number(data.weights.end!.weightKg)} kg · ${data.weights.deltaKg > 0 ? '+' : ''}${number(data.weights.deltaKg)} kg`}</p></div>
          <div><h3>RPE promedio</h3><p>{data.feedback.averageRpe === null ? 'Sin feedback' : `${number(data.feedback.averageRpe)} / 10`}</p><p className="muted small">Basado en {data.feedback.sampleSize} sesiones con respuestas</p></div>
          <div><h3>Tiempo entrenado</h3><p>{data.duration.totalMinutes === null ? 'Sin duraciones válidas' : minutes(data.duration.totalMinutes)}</p><p className="muted small">{data.duration.sampleSize} sesiones con inicio y fin válidos (1–360 min)</p></div></div>
        {data.previousMonth && <p className="muted small">Mes anterior: adherencia {data.previousMonth.adherence.adherencePercent === null ? 'sin sesiones elegibles' : `${number(data.previousMonth.adherence.adherencePercent)}%`} · RPE {data.previousMonth.feedback.averageRpe === null ? 'sin feedback' : `${number(data.previousMonth.feedback.averageRpe)} (${data.previousMonth.feedback.sampleSize} sesiones)`} · peso final {data.previousMonth.weights.end ? `${number(data.previousMonth.weights.end.weightKg)} kg` : 'sin registro'}. {data.previousMonth.weights.end && data.weights.end ? `Peso final entre meses: ${number(data.previousMonth.weights.end.weightKg)} → ${number(data.weights.end.weightKg)} kg (${data.weights.end.weightKg - data.previousMonth.weights.end.weightKg > 0 ? '+' : ''}${number(data.weights.end.weightKg - data.previousMonth.weights.end.weightKg)} kg).` : 'Sin dos pesos finales para comparar meses.'}</p>}
      </section>
      <section className="card"><h2>Progresión por ejercicio</h2><p className="muted small">Mejor serie por carga registrada en cada mes; misma carga compara repeticiones. Solo series completadas. Una comparación sin mismas repeticiones o carga no expresa un cambio comparable.</p>
        {data.exerciseProgress.length ? data.exerciseProgress.map((row) => <div key={row.exerciseId}><h3>{row.name}</h3><p>{row.previous ? `${setText(row.previous)} → ` : 'Sin registro anterior · '}{setText(row.current)}{row.comparison ? ` · ${row.comparison.delta > 0 ? '+' : ''}${number(row.comparison.delta)} ${row.comparison.kind === 'LOAD' ? 'kg a iguales repeticiones' : 'repeticiones a igual carga'}` : ''}</p></div>) : <p className="muted">Todavía no hay series con carga realizada en este período.</p>}
        <h3>Volumen de carga externa registrado</h3><p>{data.volume.volumeKgReps === null ? 'Sin series de carga externa comparables' : `${number(data.volume.volumeKgReps)} kg × repeticiones (${data.volume.comparableSets} series)`}</p><p className="muted small">Suma de carga real × repeticiones en ejercicios de carga externa; no mide la calidad del entrenamiento.</p>
      </section>
      <section className="card"><h2>Historial de peso</h2><WeightChart history={data.weights.history}/></section>
      <div className="grid"><section className="card"><h2>Recuperación declarada</h2>{Object.keys(data.feedback.recovery).length ? <ul>{Object.entries(data.feedback.recovery).map(([state, count]) => <li key={state}>{enumText(state)}: {count}</li>)}</ul> : <p className="muted">Sin feedback en este período.</p>}
        <h3>Sesiones parciales</h3>{Object.keys(data.partialReasons).length ? <ul>{Object.entries(data.partialReasons).map(([reason, count]) => <li key={reason}>{enumText(reason)}: {count}</li>)}</ul> : <p className="muted">Sin sesiones parciales registradas.</p>}</section>
        <section className="card"><h2>Molestias reportadas</h2><p className="muted small">Últimos 30 días · declaraciones del alumno, no diagnósticos.</p>{data.discomfortLast30Days.length ? data.discomfortLast30Days.map((row) => <p key={row.bodyRegion}>{enumText(row.bodyRegion)}: molestia reportada {row.count} {row.count === 1 ? 'vez' : 'veces'} · {row.averageIntensity === null ? 'intensidad no informada' : `intensidad promedio ${number(row.averageIntensity)} / 10`} · última {row.lastReportedAt.slice(0, 10)}{row.exercises.length ? ` · ${row.exercises.map((exercise) => `${exercise.name} (${exercise.count})`).join(', ')}` : ''}</p>) : <p className="muted">Sin molestias reportadas en los últimos 30 días.</p>}</section></div>
    </>}
  </div>;
}
