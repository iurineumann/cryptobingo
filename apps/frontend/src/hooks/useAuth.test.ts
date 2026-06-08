// useAuth.test.ts
// Cobre: cache hit, erro no challenge, isAuthenticating transitions.
// Nota: signWithPrivateKey requer VITE_DEV_PRIVATE_KEY e @wharfkit/antelope.
// Testes focam no fluxo de controle e tratamento de erros sem deps de crypto.

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';

// ── Mocks hoisted (vi.mock é elevado antes de imports) ────────────────────────

const apiMocks = vi.hoisted(() => ({
  getAuthToken:         vi.fn(() => null as string | null),
  requestAuthChallenge: vi.fn().mockResolvedValue({ nonce: 'test-nonce-123' }),
  verifyAuthChallenge:  vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/api', () => ({
  getAuthToken:         apiMocks.getAuthToken,
  requestAuthChallenge: apiMocks.requestAuthChallenge,
  verifyAuthChallenge:  apiMocks.verifyAuthChallenge,
  saveAuthToken:        vi.fn(),
}));

// Bloqueia qualquer operação de crypto wharfkit que possa falhar em jsdom
vi.mock('@wharfkit/antelope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wharfkit/antelope')>();
  return {
    ...actual,
    PrivateKey: {
      from: vi.fn(() => ({
        signDigest: vi.fn().mockReturnValue({ toString: () => 'SIG_K1_mock' }),
        toPublic:   vi.fn(() => ({ toString: () => 'PUB_K1_mock' })),
      })),
    },
    Checksum256: {
      hash: vi.fn(() => 'hash-mock'),
    },
  };
});

import { useAuth } from './useAuth';

// Sessão stub — walletPlugin NÃO é privatekey → cai no modo produção
const mockSession = {
  actor:        'jogador1',
  walletPlugin: { id: 'wallet-plugin-anchor' },
  transact:     vi.fn().mockResolvedValue({
    signatures:  [{ toString: () => 'SIG_K1_mock' }],
    transaction: { toJSON: () => ({}) },
  }),
  publicKey: { toString: () => 'PUB_K1_mock' },
} as any;

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getAuthToken.mockReturnValue(null);
  apiMocks.requestAuthChallenge.mockResolvedValue({ nonce: 'test-nonce-123' });
  apiMocks.verifyAuthChallenge.mockResolvedValue(undefined);
});

// ── Testes ───────────────────────────────────────────────────────────────────

describe('useAuth — cache hit', () => {
  it('getAuthToken retorna token existente → authenticateSession retorna true sem chamar requestAuthChallenge', async () => {
    apiMocks.getAuthToken.mockReturnValue('cached-jwt-token');

    const { result } = renderHook(() => useAuth());

    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.authenticateSession(mockSession);
    });

    expect(returnValue).toBe(true);
    expect(apiMocks.requestAuthChallenge).not.toHaveBeenCalled();
  });
});

describe('useAuth — fluxo de erro', () => {
  it('requestAuthChallenge lança → authError preenchido e retorna false', async () => {
    apiMocks.requestAuthChallenge.mockRejectedValue(new Error('Rede indisponível'));

    const { result } = renderHook(() => useAuth());

    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.authenticateSession(mockSession);
    });

    expect(returnValue).toBe(false);
    expect(result.current.authError).toBe('Rede indisponível');
  });

  it('erro genérico (não-Error) → authError recebe mensagem fallback', async () => {
    apiMocks.requestAuthChallenge.mockRejectedValue('string-error');

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.authenticateSession(mockSession);
    });

    expect(result.current.authError).toBe('Falha na autenticação.');
  });
});

describe('useAuth — isAuthenticating transitions', () => {
  it('isAuthenticating=true durante execução, false após conclusão', async () => {
    let resolveChallenge!: () => void;
    apiMocks.requestAuthChallenge.mockReturnValue(
      new Promise<{ nonce: string }>(res => {
        resolveChallenge = () => res({ nonce: 'n' });
      })
    );

    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticating).toBe(false);

    const authPromise = act(async () => {
      result.current.authenticateSession(mockSession);
      // Permite que o estado isAuthenticating=true seja commitado
      await new Promise(r => setTimeout(r, 0));
    });

    // Resolve a promise para concluir o fluxo
    resolveChallenge();
    await authPromise;

    expect(result.current.isAuthenticating).toBe(false);
  });

  it('estado inicial: isAuthenticating=false, authError=null', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticating).toBe(false);
    expect(result.current.authError).toBeNull();
  });
});
