import './styles.css';
import { t } from '../lib/i18n';
export const metadata = { title: 'Machi Gym', description: t('site.description') };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><div className="shell"><header className="site-header"><a className="brand" href="/">M<span className="brand-mark">✦</span>CHI <strong>GYM</strong></a><span className="header-tag">{t('site.tagline')}</span></header><main>{children}</main><footer className="footer">{t('site.footer')}</footer></div></body></html>;
}
