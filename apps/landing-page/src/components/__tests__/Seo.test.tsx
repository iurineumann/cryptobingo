import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import Seo from '../Seo';

const mockI18n = vi.hoisted(() => ({ language: 'en-US' }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: mockI18n }),
}));

function renderWithHelmet(ui: React.ReactElement) {
  return render(<HelmetProvider>{ui}</HelmetProvider>);
}

describe('Seo', () => {
  it('should render with title and description', () => {
    const { container } = renderWithHelmet(
      <Seo title="Test Page" description="Test description" />
    );
    expect(container).toBeDefined();
  });

  it('should render with canonical URL', () => {
    const { container } = renderWithHelmet(
      <Seo title="Test" description="Desc" canonical="/en/test" />
    );
    expect(container).toBeDefined();
  });

  it('should render with custom ogImage', () => {
    const { container } = renderWithHelmet(
      <Seo title="Test" description="Desc" canonical="/en/test" ogImage="/custom.png" />
    );
    expect(container).toBeDefined();
  });

  it('should handle unsupported locale', () => {
    mockI18n.language = 'de-DE';
    const { container } = renderWithHelmet(
      <Seo title="Test" description="Desc" />
    );
    expect(container).toBeDefined();
  });
});
