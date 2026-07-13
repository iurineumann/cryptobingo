import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContentHeader } from '../ContentHeader';

describe('ContentHeader', () => {
  const baseProps = {
    title: 'Test Post',
    description: 'A test description',
    author: 'CryptoBingo Team',
    date: '2026-07-04',
    tags: ['blockchain', 'guide'],
    readTime: 5,
  };

  it('renders title and description', () => {
    render(<ContentHeader {...baseProps} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Post');
    expect(screen.getByText('A test description')).toBeInTheDocument();
  });

  it('renders author, date and read time', () => {
    render(<ContentHeader {...baseProps} />);
    expect(screen.getByText(/CryptoBingo Team/)).toBeInTheDocument();
    expect(screen.getByText(/5 min/)).toBeInTheDocument();
  });

  it('renders tags as pills', () => {
    render(<ContentHeader {...baseProps} />);
    expect(screen.getByText('blockchain')).toBeInTheDocument();
    expect(screen.getByText('guide')).toBeInTheDocument();
  });

  it('renders cover image when provided', () => {
    render(<ContentHeader {...baseProps} cover="/blog/test-cover.png" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/blog/test-cover.png');
  });

  it('renders fallback cover when not provided', () => {
    render(<ContentHeader {...baseProps} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/og-image.png');
  });
});
