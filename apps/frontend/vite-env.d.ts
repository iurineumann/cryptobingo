/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_GATEWAY_URL: string;
    readonly VITE_CHAIN_ID: string;
    readonly VITE_RPC_URL: string;
    readonly VITE_JOGADOR1_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}