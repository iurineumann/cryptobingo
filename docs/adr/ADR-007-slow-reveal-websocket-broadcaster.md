# ADR-007: Slow Reveal — WebSocket Broadcaster e Protocolo de Sincronização

**Data:** 2026-05-25
**Status:** Aceito
**Autores:** Célula de Engenharia CryptoBingo

---

## Contexto

Após o oráculo entregar a entropia ao contrato (`receiverand`), o campo `drawn_balls`
passa a conter os 75 números na ordem exata do sorteio. O contrato os tem todos
instantaneamente — mas a experiência do jogador exige que eles sejam revelados
progressivamente ("Slow Reveal"), criando tensão e engajamento.

A solução precisa:
- Revelar uma bola a cada ~3s sem comprometer a integridade do resultado final
- Suportar múltiplos jogos simultâneos com isolamento de estado por `game_id`
- Sobreviver a oscilações de rede (queda momentânea de conexão celular)
- Não adicionar estado persistente — o broadcaster é stateless entre partidas

---

## Decisão

### 1. Servidor: Socket.io no Worker Game Loop

O broadcaster roda como um servidor Socket.io na porta `8085`, colocado dentro
do `worker-game-loop`. Justificativa: o worker já tem o estado do jogo, acesso
ao RabbitMQ e executa as transações blockchain — é o único processo que sabe
exatamente quando o sorteio começou e qual é a sequência de bolas.

**Alternativa rejeitada:** broadcaster no `api-gateway`. Exigiria pub/sub entre
processos (Redis Pub/Sub ou outro canal), adicionando latência e complexidade
desnecessária para o MVP.

### 2. Trigger do Slow Reveal

O broadcaster não faz polling da blockchain. Ele é disparado internamente pelo
RabbitMQ via um novo evento `'startdraw'` — após `executeStartDraw()` confirmar
a transação, o worker aguarda o callback do oráculo (polling leve de 2s sobre
a tabela `games`) e então inicia o Slow Reveal com o array `drawn_balls` completo.

**Importante:** o array completo nunca é enviado ao cliente de uma vez. O
broadcaster mantém o array em memória e emite `ball_drawn` a cada 3s.

### 3. Protocolo de Mensagens (alinhado ao asyncapi.yaml existente)

**Servidor → Cliente:**

```json
// Evento: ball_drawn
{
  "event": "ball_drawn",
  "game_id": 1,
  "payload": {
    "order": 7,          // Sequence ID — chave de reconciliação
    "number": 42,        // Número revelado (1-75)
    "timestamp": "..."
  }
}

// Evento: winner_found
{
  "event": "winner_found",
  "game_id": 1,
  "payload": {
    "winning_ball": 42,
    "winners": [{ "account": "jogador1", "ticket_id": 3, "win_pattern": "ROW_2", "payouts": ["10.0000 WAX"] }]
  }
}

// Evento: game_locked
{ "event": "game_locked", "game_id": 1, "timestamp": "..." }

// Evento: game_aborted
{ "event": "game_aborted", "game_id": 1, "payload": { "reason": "ORACLE_TIMEOUT" } }
```

**Cliente → Servidor:**

```json
// Entrar na sala
{ "action": "subscribe", "game_id": 1 }

// Reconciliação: cliente detectou salto no order (ex: 5 → 8, perdeu 6 e 7)
{ "action": "sync", "game_id": 1, "last_order": 5 }
```

### 4. Reconciliação por Sequence ID

Cada `ball_drawn` carrega um campo `order` (1-75). O cliente mantém
`lastOrder` localmente. Se receber `order = N` e `lastOrder < N - 1`, houve
perda de pacotes — envia `sync` com `last_order = lastOrder`. O servidor
re-emite as bolas faltantes imediatamente (sem delay).

### 5. Autenticação no Handshake

O cliente envia o JWT no `auth` do handshake Socket.io:

```typescript
const socket = io(WS_URL, { auth: { token: getAuthToken() } });
```

O middleware do servidor valida o JWT antes de aceitar a conexão.
Conexões sem token válido são desconectadas imediatamente — prevenção de
exaustão de conexões (DDoS).

### 6. Isolamento por Room

Cada jogo tem sua própria room Socket.io: `game:${gameId}`.
O broadcaster emite apenas para a room correspondente.
Um cliente pode estar em múltiplas rooms simultaneamente (múltiplas abas).

---

## Consequências

**Positivas:**
- Stateless entre partidas — broadcaster descarta o array após emitir a última bola
- Reconciliação robusta sem banco de dados adicional
- Sem polling do frontend — push puro via WebSocket
- Isolamento total por game_id via rooms

**Negativas / Riscos:**
- Se o worker reiniciar durante um Slow Reveal, o estado de emissão se perde.
  Mitigação: o frontend detecta reconexão e consulta `drawn_balls` diretamente
  da blockchain via `get_table_rows` para reconstruir o estado atual.
- Porta `8085` precisa de ingress separado em produção (Kubernetes/NGINX).

---

## Arquivos Afetados

- `apps/worker-game-loop/src/services/broadcaster.ts` ← CRIAR
- `apps/worker-game-loop/src/services/rabbitmq.ts` ← ATUALIZAR (trigger do reveal)
- `apps/worker-game-loop/src/index.ts` ← ATUALIZAR (bootstrap do Socket.io)
- `apps/worker-game-loop/package.json` ← ATUALIZAR (socket.io)
- `apps/worker-game-loop/.env` ← ATUALIZAR (WS_PORT)
- `apps/frontend/src/hooks/useSlowReveal.ts` ← CRIAR
- `apps/frontend/src/components/BallDisplay.tsx` ← CRIAR
- `apps/frontend/src/components/Lobby.tsx` ← ATUALIZAR
- `apps/frontend/package.json` ← ATUALIZAR (socket.io-client)
- `apps/frontend/vite.config.ts` ← ATUALIZAR (proxy /ws)
- `docs/asyncapi.yaml` ← ATUALIZAR (versão 1.1.0)
