import { SessionKit } from '@wharfkit/session';
import { WebRenderer } from '@wharfkit/web-renderer';
import { WalletPluginAnchor } from '@wharfkit/wallet-plugin-anchor';
import { WalletPluginCloudWallet } from '@wharfkit/wallet-plugin-cloudwallet';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';

// Usamos a mesma rede de desenvolvimento local (Dune) configurada no backend
const chainConfig = {
    id: import.meta.env.VITE_CHAIN_ID,
    url: import.meta.env.VITE_RPC_URL
};

// Interface visual padrão do Wharfkit
const ui = new WebRenderer();

export const sessionKit = new SessionKit({
    appName: 'CryptoBingo',
    chains: [chainConfig],
    ui: ui,
    walletPlugins: [
        new WalletPluginAnchor(), // Suporte para Anchor Wallet (celular e desktop)
        new WalletPluginCloudWallet(), // Suporte para WAX Cloud Wallet
        new WalletPluginPrivateKey(import.meta.env.VITE_JOGADOR1_KEY)
    ],
});