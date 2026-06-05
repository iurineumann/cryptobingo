// apps/frontend/src/types/events.ts
// Tipos compartilhados dos eventos WebSocket do Broadcaster.
// Ref: ADR-007, asyncapi.yaml v1.1.0

/** Vencedor de um jogo, emitido via winner_found. */
export interface WinnerPayload {
    account:     string;   // Conta Antelope do vencedor (ex: "jogador1")
    ticket_id:   string;   // ID da cartela vencedora (uint64 como string)
    win_pattern: string;   // Nome do padrão (ex: "ROW_2", "DIAG_TL_BR")
    payouts:     string[]; // Valores liquidados (ex: ["10.0000 WAX"])
}
