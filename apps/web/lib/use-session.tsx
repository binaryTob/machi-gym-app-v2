'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, Me } from './api';
import { t } from './i18n';
export function useSession(expected: 'STUDENT' | 'COACH') {
  const router = useRouter(); const [me,setMe] = useState<Me | null>(null);
  useEffect(() => { let active = true; api<Me>('/me').then((value) => { if (!active) return; if ((expected === 'STUDENT') !== (value.role === 'STUDENT')) router.replace(value.role === 'STUDENT' ? '/student' : '/trainer'); else setMe(value); }).catch(() => { if (active) router.replace('/login'); }); return () => { active = false; }; }, [expected,router]);
  return me;
}
export function SignOut() { const router = useRouter(); return <button className="button secondary" onClick={() => { void api('/auth/logout', { method: 'POST' }).finally(() => router.replace('/login')); }}>{t('common.signOut')}</button>; }
