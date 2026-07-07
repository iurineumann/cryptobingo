import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../content';

describe('renderMarkdown', () => {
  it('wraps image with caption in <figure><figcaption>', () => {
    const input = '![WAX logo](/images/wax-logo.png "Logo da WAX Blockchain")';
    const output = renderMarkdown(input);
    expect(output).toContain('<figure');
    expect(output).toContain('<figcaption');
    expect(output).toContain('Logo da WAX Blockchain');
    expect(output).toContain('src="/images/wax-logo.png"');
  });

  it('renders plain <img> when no caption', () => {
    const input = '![WAX logo](/images/wax-logo.png)';
    const output = renderMarkdown(input);
    expect(output).not.toContain('<figure');
    expect(output).not.toContain('<figcaption');
    expect(output).toContain('<img');
    expect(output).toContain('src="/images/wax-logo.png"');
  });

  it('wraps multiple images with caption individually', () => {
    const input = `
![Imagem 1](/img1.png "Primeira")
![Imagem 2](/img2.png "Segunda")
`;
    const output = renderMarkdown(input);
    const figures = output.match(/<figure/g);
    expect(figures).toHaveLength(2);
    expect(output).toContain('Primeira');
    expect(output).toContain('Segunda');
  });

  it('preserves lazy loading attribute', () => {
    const input = '![teste](/img.png "caption")';
    const output = renderMarkdown(input);
    expect(output).toContain('loading="lazy"');
  });

  it('handles images without caption and without figure wrapper', () => {
    const input = '![apenas alt](/img.png)';
    const output = renderMarkdown(input);
    expect(output).toContain('<img');
    expect(output).not.toContain('<figure');
  });
});
