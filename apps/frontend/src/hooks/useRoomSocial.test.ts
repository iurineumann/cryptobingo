// apps/frontend/src/hooks/useRoomSocial.test.ts
import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const handlers: Record<string, (p: unknown) => void> = {};
const emit = vi.fn();
const fakeSocket = {
  connected: true,
  on: (ev: string, cb: (p: unknown) => void) => { handlers[ev] = cb; },
  emit,
  disconnect: vi.fn(),
};
vi.mock('socket.io-client', () => ({ io: () => fakeSocket }));
vi.mock('../services/api', () => ({ getAuthToken: () => 'tok' }));

import { useRoomSocial } from './useRoomSocial';

describe('useRoomSocial', () => {
  beforeEach(() => { Object.keys(handlers).forEach(k => delete handlers[k]); emit.mockClear(); });

  it('atualiza onlineCount em presence:update', async () => {
    const { result } = renderHook(() => useRoomSocial({ roomId: 'r1' }));
    act(() => { handlers['connect']?.(undefined); });
    act(() => { handlers['presence:update']?.({ roomId: 'r1', online: 3 }); });
    expect(result.current.onlineCount).toBe(3);
  });

  it('sendReaction emite reaction:send', () => {
    const { result } = renderHook(() => useRoomSocial({ roomId: 'r1' }));
    act(() => { handlers['connect']?.(undefined); });
    act(() => result.current.sendReaction('🔥'));
    expect(emit).toHaveBeenCalledWith('reaction:send', { roomId: 'r1', emoji: '🔥' });
  });

  it('reaction:new adiciona reação que expira', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRoomSocial({ roomId: 'r1' }));
    act(() => { handlers['reaction:new']?.({ wallet: 'bob', emoji: '🎉', ts: Date.now() }); });
    expect(result.current.reactions.length).toBe(1);
    act(() => { vi.advanceTimersByTime(4100); });
    expect(result.current.reactions.length).toBe(0);
    vi.useRealTimers();
  });
});
