import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumbs } from '../Breadcrumbs';

describe('Breadcrumbs', () => {
  const segments = [
    { label: 'Home', href: '/en' },
    { label: 'Blog', href: '/en/blog' },
    { label: 'RNG Explicado' },
  ];

  it('renders all segments with separators', () => {
    render(<Breadcrumbs segments={segments} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Blog')).toBeInTheDocument();
    expect(screen.getByText('RNG Explicado')).toBeInTheDocument();
  });

  it('last segment is plain text, others are links', () => {
    render(<Breadcrumbs segments={segments} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/en');
    expect(links[1]).toHaveAttribute('href', '/en/blog');
  });

  it('renders schema.org JSON-LD', () => {
    const { container } = render(<Breadcrumbs segments={segments} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).toBeInTheDocument();
    const json = JSON.parse(script!.textContent!);
    expect(json['@type']).toBe('BreadcrumbList');
  });

  it('renders chevron separator between items', () => {
    const { container } = render(<Breadcrumbs segments={segments} />);
    const separators = container.querySelectorAll('[data-testid="breadcrumb-sep"]');
    expect(separators).toHaveLength(segments.length - 1);
  });
});
