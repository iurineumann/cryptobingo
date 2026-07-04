import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pagination } from '../Pagination';

describe('Pagination', () => {
  test('renders page numbers', () => {
    render(<Pagination current={1} total={5} basePath="/pt/blog" />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  test('current page is highlighted', () => {
    render(<Pagination current={3} total={5} basePath="/pt/blog" />);
    const current = screen.getByText('3');
    expect(current.closest('a')?.className).toContain('brand');
  });

  test('renders prev/next arrows', () => {
    render(<Pagination current={3} total={5} basePath="/pt/blog" />);
    expect(screen.getByLabelText(/previous/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/next/i)).toBeInTheDocument();
  });

  test('returns null when total is 1 or less', () => {
    const { container } = render(<Pagination current={1} total={1} basePath="/pt/blog" />);
    expect(container.firstChild).toBeNull();
  });
});
