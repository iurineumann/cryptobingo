# ADR-001: Implementação de Assinatura Contextual (Anti-Replay)

*   **Status:** Aceito
*   **Contexto:** O sistema precisa garantir que cartelas de bingo geradas pelo backend não sejam interceptadas e reutilizadas por terceiros (ataques de replay).
*   **Decisão:** A assinatura digital de cada cartela será baseada no hash: `SHA256(matrix + game_id + account_name)`. O Smart Contract validará essa assinatura no momento da compra (`buytickets`).
*   **Consequências:** 
    *   Aumenta a segurança, vinculando a cartela unicamente ao usuário.
    *   O Backend precisa estar ciente da `account_name` do solicitante durante a geração da cartela (`/generate`).
    *   O contrato C++ deve realizar a verificação criptográfica antes de processar a compra.