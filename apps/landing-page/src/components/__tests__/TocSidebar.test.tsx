import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TocSidebar } from '../TocSidebar';

describe('TocSidebar', () => {
  const headings = [
    { id: 'intro', text: 'Introduction' },
    { id: 'details', text: 'Details' },
    { id: 'conclusion', text: 'Conclusion' },
  ];

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
});
