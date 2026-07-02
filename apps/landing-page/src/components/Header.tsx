import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

type NavLink =
  | { type: 'internal'; label: string; href: string }
  | { type: 'external'; label: string; href: string }
  | { type: 'disabled'; label: string };

const navLinks: NavLink[] = [
  { type: 'internal', label: 'Ideas', href: '/ideas' },
  { type: 'external', label: 'Testnet', href: 'https://test.cryptobingo.bet' },
  { type: 'external', label: 'GitHub', href: 'https://github.com/iurineumann/cryptobingo' },
  { type: 'disabled', label: 'Telegram' },
  { type: 'disabled', label: 'Discord' },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-surface-900/80 border-b border-surface-700/50">
      <div className="max-w-7xl mx-auto flex justify-between items-center h-16 px-4">
        <a href="/" className="flex items-center gap-0.5 text-xl font-bold text-white">
          <span>CryptoBingo</span>
          <span className="text-accent-400">●</span>
        </a>
        <nav className="flex items-center gap-6">
          {navLinks.map((link) => {
            if (link.type === 'internal') {
              return (
                <NavLink
                  key={link.label}
                  to={link.href}
                  className={({ isActive }) =>
                    cn(
                      'text-sm text-slate-400 hover:text-white transition-colors',
                      isActive && 'text-white'
                    )
                  }
                >
                  {link.label}
                </NavLink>
              );
            }
            if (link.type === 'disabled') {
              return (
                <span
                  key={link.label}
                  className="text-sm text-slate-400 opacity-50 cursor-not-allowed"
                >
                  {link.label}
                </span>
              );
            }
            return (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                {link.label}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
