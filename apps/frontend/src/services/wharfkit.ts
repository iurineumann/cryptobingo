// apps/frontend/src/services/wharfkit.ts
// Configuração central do SessionKit.
// WalletPluginPrivateKey é importado de forma estática aqui apenas para o
// SessionKit ter conhecimento dos plugins disponíveis — mas o login rápido de
// dev em App.tsx usa import dinâmico guardado por import.meta.env.DEV.
// Ref: ADR-002, Hardening-5

import { SessionKit } from '@wharfkit/session';
import { WebRenderer } from '@wharfkit/web-renderer';
import { WalletPluginAnchor } from '@wharfkit/wallet-plugin-anchor';
import { WalletPluginCloudWallet } from '@wharfkit/wallet-plugin-cloudwallet';

const rpcUrl = import.meta.env.DEV  || import.meta.env.VITE_DEV_SESSION
    ? window.location.origin 
    : import.meta.env.VITE_RPC_URL;

    console.log(`[Wharfkit] RPC URL configurada para: ${rpcUrl}`);

const chainConfig = {
    id: import.meta.env.VITE_CHAIN_ID,
    url: rpcUrl,
};

const ui = new WebRenderer();

// Plugins de produção: Anchor (mobile/desktop) e WAX Cloud Wallet.
// WalletPluginPrivateKey NÃO está aqui — nunca vai para o bundle de produção.
export const sessionKit = new SessionKit({
    appName: 'CryptoBingo',
    chains: [chainConfig],
    ui,
    walletPlugins: [
        new WalletPluginAnchor(),
        new WalletPluginCloudWallet(),
    ],
});
