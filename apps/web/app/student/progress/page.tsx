'use client';
import { ProgressDashboard } from '../../../components/progress-dashboard';
import { useSession } from '../../../lib/use-session';
export default function StudentProgress() { const me = useSession('STUDENT'); return me ? <><a className="back" href="/student">← Mi inicio</a><ProgressDashboard/></> : <p role="status">Cargando…</p>; }
