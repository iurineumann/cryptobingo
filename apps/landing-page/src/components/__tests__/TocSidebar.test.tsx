import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TocSidebar } from '../TocSidebar';

describe('TocSidebar', () => {
  const headings = [
    { id: 'intro', text: 'Introduction' },
    { id: 'details', text: 'Details' },
    { id: 'conclusion', text: 'Conclusion' },
  ];

  beforeEach(() => {
    // Mock IntersectionObserver for useActiveHeading
    vi.stubGlobal('IntersectionObserver', vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('renders all headings', () => {
    render(<TocSidebar headings={headings} />);
    expect(screen.getByText('Introduction')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('Conclusion')).toBeInTheDocument();
  });

  test('renders desktop sidebar with sticky positioning', () => {
    const { container } = render(<TocSidebar headings={headings} />);
    const aside = container.querySelector('aside');
    expect(aside).toBeInTheDocument();
    const stickyDiv = container.querySelector('.sticky');
    expect(stickyDiv).toBeInTheDocument();
  });

  test('renders mobile collapsible TOC', () => {
    render(<TocSidebar headings={headings} />);
    const mobileNav = screen.getByTestId('toc-mobile');
    expect(mobileNav).toBeInTheDocument();
  });

  test('returns null when headings is empty', () => {
    const { container } = render(<TocSidebar headings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  test('toggles mobile nav on button click', () => {
    render(<TocSidebar headings={headings} />);
    const btn = screen.getByRole('button', { name: /on this page/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    const intros = screen.getAllByText('Introduction');
    expect(intros.length).toBe(2);
    fireEvent.click(btn);
    const introsAfter = screen.getAllByText('Introduction');
    expect(introsAfter.length).toBe(1);
  });

  test('clicking heading link closes mobile nav', () => {
    render(<TocSidebar headings={headings} />);
    const btn = screen.getByRole('button', { name: /on this page/i });
    fireEvent.click(btn);
    expect(screen.getAllByText('Introduction').length).toBe(2);
    const mobileNav = screen.getByTestId('toc-mobile');
    const mobileLinks = within(mobileNav).getAllByRole('link');
    const introLink = mobileLinks.find(l => l.getAttribute('href') === '#intro');
    expect(introLink).toBeDefined();
    fireEvent.click(introLink!);
    const introsAfter = screen.getAllByText('Introduction');
    expect(introsAfter.length).toBe(1);
  });
});
