# ADR 005: Economia de Fixed-Odds Relativas e Fundo Global (Treasury)

## Status
Aceito (Revisão 3) — Fases 1, 2 e 3 implementadas (2026-05-25)

## Contexto
A plataforma CryptoBingo precisa de uma mecânica de pagamentos que seja atrativa para os jogadores (prêmios previsíveis e escaláveis) e segura para o Smart Contract (baixo consumo de CPU e proteção contra insolvência). O modelo inicial de *Pari-Mutuel* ou "Lock de Exposição Máxima" mostrou-se ineficiente para a escala almejada.

## Decisão

1. **Cálculo Relativo ao Ticket (Ticket-Based Payout):**
   O prêmio de uma cartela não será um valor estático dividido, mas sim um multiplicador do valor pago pelo jogador.
   - Fórmula On-Chain: `Prize = Ticket_Price * Game_Base_Multiplier * (Pattern_Weight / 100)`.
   - O `weight` é armazenado em **hundredths** (uint16_t): 1.50 → 150, 5.00 → 500, max 255.00 → 25500.
   - *Exemplo:* Ticket custa 2 $BINGO. O `Game_Base_Multiplier` é 1. O padrão "BIG G" tem `weight` 150 (1.50x). Prêmio = 2 * 1 * 150 / 100 = 3 $BINGO.

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
extended_asset rtp = game_itr->total_wagered;
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

### Fase 2 — max_weight payout no contrato (`bingo.cpp`)

Implementado em `claimwin()` para jogos com `gametype_id > 0`:
```cpp
// Fórmula: ticket_price * base_multiplier * win_weight / 100 (weight em hundredths)
payout.quantity.amount =
    payout.quantity.amount * (int64_t)gt_itr->base_multiplier * (int64_t)win_weight / 100;
```
- Modo legado (`gametype_id = 0`): RTP fixo 85% do total_wagered (retrocompatível)
- `win_weight`: extraído da regra do gametype cujo `pattern.mask == win_pattern_mask`
- Worker off-chain seleciona o max_weight entre todos os padrões vencedores da cartela

### Fase 3 — Motor Monte Carlo (`monteCarloController.ts`)

Endpoint: `POST /api/v1/admin/simulate-weights`

Algoritmo (por rodada):
1. Embaralha 75 bolas com Fisher-Yates criptográfico (`crypto.randomInt`)
2. Gera N cartelas aleatórias com distribuição BINGO por coluna
3. Aplica bolas progressivamente até encontrar padrão vencedor (stop na 1ª vitória)
4. Aplica max_weight rule para selecionar o padrão de maior multiplicador
5. Acumula payout = `ticket_price * base_multiplier * max_weight`

Métricas retornadas:
- `rtp / rtp_pct`: Return to Player real simulado
- `ggr / ggr_pct`: Gross Gaming Revenue (margem da casa)
- `pattern_stats`: hits, hit_rate, avg_balls_needed por padrão
- `alerts`: RTP < 75% ou RTP > 98%
- `is_viable`: boolean de aprovação

Suporte a combinações: `all_of`, `any_of`, `n_of_type` avaliados após patterns individuais aplicando a regra max_weight.
Calibração RTP: o frontend `handleSuggest` executa 3 fases — (1) sugere pesos individuais inversamente proporcionais ao hit_rate, (2) gera combinações candidatas, (3) re-simula com o config completo e escala iterativamente todos os pesos até RTP ≈ 85% (±3%).

Limites: máx 100.000 simulações; worker_threads para > 5.000 rodadas.

### Weight Storage (Hundredths)

O campo `pattern_rule.weight` foi alterado de `uint8_t` (1–255) para `uint16_t` (100–25500, hundredths) para suportar 2 casas decimais sem ponto flutuante on-chain. A conversão no frontend usa `parseFloat(v) × 100` ao submeter e `(w / 100).toFixed(2)x` para exibição. O contrato divide por 100 no cálculo do payout.

### Dívidas Técnicas Atualizadas

- `[DONE]` Motor Monte Carlo implementado
- `[DONE]` Fórmula max_weight implementada
- `[DONE]` Auto-sweep de GGR para tesouraria implementado (2026-06-04)

### Fase 4 — sweepggr + ggrpool (2026-06-04)

Action `settreasury(name account)`: configura `config.treasury_account` (auth: `bingo.game`).

Action `sweepggr(name token_contract, symbol_code sym)` (auth: `bingo.game`):

1. Lê `ggrpool` para o símbolo solicitado
2. Valida `treasury_account` configurado e diferente do próprio contrato
3. Apaga a entrada do pool (antes do transfer — re-entrância prevention)
4. Emite `token_contract::transfer` para `treasury_account`

Acumulação do GGR:

- `game_state.total_paid` (int64, default 0): acumulado em `claimwin` e `claimstage`
- `closegame`: calcula `ggr = total_wagered.amount - total_paid`; se `ggr > 0`, acumula em `ggrpool`
- Jogos sem vencedor (`drawn → archived` direto): 100% do total_wagered vai para GGR
- GGR de sponsor_pool não é capturado (sponsors contribuem 100% como prêmio)

Tabela `ggrpool` (multi_index, chave: `symbol_code.raw()`): acumulador persistente, um row por token.
