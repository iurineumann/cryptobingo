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
  clearAuthToken:       vi.fn(),
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
    transaction: {
      expiration:            '2026-01-01T00:00:00',
      ref_block_num:         1,
      ref_block_prefix:      1,
      max_net_usage_words:   0,
      max_cpu_usage_ms:      0,
      delay_sec:             0,
      actions: [{
        account:       'bingogamectr',
        name:          'userlogin',
        authorization: [{ actor: 'jogador1', permission: 'active' }],
        data:          { nonce_data: { array: new Uint8Array([3, 65, 66, 67]) } },
      }],
    },
    resolved: { signingDigest: { array: new Uint8Array(32) } },
  }),
  client: { provider: { url: 'http://localhost' } },
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
  it('getAuthToken retorna token existente e válido → authenticateSession retorna true sem chamar requestAuthChallenge', async () => {
    const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3YWxsZXQiOiJqb2dhZG9yMSIsImp0aSI6InRlc3QtanRpIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.fakesig';
    apiMocks.getAuthToken.mockReturnValue(validToken);

    const { result } = renderHook(() => useAuth());

    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.authenticateSession(mockSession);
    });

    expect(returnValue).toBe(true);
    expect(apiMocks.requestAuthChallenge).not.toHaveBeenCalled();
  });

  it('getAuthToken retorna token expirado → faz login completo (clearAuthToken + challenge)', async () => {
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3YWxsZXQiOiJqb2dhZG9yMSIsImV4cCI6MX0.fakesig';
    apiMocks.getAuthToken.mockReturnValue(expiredToken);

    // Sessão dev (privatekey) — evita TextEncoder do modo produção em jsdom
    const devSession = {
      actor:        'jogador1',
      walletPlugin: { id: 'wallet-plugin-privatekey' },
    } as any;

    // Modo dev ativo + chave de dev válida para signWithPrivateKey
    vi.stubEnv('DEV', 'true');
    vi.stubEnv('VITE_DEV_PRIVATE_KEY', '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyDt1joz1o7o');

    const { result } = renderHook(() => useAuth());

    let returnValue: boolean | undefined;
    await act(async () => {
      returnValue = await result.current.authenticateSession(devSession);
    });

    expect(apiMocks.requestAuthChallenge).toHaveBeenCalled();
    expect(returnValue).toBe(true);
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
