// apps/swap-ui/src/hooks/useWallet.tsx
// Contexto de carteira Wharfkit para o swap-ui.
// Suporta Anchor Wallet e Cloud Wallet (WAX mainnet/devnet).

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Session, SessionKit } from '@wharfkit/session';
import { WebRenderer } from '@wharfkit/web-renderer';
import { WalletPluginAnchor } from '@wharfkit/wallet-plugin-anchor';
import { WalletPluginCloudWallet } from '@wharfkit/wallet-plugin-cloudwallet';

const CHAIN_ID  = import.meta.env.VITE_CHAIN_ID  || '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';
const RPC_URL   = import.meta.env.VITE_WAX_RPC_URL || 'http://127.0.0.1:8888';

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
