import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

interface FooterProps {
  social?: {
    telegram: string;
    discord: string;
    twitter: string;
    github: string;
  };
}

const defaultSocial = {
  telegram: 'https://t.me/cryptobingo_bet',
  discord: 'https://discord.gg/EYYhdRWUnm',
  twitter: 'https://x.com/CryptoBingo_Bet',
  github: 'https://github.com/iurineumann/cryptobingo',
};

export default function Footer({ social }: FooterProps) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const lang = locale || 'en';
  const s = social || defaultSocial;

  const productLinks = [
    { label: t('nav.testnet'), href: 'https://test.cryptobingo.bet' },
    { label: t('nav.faq'), href: `/${lang}/faq` },
    { label: t('nav.ideas'), href: '/ideas' },
    { label: t('nav.blog'), href: `/${lang}/blog` },
  ] as const;

  const legalLinks = [
    { label: t('footer.terms'), href: `/${lang}/terms` },
    { label: t('footer.privacy'), href: `/${lang}/privacy` },
    { label: t('footer.risk_disclaimer'), href: `/${lang}/risk-disclaimer` },
    { label: t('footer.responsible_gaming'), href: `/${lang}/responsible-gaming` },
  ] as const;

  const renderLink = (link: { label: string; href: string; disabled?: boolean }) => {
    if (link.disabled) {
      return (
        <span
          key={link.label}
          className="text-sm text-slate-400 opacity-50 cursor-not-allowed"
        >
          {link.label}
        </span>
      );
    }
    const isExternal = link.href.startsWith('http');
    return (
      <a
        key={link.label}
        href={link.href}
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className="text-sm text-slate-400 hover:text-white transition-colors"
      >
        {link.label}
      </a>
    );
  };

  return (
    <footer className="bg-surface-950 border-t border-surface-800">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <span className="text-lg font-bold text-white">
              CryptoBingo
              <span className="text-accent-400 ml-0.5">●</span>
            </span>
            <p className="text-sm text-slate-400 mt-2">
              {t('footer.tagline')}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">{t('footer.product')}</h4>
            <div className="flex flex-col gap-2">
              {productLinks.map(renderLink)}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">{t('footer.community')}</h4>
            <div className="flex flex-col gap-2">
              <a href={s.github} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-white transition-colors">{t('nav.github')}</a>
              <a href={s.telegram} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-white transition-colors">{t('nav.telegram')}</a>
              <a href={s.discord} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-white transition-colors">{t('nav.discord')}</a>
              <a href={s.twitter} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-white transition-colors">{t('nav.twitter')}</a>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">{t('footer.legal')}</h4>
            <div className="flex flex-col gap-2">
              {legalLinks.map(renderLink)}
            </div>
          </div>
        </div>
        <div className="border-t border-surface-800 mt-8 pt-8">
          <p className="text-xs text-slate-500">
            {t('footer.copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
}
