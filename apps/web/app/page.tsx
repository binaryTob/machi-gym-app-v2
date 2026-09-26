import { t } from '../lib/i18n';
export default function Home() { return <section className="hero"><div className="eyebrow">{t('home.eyebrow')}</div><h1>{t('home.title')}</h1><p className="muted">{t('home.description')}</p><a className="button" href="/login">{t('home.signIn')}</a></section>; }
