// apps/frontend/src/services/api.ts
// Camada de comunicação com o api-gateway.
// Todas as rotas protegidas enviam o JWT via header Authorization: Bearer <token>.
// O token é armazenado em memória (sessionStorage) — nunca em localStorage.
// Ref: ADR-006 (JWT Auth), openapi.yaml v1.2.0

import type { MongoUserProfile } from '@cryptobingo/shared-types';

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL + '/api/v1';

// ==========================================
// GESTÃO DE TOKEN JWT (in-memory + sessionStorage)
// ==========================================

let _token: string | null = sessionStorage.getItem('cb_jwt');

export function setAuthToken(token: string): void {
    _token = token;
    sessionStorage.setItem('cb_jwt', token);
}

export function clearAuthToken(): void {
    _token = null;
    sessionStorage.removeItem('cb_jwt');
}

export function getAuthToken(): string | null {
    return _token;
}

/** Headers base para rotas protegidas. Lança erro se não houver token. */
function authHeaders(): HeadersInit {
    if (!_token) throw new Error('Usuário não autenticado. Faça login primeiro.');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${_token}`,
    };
}

/** Headers para rotas públicas. */
function publicHeaders(): HeadersInit {
    return { 'Content-Type': 'application/json' };
}

// ==========================================
// HELPER DE RESPOSTA
// ==========================================

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
}

// ==========================================
// AUTH — Challenge-Response (ADR-006)
// ==========================================

interface ChallengeResponse {
    nonce: string;
    expires_at: string;
    message: string;
}

interface VerifyResponse {
    token: string;
}

/**
 * Passo 1: Solicita o nonce ao servidor para o wallet informado.
 */
export async function requestAuthChallenge(wallet: string): Promise<ChallengeResponse> {
    const res = await fetch(`${API_BASE}/auth/challenge`, {
        method: 'POST',
        headers: publicHeaders(),
        body: JSON.stringify({ wallet }),
    });
    return handleResponse<ChallengeResponse>(res);
}

/**
 * Passo 2: Envia a assinatura do nonce e obtém o JWT.
 * Armazena o token automaticamente em memória + sessionStorage.
 */
export async function verifyAuthChallenge(
    wallet: string,
    nonce: string,
    signature: string,
    publicKey: string,
): Promise<string> {
    const res = await fetch(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: publicHeaders(),
        body: JSON.stringify({ wallet, nonce, signature, public_key: publicKey }),
    });
    const data = await handleResponse<VerifyResponse>(res);
    setAuthToken(data.token);
    return data.token;
}

// ==========================================
// PERFIL (protegido por JWT)
// ==========================================

/**
 * Busca o perfil do usuário autenticado.
 * Usa o JWT — o wallet é lido pelo servidor a partir do token.
 */
export async function fetchUserProfile(): Promise<MongoUserProfile> {
    const res = await fetch(`${API_BASE}/profile`, {
        headers: authHeaders(),
    });
    return handleResponse<MongoUserProfile>(res);
}

/**
 * Atualiza o locale do usuário autenticado.
 */
export async function updateUserLocale(locale: string): Promise<MongoUserProfile> {
    const res = await fetch(`${API_BASE}/profile`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ locale }),
    });
    return handleResponse<MongoUserProfile>(res);
}

// ==========================================
// CARTELAS — Geração e Assinatura (ADR-001)
// ==========================================

export interface SignedTicket {
    matrix: number[];    // 24 posições: [B0-B4, I0-I4, N0,N1,N3,N4, G0-G4, O0-O4]
    signature: string;   // "SIG_K1_..."
}

export interface GenerateTicketsResponse {
    game_id: string;
    account: string;
    count: number;
    tickets: SignedTicket[];
}

/**
 * Solicita ao backend a geração de N cartelas assinadas para um jogo.
 * Retorna o array pronto para ser submetido ao buytickets() on-chain.
 * Ref: ADR-001, SPEC.md §2.1, openapi.yaml /games/{gameId}/tickets/generate
 */
export async function generateSignedTickets(
    gameId: string,
    count: number,
): Promise<GenerateTicketsResponse> {
    const res = await fetch(`${API_BASE}/games/${gameId}/tickets/generate`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ count }),
    });
    return handleResponse<GenerateTicketsResponse>(res);
}
