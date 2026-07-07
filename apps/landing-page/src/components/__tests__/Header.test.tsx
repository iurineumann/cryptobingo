import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Header from '../Header';

const mockChangeLanguage = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key === 'nav.ideas' ? 'Ideias' : key,
    i18n: { changeLanguage: mockChangeLanguage },
  }),
}));

vi.mock('react-router-dom', () => ({
  NavLink: ({ children, to, onClick }: { children: React.ReactNode; to: string; onClick?: React.MouseEventHandler }) => <a href={to} onClick={onClick}>{children}</a>,
  useLocation: () => ({ pathname: '/en' }),
  useNavigate: () => vi.fn(),
}));

vi.mock('@/components/NextDrawTimer', () => ({
  default: ({ compact }: { compact?: boolean }) => <span data-testid="next-draw-timer" data-compact={compact ? 'true' : ''} />,
}));

describe('Header', () => {
  beforeEach(() => {
    window.dataLayer = [];
    (window as any)._analyticsConsented = true;
    mockChangeLanguage.mockClear();
  });

  it('should push nav_click on desktop nav link click', () => {
    render(<Header />);
    const desktopNav = screen.getByTestId('desktop-nav');
    const ideasLink = within(desktopNav).getByRole('link', { name: /ideias/i });
    fireEvent.click(ideasLink);
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({ event: 'nav_click', link_text: 'Ideias' })
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
    const drawer = screen.getByTestId('mobile-drawer');
    const cta = within(drawer).getByTestId('mobile-cta-drawer');
    fireEvent.click(cta);
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({ event: 'cta_click', cta_location: 'drawer' })
    );
  });

  it('should push locale_switch on lang button click', () => {
    render(<Header />);
    const desktopNav = screen.getByTestId('desktop-nav');
    const langBtn = within(desktopNav).getByText('EN');
    fireEvent.click(langBtn);
    const ptBtn = within(desktopNav).getByText('PT');
    fireEvent.click(ptBtn);
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({ event: 'locale_switch', from_locale: 'en', to_locale: 'pt', source: 'header' })
    );
  });

  it('ideas link uses locale prefix', () => {
    render(<Header />);
    const desktopNav = screen.getByTestId('desktop-nav');
    const link = within(desktopNav).getByRole('link', { name: /ideias/i });
    expect(link.getAttribute('href')).toMatch(/^\/\w{2}\/ideas$/);
  });

  it('renders urgency timer badge below nav', () => {
    render(<Header />);
    expect(screen.getByTestId('urgency-timer')).toBeInTheDocument();
  });

  it('should push nav_click on mobile drawer external link', () => {
    render(<Header />);
    fireEvent.click(screen.getByTestId('mobile-menu-toggle'));
    const drawer = screen.getByTestId('mobile-drawer');
    const githubLink = within(drawer).getByText('nav.github');
    fireEvent.click(githubLink);
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({ event: 'nav_click', link_text: 'nav.github' })
    );
  });

  it('should call switchLocale on mobile locale button click', () => {
    render(<Header />);
    fireEvent.click(screen.getByTestId('mobile-menu-toggle'));
    const drawer = screen.getByTestId('mobile-drawer');
    const ptBtn = within(drawer).getByText('PT');
    fireEvent.click(ptBtn);
    expect(mockChangeLanguage).toHaveBeenCalledWith('pt');
    expect(window.dataLayer).toContainEqual(
      expect.objectContaining({ event: 'locale_switch', to_locale: 'pt' })
    );
  });
});
