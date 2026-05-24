import type { MongoUserProfile } from '@cryptobingo/shared-types';

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL + '/api/v1';

/**
 * Busca o perfil do jogador no banco de dados
 */
export async function fetchUserProfile(walletAddress: string): Promise<MongoUserProfile> {
    const response = await fetch(`${API_BASE_URL}/profile?wallet=${walletAddress}`);
    if (!response.ok) {
        throw new Error('Falha ao buscar perfil da API');
    }
    return response.json();
}

/**
 * Atualiza o idioma do jogador no MongoDB
 */
export async function updateUserLocale(walletAddress: string, locale: string): Promise<void> {
    await fetch(`${API_BASE_URL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: walletAddress, locale })
    });
}