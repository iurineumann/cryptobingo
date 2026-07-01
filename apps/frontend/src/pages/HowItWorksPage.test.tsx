import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import HowItWorksPage from './HowItWorksPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'pt-BR' } }),
}));

vi.mock('../components/content/ContentPage', () => ({
  default: ({ type, testId, titleKey }: any) => (
    <div data-testid={`${testId}-page`}>
      <span data-testid="passed-type">{type}</span>
      <span data-testid="passed-title">{titleKey}</span>
    </div>
  ),
}));

afterEach(() => cleanup());

describe('HowItWorksPage', () => {
  it('renderiza ContentPage com type howitworks', () => {
    render(<HowItWorksPage />);
    expect(screen.getByTestId('how-it-works-page')).toBeTruthy();
    expect(screen.getByTestId('passed-type').textContent).toBe('howitworks');
  });
});
