// apps/frontend/src/config/env.ts
// Configuração centralizada de endpoints do frontend.
//
// IMPORTANTE (ADR): a SWA free tier NÃO possui backend em /api, então
// paths relativos (/api/v1/...) SEMPRE falham. O front DEVE usar sempre
// o host absoluto da API. Por isso há fallback para o endpoint de
// produção (testnet) caso a var de build não seja injetada.
//
// Endpoint oficial da API (testnet): https://test-api.cryptobingo.bet
// (CNAME/Custom Domain do container app api-gateway na Azure).

const API_HOST = import.meta.env.VITE_API_GATEWAY_URL || 'https://test-api.cryptobingo.bet';
const WS_HOST  = import.meta.env.VITE_WS_URL             || 'wss://test-api.cryptobingo.bet';

/** Base REST da API-gateway, ex: https://test-api.cryptobingo.bet/api/v1 */
export const API_BASE = `${API_HOST}/api/v1`;

/** Base WebSocket (socket.io), ex: wss://test-api.cryptobingo.bet */
export const WS_BASE = WS_HOST;

/** API pública AtomicAssets (testnet). */
export const ATOMIC_API =
    import.meta.env.VITE_ATOMIC_API || 'https://wax-testnet.api.atomicassets.io/atomicassets/v1';

/** Host da API (sem /api/v1) — útil para montar URLs de socket por namespace. */
export const API_HOST_RESOLVED = API_HOST;
