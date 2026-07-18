// apps/frontend/src/utils/gameStatus.ts
// Helpers de status de jogo compartilhados entre Lobby e LandingPage.
// Evita duplicação de isWithinSlowReveal / resolveDisplayStatus.
// Ref: C2 — §3.4 do .hermes-CONTEXT.md

import { FUNDING_WINDOW_SEC, type BlockchainGameState } from '@cryptobingo/shared-types';

const REVEAL_INTERVAL_MS   = 3000;
const SLOW_REVEAL_WINDOW   = FUNDING_WINDOW_SEC * 1000 + 75 * REVEAL_INTERVAL_MS;

/**
 * Verifica se um jogo ainda está dentro da janela de Slow Reveal.
 * Usa o game_id (timestamp de criação) como referência.
 */
export function isWithinSlowReveal(gameId: string): boolean {
    return Date.now() - Number(gameId) < SLOW_REVEAL_WINDOW;
}

/**
 * Resolve o status de exibição de um jogo.
 * Jogos em 'drawn' ou 'archived' dentro da janela de slow reveal
 * são exibidos como 'drawing' (bolas ainda sendo reveladas).
 */
export function resolveDisplayStatus(g: BlockchainGameState): string {
    if (g.status === 'drawn') return 'drawing';
    if (g.status === 'archived' && isWithinSlowReveal(g.game_id)) return 'drawing';
    return g.status;
}
