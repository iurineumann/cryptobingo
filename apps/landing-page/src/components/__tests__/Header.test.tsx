import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from '../Header';

const mockChangeLanguage = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: mockChangeLanguage },
  }),
}));

vi.mock('react-router-dom', () => ({
  NavLink: ({ children, to, onClick }: { children: React.ReactNode; to: string; onClick?: React.MouseEventHandler }) => <a href={to} onClick={onClick}>{children}</a>,
  useLocation: () => ({ pathname: '/en' }),
  useNavigate: () => vi.fn(),
}));

vi.mock('@/components/NextDrawTimer', () => ({
  default: () => <span data-testid="next-draw-timer" />,
}));

describe('Header', () => {
  beforeEach(() => {
    window.dataLayer = [];
    (window as any)._analyticsConsented = true;
    mockChangeLanguage.mockClear();
  });

  it('should push nav_click on desktop nav link click', () => {
    render(<Header />);
    const ideasLink = screen.getByText('nav.ideas');
    fireEvent.click(ideasLink);
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({ event: 'nav_click', link_text: 'nav.ideas' })
    );
  });

  it('should push cta_click on desktop CTA button', () => {
    render(<Header />);
    const cta = screen.getByTestId('mobile-cta');
    fireEvent.click(cta);
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({ event: 'cta_click', cta_location: 'header' })
    );
  });

  it('should push cta_click on mobile drawer CTA', () => {
    render(<Header />);
    fireEvent.click(screen.getByTestId('mobile-menu-toggle'));
    const cta = screen.getByTestId('mobile-cta-drawer');
    fireEvent.click(cta);
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({ event: 'cta_click', cta_location: 'drawer' })
    );
  });

  it('should push locale_switch on lang button click', () => {
    render(<Header />);
    const langBtn = screen.getByText('EN');
    fireEvent.click(langBtn);
    const ptBtn = screen.getByText('PT');
    fireEvent.click(ptBtn);
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({ event: 'locale_switch', from_locale: 'en', to_locale: 'pt', source: 'header' })
    );
  });
});
