# ADR 004: Dynamic Bitmasking para Padrões de Vitória

## Status
Aceito — Fase 1 implementada (2026-05-25); Fase 2 (padrões dinâmicos on-chain) pendente

## Contexto
Atualmente, o CryptoBingo opera de forma rígida em relação às condições de vitória. Para escalar como uma plataforma GameFi, precisamos permitir a criação dinâmica de modos de jogo (ex: "Linha Rápida", "Letra G", "Cartela Cheia") sem a necessidade de redeploy do Smart Contract `bingo.game` a cada novo evento. 
Validar posições X,Y (ex: `[1,2], [3,4]`) de forma iterativa no C++ (Smart Contract) durante a chamada `claimwin` consumiria excessivos recursos de CPU da blockchain Antelope/WAX, encarecendo a operação.

## Decisão
1. **Representação Binária (Bitmask):** Adotaremos a representação da matriz 5x5 do Bingo como um número inteiro não assinado de 32 bits (`uint32_t`). Os 25 primeiros bits representarão as 25 casas da cartela (onde 1 é preenchido e 0 é vazio).
2. **Tabelas de Configuração On-Chain:**
   - **`patterns`**: Armazenará o ID do padrão, um nome descritivo (ex: "Diagonal Principal") e a sua `mask` (`uint32_t`).
   - **`gametypes`**: Armazenará o ID do tipo de jogo, nome, um `base_pool` e um vetor de regras (`std::vector<pattern_rule>`), onde cada regra vincula um `pattern_id` a um `weight` (peso multiplicador).
3. **Validação Algorítmica no Contrato:** Na ação `claimwin`, o Smart Contract converterá a cartela do usuário numa bitmask (`ticket_mask`) contendo apenas os números que deram *match* com as bolas sorteadas pelo oráculo.
4. **Cálculo de Vitória (O(1)):** A validação passará a ser uma simples operação Bitwise AND: `if ((ticket_mask & pattern_mask) == pattern_mask)`.

## Consequências
### Positivas
* **Eficiência Computacional Extrema:** O cálculo Bitwise resolve o match de 25 casas numa única instrução de CPU, reduzindo drasticamente as taxas da rede.
* **Extensibilidade:** O painel de administração (Backend/Frontend) poderá criar qualquer combinação geométrica possível e injetá-la no contrato com uma simples transação.

### Negativas/Riscos
* **Complexidade no Frontend:** A interface administrativa terá de abstrair a complexidade. O administrador clica numa grelha visual (UI), mas o TypeScript terá de gerar o decimal correspondente a esses bits para enviar à API.

## Referências
* Engenharia de Máscaras de Bits em C++ para Sistemas de Alta Frequência.

---

## Implementação Realizada (Sprint 2026-05-25)

### Fase 1 — Motor Off-Chain (`evaluator.ts`)

O algoritmo O(1) foi implementado em `apps/worker-game-loop/src/services/evaluator.ts`
com as seguintes constantes e funções exportadas:

**Layout de bit da cartela 5x5 (coluna-maior):**
```
Col:  B    I    N    G    O
Row0: [0]  [5]  [10] [15] [20]
Row1: [1]  [6]  [11] [16] [21]
Row2: [2]  [7] [12*] [17] [22]   (* FREE SPACE — bit 12 sempre setado)
Row3: [3]  [8]  [13] [18] [23]
Row4: [4]  [9]  [14] [19] [24]
```

**`WIN_PATTERNS: Record<string, bigint>`** — 12 máscaras pré-compiladas:
- ROW_0 a ROW_4 (5 linhas horizontais)
- COL_B a COL_O (5 colunas verticais)
- DIAG_TL_BR, DIAG_TR_BL (2 diagonais, ambas incluem FREE SPACE)

**`applyDrawnBalls(ticket, drawnBalls): number`**
- `drawnBalls` convertido em `Set<number>` para lookup O(1)
- Itera 25 bits (pula bit 12), aplica OR bitwise se número estiver no Set
- Mapeamento: `bit_index < 12 ? matrix[bit_index] : matrix[bit_index - 1]`

**`checkWinPattern(state): { patternName, patternMask } | null`**
- Operação `(BigInt(state) & mask) === mask` contra as 12 máscaras
- Retorna o primeiro padrão vencedor encontrado

**`findAllWinners(gameId, drawnBalls): Promise<WinResult[]>`**
- Varredura paginada via `get_table_rows` (100 tickets/página)
- Cursor avança por `BigInt(lastTicketId) + 1n`
- Sem limite de memória — suporta jogos com N tickets arbitrário

### Fase 2 — Pendente (on-chain)

Tabelas `patterns` e `gametypes` no `bingo.hpp` ainda não implementadas.
Quando implementadas, o `evaluator.ts` deverá buscar as máscaras dinâmicas
do contrato em vez de usar as constantes compiladas.

### Dívidas Técnicas Registradas
- `[DEBT]` Testes unitários do evaluator com cobertura dos 12 padrões ausentes
- `[DEBT]` `fsm.test.ts` usa `win_pattern_mask: UInt64.from(1)` hardcoded
- `[DEBT]` Tabelas `patterns`/`gametypes` on-chain não implementadas (Fase 2)