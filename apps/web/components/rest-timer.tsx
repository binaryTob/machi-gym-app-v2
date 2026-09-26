'use client';

import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';

type Timer = { endsAt: number | null; remaining: number; paused: boolean; duration: number };

export function RestTimer({ sessionId, trigger, seconds }: { sessionId: string; trigger: number; seconds: number }) {
  const [timer, setTimer] = useState<Timer | null>(null);
  const [now, setNow] = useState(Date.now());
  const key = `machi-rest-${sessionId}`;
  useEffect(() => {
    try { const raw = localStorage.getItem(key); if (!raw) return; const value: unknown = JSON.parse(raw); if (value && typeof value === 'object' && 'duration' in value && 'remaining' in value && 'paused' in value && 'endsAt' in value) setTimer(value as Timer); } catch { localStorage.removeItem(key); }
  }, [key]);
  useEffect(() => { if (!trigger || !seconds) return; const next: Timer = { endsAt: Date.now() + seconds * 1000, remaining: seconds, paused: false, duration: seconds }; setTimer(next); localStorage.setItem(key, JSON.stringify(next)); }, [trigger, seconds, key]);
  useEffect(() => { if (!timer || timer.paused) return; const interval = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(interval); }, [timer?.paused, timer?.endsAt]);
  function update(next: Timer | null) { setTimer(next); if (next) localStorage.setItem(key, JSON.stringify(next)); else localStorage.removeItem(key); }
  if (!timer) return null;
  const remaining = timer.paused ? timer.remaining : Math.max(0, Math.ceil(((timer.endsAt ?? now) - now) / 1000));
  return <div className="rest-timer" role="timer" aria-label={t('workout.rest')}><div><div className="eyebrow">{t('workout.rest')}</div><strong>{timer.paused ? t('workout.restPaused', { seconds: remaining }) : t('workout.restRemaining', { seconds: remaining })}</strong></div><div className="row wrap"><button className="button secondary" onClick={() => timer.paused ? update({ ...timer, paused: false, endsAt: Date.now() + remaining * 1000 }) : update({ ...timer, paused: true, endsAt: null, remaining })}>{timer.paused ? t('workout.restContinue') : t('workout.restPause')}</button><button className="button secondary" onClick={() => update({ duration: timer.duration, remaining: timer.duration, endsAt: Date.now() + timer.duration * 1000, paused: false })}>{t('workout.restReset')}</button><button className="button link" onClick={() => update(null)}>{t('workout.restSkip')}</button></div></div>;
}
