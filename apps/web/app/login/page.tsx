'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { t } from '../../lib/i18n';
export default function Login() {
  const router = useRouter();
  const [email,setEmail] = useState(''); const [password,setPassword] = useState(''); const [totpCode,setTotpCode] = useState(''); const [recoveryCode,setRecoveryCode] = useState(''); const [error,setError] = useState(''); const [busy,setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const result = await api<{ role: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, ...(totpCode ? { totpCode } : {}), ...(recoveryCode ? { recoveryCode } : {}) }) }); router.replace(result.role === 'STUDENT' ? '/student' : '/trainer'); } catch (err) { setError(err instanceof Error ? err.message : t('login.failed')); } finally { setBusy(false); } }
  return <section className="card login"><div className="eyebrow">{t('login.eyebrow')}</div><h1>{t('login.title')}</h1><p className="muted">{t('login.description')}</p><form className="form" onSubmit={submit}><label>{t('login.email')}<input type="email" autoComplete="username" required value={email} onChange={(e)=>setEmail(e.target.value)} /></label><label>{t('login.password')}<input type="password" autoComplete="current-password" required value={password} onChange={(e)=>setPassword(e.target.value)} /></label><label>{t('login.authenticator')}<input inputMode="numeric" pattern="[0-9]{6}" value={totpCode} onChange={(e)=>setTotpCode(e.target.value)} /></label><label>{t('login.recovery')}<input value={recoveryCode} onChange={(e)=>setRecoveryCode(e.target.value)} /></label>{error && <p role="alert" className="error">{error}</p>}<button className="button" disabled={busy}>{busy ? t('login.submitting') : t('login.title')}</button></form></section>;
}
