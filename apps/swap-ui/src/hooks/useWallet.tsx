// apps/swap-ui/src/hooks/useWallet.tsx
// Contexto de carteira Wharfkit para o swap-ui.
// Suporta Anchor Wallet e Cloud Wallet (WAX mainnet/devnet).

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Session, SessionKit } from '@wharfkit/session';
import { WebRenderer } from '@wharfkit/web-renderer';
import { WalletPluginAnchor } from '@wharfkit/wallet-plugin-anchor';
import { WalletPluginCloudWallet } from '@wharfkit/wallet-plugin-cloudwallet';

const CHAIN_ID  = import.meta.env.VITE_CHAIN_ID  || 'f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12';
const RPC_URL   = import.meta.env.VITE_WAX_RPC_URL || 'https://testnet.waxsweden.org';

interface WalletContextValue {
    session:   Session | null;
    isLoading: boolean;
    connect:   () => Promise<void>;
    disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue>({
    session:    null,
    isLoading:  false,
    connect:    async () => {},
    disconnect: () => {},
});

let sessionKitInstance: SessionKit | null = null;

function getSessionKit(): SessionKit {
    if (sessionKitInstance) return sessionKitInstance;
    sessionKitInstance = new SessionKit({
        appName:  'bingogameswp',
        chains:   [{ id: CHAIN_ID, url: RPC_URL }],
        ui:       new WebRenderer(),
        walletPlugins: [
            new WalletPluginAnchor(),
            new WalletPluginCloudWallet(),
        ],
    });
    return sessionKitInstance;
}

export function WalletProvider({ children }: { children: ReactNode }) {
    const [session,   setSession]   = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const connect = useCallback(async () => {
        setIsLoading(true);
        try {
            const kit    = getSessionKit();
            const result = await kit.login();
            setSession(result.session);
        } catch {
            // usuário fechou o modal — sem ação
        } finally {
            setIsLoading(false);
        }
    }, []);

    const disconnect = useCallback(() => {
        sessionKitInstance?.logout(session ?? undefined);
        setSession(null);
    }, [session]);

    return (
        <WalletContext.Provider value={{ session, isLoading, connect, disconnect }}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWallet(): WalletContextValue {
    return useContext(WalletContext);
}
