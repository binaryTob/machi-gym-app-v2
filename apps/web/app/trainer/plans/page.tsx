'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { goalSchema } from '@machi-gym/contracts';
import { api } from '../../../lib/api';
import { enumText, t } from '../../../lib/i18n';
import { PlanList, PlanSummary } from '../../../lib/plans';
import { SignOut, useSession } from '../../../lib/use-session';

export default function PlanLibrary() {
  const me = useSession('COACH'); const router = useRouter();
  const [items, setItems] = useState<PlanSummary[]>([]);
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [goal, setGoal] = useState<string>('GENERAL_FITNESS');
  const [search, setSearch] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!me) return; const timer = setTimeout(() => { void api<PlanList>(`/training-plans?q=${encodeURIComponent(search)}`).then((data) => { setItems(data.items); setError(''); }).catch((err: unknown) => setError(String(err))); }, 220); return () => clearTimeout(timer); }, [me, search]);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const plan = await api<PlanSummary>('/training-plans', { method: 'POST', body: JSON.stringify({ name, description: description || null, goal }) }); router.push(`/trainer/plans/${plan.id}`); }
    catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
    finally { setBusy(false); }
  }
  if (!me) return <p role="status">{t('common.loading')}</p>;
  return <>
    <a className="back" href="/trainer">{t('profile.back')}</a>
    <div className="row wrap hero"><div><div className="eyebrow">{t('plans.eyebrow')}</div><h1>{t('plans.listTitle')}</h1><p className="muted">{t('plans.listIntro')}</p></div><SignOut/></div>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="grid"><section className="card"><label>{t('catalog.search')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)}/></label><div className="roster">{items.length ? items.map((plan) => <a key={plan.id} href={`/trainer/plans/${plan.id}`}><span><strong>{plan.name}</strong><br/><span className="muted small">{enumText(plan.goal)} · {plan.status === 'ACTIVE' ? t('plans.active') : plan.status === 'ARCHIVED' ? t('plans.archived') : t('plans.draft')}</span></span><span>{t('plans.open')}</span></a>) : <p className="muted">{t('plans.empty')}</p>}</div></section>
      <section className="card"><div className="eyebrow">{t('plans.eyebrow')}</div><h2>{t('plans.createTitle')}</h2><form className="form" onSubmit={create}><label>{t('plans.name')}<input required minLength={3} maxLength={120} value={name} onChange={(event) => setName(event.target.value)}/></label><label>{t('plans.goal')}<select value={goal} onChange={(event) => setGoal(event.target.value)}>{goalSchema.options.map((option) => <option key={option} value={option}>{enumText(option)}</option>)}</select></label><label>{t('plans.description')}<textarea value={description} maxLength={1500} onChange={(event) => setDescription(event.target.value)} rows={3}/></label><button className="button" disabled={busy}>{busy ? t('common.saving') : t('plans.create')}</button></form></section>
    </div>
  </>;
}
