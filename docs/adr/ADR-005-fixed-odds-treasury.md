# ADR 005: Economia de Fixed-Odds Relativas e Fundo Global (Treasury)

## Status
Aceito (Revisão 2) — Fase 1 implementada (2026-05-25); Fase 2 (max_weight payout) pendente

## Contexto
A plataforma CryptoBingo precisa de uma mecânica de pagamentos que seja atrativa para os jogadores (prêmios previsíveis e escaláveis) e segura para o Smart Contract (baixo consumo de CPU e proteção contra insolvência). O modelo inicial de *Pari-Mutuel* ou "Lock de Exposição Máxima" mostrou-se ineficiente para a escala almejada.

## Decisão

1. **Cálculo Relativo ao Ticket (Ticket-Based Payout):**
   O prêmio de uma cartela não será um valor estático dividido, mas sim um multiplicador do valor pago pelo jogador.
   - Fórmula On-Chain: `Prize = Ticket_Price * Game_Base_Multiplier * Pattern_Weight`.
   - *Exemplo:* Ticket custa 2 $BINGO. O `Game_Base_Multiplier` é 1. O padrão "BIG G" tem `weight` 20. Prêmio = 2 * 1 * 20 = 40 $BINGO.

2. **Regra de Pagamento Único (Max Weight Payout):**
   Para evitar a sangria da tesouraria por sobreposição geométrica de padrões (ex: um jogador preenche 4 linhas e também as diagonais na mesma cartela), o Smart Contract avaliará todas as bitmasks preenchidas, mas pagará **exclusivamente a combinação que oferecer o maior multiplicador (weight)** para aquela cartela.

3. **Fundo Unificado de Tesouraria (Global Treasury Bankroll):**
   Em vez de bloquear a liquidez máxima possível a cada rodada, o contrato confiará num pool de liquidez global (Tesouraria). A probabilidade matemática de eventos raros (Sorteio de 25 bolas num universo de 75) combinada com a "Lei dos Grandes Números" garante a solvência da casa.
   - A tesouraria será capitalizada inicialmente através da emissão de Tokens/Packs NFTs.
   - Sponsors poderão injetar fundos neste pool em troca de exposição de marca em `gametypes` específicos.

## Consequências
### Positivas
* **UX/UI Consistente:** O jogador sabe exatamente quanto pode ganhar baseado no quanto gastou na cartela.
* **Otimização Extrema de CPU:** O C++ apenas guarda em memória o `max_weight` encontrado durante o loop de bitmasking, realizando um único cálculo financeiro no final.
* **Eficiência de Capital:** A liquidez do dApp não fica "congelada" em salas ociosas. O capital flui livremente do Fundo Global para os vencedores sob demanda.

### Negativas/Riscos
* Exige que a equipe matemática (off-chain) simule os padrões no pacote `apps/harness` usando o Método de Monte Carlo para garantir que a soma das probabilidades multiplicadas pelos pesos mantenha um RTP (Return to Player) global sustentável (ex: 85% a 95%).

## Referências
* Modelagem de Slots e Fixed-Odds, Bitwise Operators in C++, Law of Large Numbers in GameFi.

---

## Implementação Realizada (Sprint 2026-05-25)

### Fase 1 — RTP/GGR fixo no contrato (`bingo.cpp`)

Fórmula implementada na action `claimwin()`:
```cpp
// Multiplicação antes da divisão — previne Precision Loss (SPEC.md §2.2)
extended_asset rtp = game_itr->prize_pool;
rtp.quantity.amount = (rtp.quantity.amount * 85) / 100;
```
- GGR (15%) permanece na conta do contrato (não é subtraído explicitamente)
- Sponsor pool distribuído integralmente ao vencedor (Multidrop via loop em `sponsor_pool`)
- Cálculo auditável no Action Log público da blockchain

### Pipeline off-chain de claimwin (`rabbitmq.ts` → `evaluator.ts` → `blockchain.ts`)

`executeClaimWin(gameId, ticketId, ballCount, winPatternMask: bigint)` envia:
```typescript
data: {
    game_id:          gameId,
    ticket_id:        ticketId,
    ball_count:       ballCount,            // uint8
    win_pattern_mask: winPatternMask.toString() // uint64 → string para serialização Wharfkit
}
```

### Fase 2 — Pendente
- Refatorar `claimwin` para fórmula `Prize = Ticket_Price * Multiplier * Pattern_Weight`
- Implementar regra Max Weight Payout (paga apenas o padrão de maior weight)
- Motor Monte Carlo: `POST /api/v1/admin/simulate-weights` (ADR-005 + Épico 2)

### Dívidas Técnicas Registradas
- `[DEBT]` Auto-sweep de GGR para tesouraria não implementado
- `[DEBT]` Motor Monte Carlo pendente
- `[DEBT]` Fórmula `max_weight` não implementada no contrato (Fase 2)