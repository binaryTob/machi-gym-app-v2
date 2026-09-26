'use client';
import { t } from '../lib/i18n';
export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <section className="hero"><h1>{t('common.pageErrorTitle')}</h1><p className="muted">{t('common.error')}</p><button className="button" onClick={reset}>{t('common.retry')}</button></section>; }
