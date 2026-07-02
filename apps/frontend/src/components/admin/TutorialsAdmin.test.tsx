import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import TutorialsAdmin from './TutorialsAdmin';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('./ContentAdmin', () => ({
  default: ({ defaultType }: any) => (
    <div data-testid="tutorials-admin">
      <span data-testid="passed-default-type">{defaultType}</span>
    </div>
  ),
}));

afterEach(() => cleanup());

describe('TutorialsAdmin', () => {
  it('renderiza ContentAdmin com defaultType tutorials', () => {
    render(<TutorialsAdmin />);
    expect(screen.getByTestId('tutorials-admin')).toBeTruthy();
    expect(screen.getByTestId('passed-default-type').textContent).toBe('tutorials');
  });
});
