// apps/frontend/src/hooks/useNfts.ts
// Hook que busca os NFTs do jogador autenticado no api-gateway.
// Os dados vêm do cache MongoDB (TTL 5min) para não sobrecarregar o nó RPC.

import { useState, useEffect } from 'react';
import { getAuthToken }        from '../services/api';

export interface NftAsset {
    asset_id:       string;
    schema_name:    string;
    name:           string;
    backed_tokens:  string;
    template_id?:   number;
    collection_name?: string;
    img_url?:       string;
}

export function useNfts() {
    const [assets,   setAssets]   = useState<NftAsset[]>([]);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState<string | null>(null);

    useEffect(() => {
        if (!getAuthToken()) return;

        setLoading(true);
        fetch(`${import.meta.env.VITE_API_GATEWAY_URL}/api/v1/nfts/my-assets`, {
            headers: { Authorization: `Bearer ${getAuthToken()}` },
        })
            .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
            .then(data => setAssets(data.assets ?? []))
            .catch(err => setError(String(err)))
            .finally(() => setLoading(false));
    }, []);

    return { assets, loading, error };
}
