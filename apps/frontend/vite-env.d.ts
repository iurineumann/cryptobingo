/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_GATEWAY_URL:   string;
    readonly VITE_CHAIN_ID:          string;
    readonly VITE_RPC_URL:           string;
    readonly VITE_CONTRACT_ACCOUNT:  string;
    readonly VITE_EXPLORER_URL:      string;

    // WebSocket Broadcaster (ADR-007)
    // Vazio em dev (proxy Vite) — URL completa em produção (wss://...)
    readonly VITE_WS_URL:            string;
    readonly VITE_WS_URL_INTERNAL:   string;

    // DEV-ONLY: tree-shaken pelo Vite em produção
    readonly VITE_DEV_ACTOR:         string | undefined;
    readonly VITE_DEV_PRIVATE_KEY:   string | undefined;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
