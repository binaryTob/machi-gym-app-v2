import { t } from '../lib/i18n';
export default function NotFound() { return <section className="hero"><div className="eyebrow">404</div><h1>{t('common.notFoundTitle')}</h1><p className="muted">{t('common.notFoundHelp')}</p><a className="button" href="/">{t('common.goHome')}</a></section>; }
