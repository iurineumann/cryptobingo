import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TagFilter } from '../TagFilter';

describe('TagFilter', () => {
  const tags = ['blockchain', 'rng', 'guide', 'tutorial'];

  test('renders all tags', () => {
    render(<TagFilter tags={tags} activeTag={null} basePath="/pt/blog" />);
    expect(screen.getByText('blockchain')).toBeInTheDocument();
    expect(screen.getByText('rng')).toBeInTheDocument();
  });

  test('active tag is highlighted', () => {
    render(<TagFilter tags={tags} activeTag="rng" basePath="/pt/blog" />);
    const rng = screen.getByText('rng');
    expect(rng.closest('a')?.className).toContain('brand');
  });

  test('includes "All" option', () => {
    render(<TagFilter tags={tags} activeTag={null} basePath="/pt/blog" />);
    expect(screen.getByText('tagFilter.all')).toBeInTheDocument();
  });
});
