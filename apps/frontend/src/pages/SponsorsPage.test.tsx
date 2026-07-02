import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import SponsorsPage from './SponsorsPage';

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

describe('SponsorsPage', () => {
  it('renderiza ContentPage com type sponsors', () => {
    render(<SponsorsPage />);
    expect(screen.getByTestId('sponsors-page')).toBeTruthy();
    expect(screen.getByTestId('passed-type').textContent).toBe('sponsors');
  });
});
