import { t } from './i18n';
export type Me = { userId: string; membershipId: string; role: 'ADMIN' | 'TRAINER' | 'STUDENT'; displayName: string; studentId: string | null; email: string; mfaEnabled: boolean };
export type Student = { id: string; displayName: string; status: string; version: number; planningRevision: number; birthDate: string | null; heightCm: string | null; trainingFrequencyPerWeek: number | null; availableDays: string[]; approximateSessionMinutes: number | null; activityLevel: string | null; experienceLevel: string | null; primaryGoal: string | null; timezone: string | null; profileReviewedAt: string | null; constraints?: { id: string; type: string; description: string }[]; activities?: { id: string; name: string; weeklyFrequency: number | null }[] };
export type StudentRow = { id: string; displayName: string; status: string; onboarded: boolean; version: number };
function csrf(): string { return decodeURIComponent(document.cookie.split('; ').find((value) => value.startsWith('machi_csrf='))?.split('=')[1] ?? ''); }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(!['GET', 'HEAD'].includes(options.method ?? 'GET') ? { 'X-CSRF-Token': csrf() } : {}), ...options.headers } });
  const payload: unknown = await response.json();
  if (!response.ok) {
    // API problem details are stable codes; do not display backend English strings.
    throw new Error(response.status === 403 ? t('common.forbidden') : response.status === 409 ? t('common.conflict') : t('common.error'));
  }
  return (payload as { data: T }).data;
}
