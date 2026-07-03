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

const productLinks = [
  { label: 'Testnet', href: 'https://test.cryptobingo.bet' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Ideas', href: '/ideas' },
  { label: 'Roadmap', href: '#' },
] as const;

const legalLinks = [
  { label: 'Terms', href: '#' },
  { label: 'Privacy', href: '#' },
] as const;

export default function Footer({ social }: FooterProps) {
  const s = social || defaultSocial;

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
              BINGO GameFi on WAX blockchain
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Product</h4>
            <div className="flex flex-col gap-2">
              {productLinks.map(renderLink)}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Community</h4>
            <div className="flex flex-col gap-2">
              <a href={s.github} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-white transition-colors">GitHub</a>
              <a href={s.telegram} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-white transition-colors">Telegram</a>
              <a href={s.discord} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-white transition-colors">Discord</a>
              <a href={s.twitter} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 hover:text-white transition-colors">X/Twitter</a>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Legal</h4>
            <div className="flex flex-col gap-2">
              {legalLinks.map(renderLink)}
            </div>
          </div>
        </div>
        <div className="border-t border-surface-800 mt-8 pt-8">
          <p className="text-xs text-slate-500">
            &copy; 2026 CryptoBingo. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
