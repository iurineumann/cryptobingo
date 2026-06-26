// apps/frontend/src/components/replayroom/ReplayControls.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ReplayControls from './ReplayControls';

const SPEEDS = [0.5, 1, 2, 4, 8];

function renderControls(props: Partial<React.ComponentProps<typeof ReplayControls>> = {}) {
  return render(
    <ReplayControls
      revealedBalls={[]}
      totalBalls={10}
      isPlaying={false}
      isComplete={false}
      speed={1}
      setSpeed={vi.fn()}
      togglePlay={vi.fn()}
      skipToEnd={vi.fn()}
      restart={vi.fn()}
      onSeek={vi.fn()}
      {...props}
    />,
  );
}

describe('ReplayControls', () => {
  it('renderiza play btn e end btn', () => {
    renderControls();
    expect(screen.getByTestId('replay-play-btn')).toBeTruthy();
    expect(screen.getByTestId('replay-end-btn')).toBeTruthy();
  });

  it('renderiza restart btn quando não está completo', () => {
    renderControls({ revealedBalls: [1] });
    expect(screen.getByTestId('replay-restart-btn')).toBeTruthy();
  });

  it('não renderiza restart btn quando complete', () => {
    renderControls({ isComplete: true });
    expect(screen.queryByTestId('replay-restart-btn')).toBeNull();
  });

  it('togglePlay troca texto play/pause', () => {
    const togglePlay = vi.fn();
    renderControls({ togglePlay, isPlaying: false });
    expect(screen.getByTestId('replay-play-btn')).toBeTruthy();

    fireEvent.click(screen.getByTestId('replay-play-btn'));
    expect(togglePlay).toHaveBeenCalledOnce();
  });

  it('restart btn disabled quando nenhuma bola revelada', () => {
    renderControls({ revealedBalls: [] });
    const btn = screen.getByTestId('replay-restart-btn');
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('end btn disabled quando isComplete', () => {
    renderControls({ isComplete: true });
    const btn = screen.getByTestId('replay-end-btn');
    expect(btn.hasAttribute('disabled')).toBe(true);
  });

  it('renderiza todos speed btns', () => {
    renderControls();
    for (const s of SPEEDS) {
      expect(screen.getByTestId(`replay-speed-${s}`)).toBeTruthy();
    }
  });

  it('setSpeed chamado ao clicar speed btn', () => {
    const setSpeed = vi.fn();
    renderControls({ setSpeed });
    fireEvent.click(screen.getByTestId('replay-speed-2'));
    expect(setSpeed).toHaveBeenCalledWith(2);
  });

  it('mostra contador revealed/total', () => {
    renderControls({ revealedBalls: [3, 7] });
    expect(screen.getByText('2/10')).toBeTruthy();
  });

  it('mostra seek quando totalBalls > 0', () => {
    renderControls({ totalBalls: 5 });
    expect(screen.getByTestId('replay-seek')).toBeTruthy();
  });

  it('seek extremo direito → skipToEnd', () => {
    const skipToEnd = vi.fn();
    const onSeek = vi.fn();
    renderControls({ totalBalls: 10, skipToEnd, onSeek });
    const track = screen.getByTestId('replay-seek');
    // jsdom default width=0 → ratio=1 → target=totalBalls
    Object.defineProperty(track, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 0, top: 0, right: 0, bottom: 0, height: 0 }),
      configurable: true,
    });
    fireEvent.click(track, { clientX: 100 });
    expect(skipToEnd).toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('seek extremo esquerdo → restart', () => {
    const restart = vi.fn();
    const onSeek = vi.fn();
    renderControls({ totalBalls: 10, restart, onSeek });
    const track = screen.getByTestId('replay-seek');
    Object.defineProperty(track, 'getBoundingClientRect', {
      value: () => ({ left: 50, width: 100, top: 0, right: 150, bottom: 0, height: 20 }),
      configurable: true,
    });
    fireEvent.click(track, { clientX: 50 }); // x=50, left=50 → ratio=0 → target=0
    expect(restart).toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('seek intermediário → onSeek', () => {
    const onSeek = vi.fn();
    renderControls({ totalBalls: 10, onSeek });
    const track = screen.getByTestId('replay-seek');
    Object.defineProperty(track, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200, top: 0, right: 200, bottom: 0, height: 20 }),
      configurable: true,
    });
    fireEvent.click(track, { clientX: 50 }); // ratio=0.25, target=3
    expect(onSeek).toHaveBeenCalledWith(3);
  });

  it('mostra complete badge quando isComplete', () => {
    renderControls({ isComplete: true });
    expect(screen.getByText(/complete/)).toBeTruthy();
  });

  it('exibe restart quando isComplete', () => {
    renderControls({ isComplete: true });
    expect(screen.getByTestId('replay-play-btn')).toBeTruthy();
  });
});
