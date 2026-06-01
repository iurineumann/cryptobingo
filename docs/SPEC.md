# SPEC.md: Especificação Mestre de Arquitetura e Regras de Negócios

**Domínio:** Plataforma Descentralizada de Bingo GameFi
**Rede Alvo:** Antelope (WAX/EOS)
**Padrões Arquiteturais:** Spec-Driven Development (SDD), CQRS, Event-Driven Architecture (EDA), Bitmasking Algébrico.

---

## 1. Topologia de Dados On-Chain (Smart Contract RAM)

A máquina de estados e o armazenamento financeiro devem utilizar os tipos primitivos estritos do C++ (CDT). O gerenciamento de múltiplas moedas exige obrigatoriamente o uso de `extended_asset` para proteção contra falsificação de contratos emissores.

### 1.1. Tabela: `balances` (Wallet Interna)

Gerencia a custódia fracionada e multimoeda dos jogadores com complexidade $O(1)$ para depósitos e saques.

* **Scope:** `account_name` (A tabela é instanciada individualmente por usuário).
* **Primary Key:** `symbol_code` (O ticker da moeda, ex: `WAX`, `TLM`).

| Campo | Tipo CDT | Restrições / Notas |
| --- | --- | --- |
| `balance` | `extended_asset` | Contém o valor (`int64_t`), o símbolo e a conta do contrato emissor (`name`). Rejeita assertivamente `amount < 0`. |

### 1.2. Tabela: `games` (Máquina de Estados)

Controla o ciclo de vida global de cada rodada e o armazenamento da entropia (RNG).

* **Scope:** `_self` (Global do Contrato).
* **Primary Key:** `game_id` (`uint64_t`, auto-incremental).

| Campo | Tipo CDT | Restrições / Notas |
| --- | --- | --- |
| `game_id` | `uint64_t` | Identificador unívoco. |
| `status` | `name` | FSM Enum: `CREATED`, `FUNDING`, `LOCKED`, `DRAWING`, `ARCHIVED`, `ABORTED`. |
| `ticket_price` | `extended_asset` | Valor unitário de entrada. Permite `0` para rodadas "Free-to-Play". |
| `prize_pool` | `extended_asset` | Arrecadação principal proveniente da venda de cartelas. |
| `sponsor_pool` | `vector<extended_asset>` | Array dinâmico suportando $N$ tokens patrocinados pela mecânica B2B. |
| `end_time` | `time_point_sec` | Timestamp de transição para `ARCHIVED` ou `ABORTED`. Base para o TTL de 24h do GC. |
| `drawn_balls` | `vector<uint8_t>` | Array serializado de 75 posições. Permanece vazio até o evento `receiverand`. |
| `campaign_id` | `uint64_t` | Relacionamento (Foreign Key) com a tabela `campaigns`. `0` se não for patrocinado. |

### 1.3. Tabela: `tickets` (Índice de Cartelas)

Armazena a matriz estática vendida aos usuários.

* **Scope:** `game_id` (Isolamento de memória para facilitar o Garbage Collection em lote).
* **Primary Key:** `ticket_id` (`uint64_t`, gerado pelo Backend off-chain e garantido como único).
* **Secondary Index:** `owner` (`uint64_t` casted from `name`) - Permite a varredura $O(n)$ de *Refunds* e montagem do Painel do Jogador.

| Campo | Tipo CDT | Restrições / Notas |
| --- | --- | --- |
| `ticket_id` | `uint64_t` | Hash/ID provido na submissão de compra. |
| `owner` | `name` | Conta pagadora e beneficiária. |
| `matrix` | `vector<uint8_t>` | Exatas 24 posições ordinais (índices 0 a 24, pulando o 12 correspondente ao *FREE SPACE*). Valores devem estar em `[1, 75]`. |

### 1.4. Tabela: `campaigns` (Motor de Patrocínio B2B)

Gerencia a liquidez provida por parceiros de forma *trustless*.

* **Scope:** `_self` (Global do Contrato).
* **Primary Key:** `campaign_id` (`uint64_t`).

| Campo | Tipo CDT | Restrições / Notas |
| --- | --- | --- |
| `sponsor` | `name` | Autorizador e destino potencial de estornos. |
| `total_budget` | `extended_asset` | Liquidez travada total. |
| `payout_per_game` | `extended_asset` | Fração a ser deduzida a cada execução de `linkgame()`. |
| `leftover_policy` | `name` | Diretriz de liquidação residual: `REFUND` (Devolve ao sponsor) ou `HOUSE` (Tesouraria). |

---

## 2. Interface Binária de Aplicação (ABI) e Assinaturas

A comunicação mutável com o contrato segue assinaturas rigorosas e delegação de autoridades (Auth).

### 2.1. Ingestão de Compras (Batch Processing)

* **Assinatura:** `buytickets(name buyer, uint64_t game_id, bytes[] matrices, signature[] signatures, uint64_t nft_id)`
* **Auth Exigido:** `buyer@active`
* **Fluxo de Validação:**
1. Valida `game.status == "funding"` e limites da sala.
2. Se `nft_id != 0`, aplica desconto do NFT na tabela `nftconfigs`.
3. Deduz `matrices.size() * ticket_price` da tabela `balances` do `buyer`.
4. Para cada cartela: serializa `matrix + game_id + buyer`, calcula SHA-256, e executa `assert_recover_key(hash, signature, config.signer_key)` — garantindo que foi assinada pelo microserviço.
5. O hash é usado como `ticket_id` (anti-replay).
6. Executa `emplace` em lote na tabela `tickets`.

**Pré-requisito:** O contrato precisa ter a configuração inicializada via `setconfig(public_key signer_key)` com a chave pública do microserviço. Executado pelo script `init_dev_env.sh` na seção 8b.



### 2.2. Liquidação de Prêmios (Max Weight Payout)

* **Assinatura:** `claimwin(uint64_t game_id, uint64_t ticket_id, uint8_t ball_count, uint64_t win_pattern_mask)`
* **Auth Exigido:** `microservice@active`
* **Regra de Pagamento Único (Max Weight):** A cartela pode preencher múltiplos padrões. O worker off-chain seleciona o padrão/combinação de maior `weight` dentre todos os vencedores. O contrato recebe apenas o `win_pattern_mask` correspondente ao maior peso e paga exclusivamente aquele.
* **Cálculo Matemático (modo gametype, `gametype_id > 0`):**
O prêmio é calculado com base no weight do padrão vencedor (armazenado em hundredths — 1.50 → 150):

$$Prize = ticket\_price \times base\_multiplier \times \frac{win\_weight}{100}$$

* **Cálculo Matemático (modo legado, `gametype_id == 0`):**
Para jogos sem gametype definido, mantém-se o RTP fixo de 85% do prize_pool (retrocompatível):

$$Valor\_RTP = \frac{(prize\_pool.amount \times 85)}{100}$$

* **Distribuição:** credita o prêmio em `balances[owner]`; itera sobre `sponsor_pool` e credita integralmente cada `extended_asset` na mesma `balances[owner]` (multidrop).



---

## 3. Motor de Resolução Backend (CQRS & Algometria)

O microsserviço Node.js atua sob o padrão *Command Query Responsibility Segregation*. A varredura pesada ($O(n^2)$) é substituída por indexação invertida e Álgebra Booleana em espaço de $O(1)$.

### 3.1. Inteligência de Geração Aleatória (Cartel RNG)

Para ampliar a variância espectral das rodadas, as matrizes utilizam a lógica de **Permutação sem repetição** (Arranjos), abandonando a restrição de ordenação crescente clássica.
A geração de entropia no Backend para a coluna "B" (range de 1 a 15, escolhendo 5 posições) gera exatas $P(15,5) = 360.360$ variações. O algoritmo de geração aplica o *Fisher-Yates Shuffle*.
Para garantir unicidade por rodada, o hash serializado é validado atomicamente via comando `SADD` no Redis.

### 3.2. Estruturação do Índice Invertido (Redis)

No exato milissegundo de transição para o estado `LOCKED`, o *Resolution Engine Worker* processa a tabela on-chain `tickets` e constrói o índice reverso em RAM no Redis:

* **Chave:** `game:{game_id}:ball:{numero_da_dezena}`
* **Estrutura:** Lista de Tuplas `[{ticket_id, bit_index}]` onde `bit_index` $\in [0, 24]$.

### 3.3. Máscaras Algébricas de Validação (Bitmasking)

Seja $P$ o conjunto matemático contendo os índices exatos (de 0 a 24) necessários para uma condição de vitória (ex: Linha, Coluna, Diagonal). A máscara constante inteira $M$ pré-compilada no TypeScript é definida pela fórmula:


$$M = \sum_{p \in P} 2^p$$

* **Estado Transitório:** O progresso de cada cartela é rastreado por um `uint32_t` que inicia com o bit 12 (*Free Space*) já computado: `estado = 0x00001000`.
* **Processamento Atômico:** Ao receber o evento da dezena sorteada via `orng.wax`, o servidor recupera o índice invertido do Redis e executa a operação `Bitwise OR` seguida por um `Bitwise AND` contra a Máscara da rodada:
```typescript
estado[ticket_id] |= (1 << bit_index);
if ((estado[ticket_id] & MASK_CONDICAO) === MASK_CONDICAO) {
   // Dispara evento de Winner Found
}


### 3.4. Motor de Simulação Monte Carlo (Weight Calibration)

Endpoint: `POST /api/v1/admin/simulate-weights`

Simula N rodadas completas para calibrar os weights de um gametype antes do deploy on-chain:

1. **Patterns individuais:** gera `n_cards` cartelas aleatórias, aplica bolas progressivas (Fisher-Yates criptográfico) até cada cartela atingir algum padrão. Acumula `hits` e `avg_balls_needed` por padrão, calcula `hit_rate`.
2. **Combinações:** cláusulas `all_of` (cartela precisa acertar todos os patterns listados), `any_of` (pelo menos um), `n_of_type` (N patterns de um tipo, ex: 2 linhas). Avaliadas após os patterns individuais, aplicando a regra max_weight.
3. **Payout:** `ticket_price * base_multiplier * max_win_weight / 100`. Retorna `rtp_pct`, `ggr_pct`, `pattern_stats`, `alerts` (RTP fora de 75%–98%) e `is_viable`.

#### 3.4.1. Frontend: handleSuggest (3 fases)

O botão "Suggest Standard Patterns" no `GametypesAdmin.tsx` executa:

- **Fase 1 — Medição de hit_rates:** simula 5.000 rodadas com os padrões individuais selecionados. Hit_rates são probabilidades puras (independentes dos pesos), então 1 única simulação basta.
- **Fase 2 — Cálculo analítico de pesos iniciais:** usa a fórmula de inverse hit_rate com escala direta ao RTP alvo: `w_i = (0.85 × 100) / (N × base_mul × hit_rate_i)`. Derivação: com `w_i = C / hit_rate_i`, a soma `Σ hit_rate_i × w_i / 100 × base_mul = C × N × base_mul / 100 = 85%` por construção. Esta fórmula distribui a contribuição ao RTP igualmente entre os padrões e fornece um ponto de partida próximo ao alvo — padrões raros recebem multiplicadores significativamente maiores (sem limite artificial de 5x).
- **Fase 2b — Geração de combinações:** 3 estratégias — N-of-type (2..5 do mesmo tipo), pares top-5 hit_rate, especial+simples. Pesos das combinações baseados nos pesos individuais calculados na Fase 2 (corrige bug onde `McPatternStats.weight` era sempre 0).
- **Fase 3 — Calibração iterativa de RTP:** re-simula com config completo (individuais + combos). Se RTP fora de 85% ± 2%, escala todos os pesos proporcionalmente (`scale = target/rtp`, clamped 0.4x–2.5x) e re-simula. Máximo 6 iterações com 5.000 rodadas cada. Partindo de pesos próximos ao alvo, converge em 1-3 iterações. Aplica os pesos finais calibrados (Fase 3) ao `selectedRules`, não os pesos iniciais da Fase 2.
- **Suporte a 1 padrão único:** quando apenas 1 padrão está selecionado, o algoritmo funciona normalmente (single pattern = contribuição total ao RTP), sem geração de combinações.

---

## 4. Comunicação de Eventos (AsyncAPI & Idempotência)

O servidor não envia estados brutos para o Frontend; ele orquestra uma Máquina de Estados Reativa no cliente.

### 4.1. Resiliência e Sequenciamento de Payload

O evento central do jogo utiliza um *Sequence Identifier* (`order`) para tratar interrupções de conexão (ex: oscilação de rede 4G/5G do celular).

* **Canal Base:** `wss://[ws.seubingo.com/v1/stream](https://ws.seubingo.com/v1/stream)`
* **Suscrição:** `socket.emit('subscribe', { room: 'game_105' })`
* **Idempotência:**
O Payload de `ball_drawn` carrega o campo ordinal. O cliente React/Vue mantém a variável `last_order_received`. Se uma mensagem chegar com $\Delta > 1$ (ex: saltar da bola 14 para 16), o Frontend ignora a fila de animação momentaneamente e dispara um *Fallback Polling* REST para recuperar o estado faltante antes de prosseguir com a renderização visual.

### 4.2. Desacoplamento Visual (Slow Reveal)

O processamento On-chain e Backend resolvem a totalidade da rodada instantaneamente. O nó *Broadcaster Worker* atua como um barramento de *delay* proposital:

1. Armazena o array processado em memória de *Buffer*.
2. Dispara um evento de Socket.io a cada $\approx 3.000$ milissegundos.
3. Orquestra o disparo do evento `winner_found` no tempo exato da animação visual da "Bola da Vitória" na interface do usuário, garantindo a sincronicidade psicológica (suspense e resolução).

---

## 5. Garbage Collection e Engenharia de Custos (DevOps e RAM)

A viabilidade econômica do contrato Antelope depende da alocação volátil (Time-To-Live).

### 5.1. Ciclo de Limpeza Positiva (Happy Path)

1. Após o `claimwin()`, `end_time` é registrado.
2. Início de Quarentena estrita de $24$ horas. Durante este período, o Frontend renderiza auditorias cruzando `games` e `tickets`.
3. Após $T > end_time + 24h$, qualquer nó executa `cleargame()`. O comando `erase` na tabela `tickets` desaloca iterativamente a memória RAM e reembolsa o `WAX` para a tesouraria administrativa. O recibo imutável (Action Log) consolida o *Audit Trail*.

### 5.2. Ciclo de Falha e Reembolso $O(1)$ (Fail-Safes)

Em casos de inatividade do `orng.wax` ou falta de quórum, transita-se o status para `ABORTED`.
A ação `refundticket(game_id, ticket_id)` executa o estorno sem gargalos iterativos. O Backend processa o lote de devoluções no ritmo tolerado pelo limite de CPU do bloco da WAX (cerca de 30ms max execution time), removendo a linha e devolvendo os recursos financeiros para a conta `balances` simultaneamente. O usuário mantém a autonomia de acionar este *fail-safe* independentemente da plataforma.
