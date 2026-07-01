import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import TutorialsPage from './TutorialsPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'pt-BR' },
  }),
}));

vi.mock('../components/content/ContentPage', () => ({
  default: ({ type, testId, titleKey }: any) => (
    <div data-testid={`${testId}-page`}>
      <h1 data-testid={`${testId}-title`}>{titleKey}</h1>
      <span data-testid="passed-type">{type}</span>
    </div>
  ),
}));

afterEach(() => cleanup());

describe('TutorialsPage', () => {
  it('renderiza ContentPage com type tutorials', () => {
    render(<TutorialsPage />);
    expect(screen.getByTestId('tutorials-page')).toBeTruthy();
    expect(screen.getByTestId('passed-type').textContent).toBe('tutorials');
  });
});
