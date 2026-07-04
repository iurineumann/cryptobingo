import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContentBody } from '../ContentBody';

describe('ContentBody', () => {
  it('renders HTML content safely', () => {
    const html = '<h2 id="title">Test</h2><p>Paragraph</p>';
    render(<ContentBody html={html} />);
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('Paragraph')).toBeInTheDocument();
  });

  it('wraps content in prose classes', () => {
    const { container } = render(<ContentBody html="<p>text</p>" />);
    const contentDiv = container.querySelector('.prose');
    expect(contentDiv?.className).toContain('prose');
    expect(contentDiv?.className).toContain('prose-invert');
  });

  it('renders reading progress bar', () => {
    render(<ContentBody html="<p>text</p>" />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
