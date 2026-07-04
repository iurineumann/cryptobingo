import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrevNextNav } from '../PrevNextNav';

describe('PrevNextNav', () => {
  test('renders both links when both exist', () => {
    render(
      <PrevNextNav
        locale="pt"
        basePath="/pt/blog"
        previous={{ title: 'Post 1', slug: 'post-1' }}
        next={{ title: 'Post 3', slug: 'post-3' }}
      />
    );
    expect(screen.getByText(/post 1/i)).toBeInTheDocument();
    expect(screen.getByText(/post 3/i)).toBeInTheDocument();
  });

  test('renders only next when no previous', () => {
    render(
      <PrevNextNav
        locale="pt"
        basePath="/pt/blog"
        next={{ title: 'Post 2', slug: 'post-2' }}
      />
    );
    expect(screen.getByText(/post 2/i)).toBeInTheDocument();
  });

  test('returns null when neither exists', () => {
    const { container } = render(
      <PrevNextNav locale="pt" basePath="/pt/blog" />
    );
    expect(container.firstChild).toBeNull();
  });
});
