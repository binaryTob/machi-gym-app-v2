'use client';
import { useParams } from 'next/navigation';
import { ProgressDashboard } from '../../../../../components/progress-dashboard';
import { useSession } from '../../../../../lib/use-session';
export default function TrainerProgress() { const { id } = useParams<{ id: string }>(); const me = useSession('COACH'); return me ? <><a className="back" href={`/trainer/students/${encodeURIComponent(id)}`}>← Volver al alumno</a><ProgressDashboard studentId={id}/></> : <p role="status">Cargando…</p>; }
