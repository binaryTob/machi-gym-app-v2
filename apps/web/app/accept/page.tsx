'use client';
import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';
import { t } from '../../lib/i18n';
function AcceptForm() {
  const params = useSearchParams(); const [password,setPassword] = useState(''); const [state,setState] = useState(''); const [busy,setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { await api('/auth/accept-invitation', { method: 'POST', body: JSON.stringify({ token: params.get('token'), password }) }); setState(t('accept.success')); } catch (err) { setState(err instanceof Error ? err.message : t('accept.failed')); } finally { setBusy(false); } }
  return <section className="card login"><div className="eyebrow">{t('accept.eyebrow')}</div><h1>{t('accept.title')}</h1><form className="form" onSubmit={submit}><label>{t('accept.password')}<input type="password" minLength={12} autoComplete="new-password" value={password} onChange={(e)=>setPassword(e.target.value)} required /></label><button className="button" disabled={busy || !params.get('token')}>{t('accept.submit')}</button></form>{state && <p role="status">{state} <a href="/login">{t('login.title')}</a></p>}</section>;
}
export default function Accept() { return <Suspense fallback={<p>{t('common.loading')}</p>}><AcceptForm /></Suspense>; }
