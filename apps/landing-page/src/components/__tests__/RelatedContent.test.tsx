import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelatedContent } from '../RelatedContent';

describe('RelatedContent', () => {
  const items = [
    { title: 'Post 1', slug: 'post-1' },
    { title: 'Post 2', slug: 'post-2' },
  ];

  test('renders related posts heading', () => {
    render(<RelatedContent items={items} type="blog" locale="pt" />);
    expect(screen.getByText(/relatedPosts/i)).toBeInTheDocument();
  });

  test('renders all items as links', () => {
    render(<RelatedContent items={items} type="blog" locale="pt" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
  });

  test('returns null when items is empty', () => {
    const { container } = render(<RelatedContent items={[]} type="blog" locale="pt" />);
    expect(container.firstChild).toBeNull();
  });

  test('renders related tutorials heading for tutorial type', () => {
    render(<RelatedContent items={items} type="tutorial" locale="en" />);
    expect(screen.getByText(/relatedTutorials/i)).toBeInTheDocument();
  });

  test('uses correct base path for tutorials', () => {
    render(<RelatedContent items={items} type="tutorial" locale="en" />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/en/tutorials/post-1');
  });

  test('uses correct base path for blog', () => {
    render(<RelatedContent items={items} type="blog" locale="en" />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/en/blog/post-1');
  });
});
