/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_GATEWAY_URL:   string;
    readonly VITE_CHAIN_ID:          string;
    readonly VITE_RPC_URL:           string;
    readonly VITE_CONTRACT_ACCOUNT:  string;

    // URL do block explorer para links de transação (ex: wax.bloks.io em produção)
    readonly VITE_EXPLORER_URL:      string;

    // DEV-ONLY: presentes apenas no .env local, nunca em produção.
    // Opcionais (string | undefined) — tree-shaken pelo Vite em produção.
    readonly VITE_DEV_ACTOR:         string | undefined;
    readonly VITE_DEV_PRIVATE_KEY:   string | undefined;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
