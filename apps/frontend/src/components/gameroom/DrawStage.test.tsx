// apps/frontend/src/components/gameroom/DrawStage.test.tsx
import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { createRef } from 'react';
import DrawStage from './DrawStage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

afterEach(() => cleanup());

function renderStage(over: Partial<Parameters<typeof DrawStage>[0]> = {}) {
  const stageRef = createRef<HTMLElement>();
  return render(
    <DrawStage
      wsStatus="connected" drawnNumbers={[7]} effectiveBalls={[{ order: 1, number: 7, timestamp: '' }]}
      lastDrawn={7} col="B" color="#ef4444" maxBalls={75} isDrawing={false} stageRef={stageRef}
      {...over}
    />,
  );
}

describe('DrawStage — sorteio cinematográfico', () => {
  it('marca a coluna da bola no palco via data-col', () => {
    renderStage({ col: 'B' });
    const stage = screen.getByLabelText('Sorteio em tempo real');
    expect(stage.getAttribute('data-col')).toBe('B');
  });

  it('ativa estado de suspense quando isDrawing', () => {
    renderStage({ isDrawing: true });
    const stage = screen.getByLabelText('Sorteio em tempo real');
    expect(stage.className).toContain('is-suspense');
  });

  it('NÃO entra em suspense quando não está sorteando', () => {
    renderStage({ isDrawing: false });
    const stage = screen.getByLabelText('Sorteio em tempo real');
    expect(stage.className).not.toContain('is-suspense');
  });
});
