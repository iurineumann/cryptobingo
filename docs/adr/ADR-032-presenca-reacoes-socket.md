# ADR-032 — Presença, Reações e Feed de Eventos no Socket /chat (GameRoom Fase 4)

**Status:** Aceito
**Data:** 2026-06-25

---

## Problema

Após as Fases 0–3 (ADR-030, ADR-031), a GameRoom tem sorteio cinematográfico, cartelas vivas
e premiações destacadas, mas **falta vida social**: o jogador não vê quantos estão online, não
consegue reagir a jogadas e não tem um feed de eventos ("cartela X fez linha!", "estágio Y
limpo"). O chat existe (ADR-010) mas é isolado — não há presença nem reações efêmeras.

## Decisão

Adicionar ao namespace Socket.io `/chat` (api-gateway) três novos sinais sociais:

1. **Presença online** — mapa efêmero `roomId → (wallet → contagem de sockets)`. O servidor
   emite `presence:update` a cada join/leave/disconnect. A contagem é por **wallet** (dedup
   multi-socket — duas abas da mesma conta = 1). Sem persistência (in-memory only).
2. **Reações flutuantes** — eventos `reaction:send` (cliente→servidor) e `reaction:new`
   (servidor→sala) com allowlist de 6 emojis (`👏🔥😮😢🍀🎉`) e rate-limit (10/5s por wallet).
3. **Feed de eventos** — **derivado no frontend** a partir de `localWinners` e `clearedStages`
   que o `useSlowReveal` já entrega. Sem novo backend para o feed.

### Decisões não-óbvias

- **Feed sem backend.** Vitórias e estágios limpos já chegam ao front via
  `useSlowReveal` (winners/clearedStages). Derivar o feed no front evita criar novo canal
  worker→api→socket e manter estado server-side. O backend só fornece presença e reações,
  que são genuinamente efêmeras e não-persistentes.
- **Presença por wallet, não por socket.** Um jogador com 2 abas/dispositivos conta uma vez.
  O mapa `wallet → count` permite decrementar corretamente: remove a wallet do online só
  quando o último socket dela sai.
- **Allowlist duplicada front/back.** O backend é a fonte de verdade (rejeita emoji fora da
  lista). O frontend espelha a mesma lista para UX (botões visíveis). Se houver divergência,
  o efeito é gracioso: o front pode mostrar um botão que o backend ignora.
- **Sem nova coleção Mongo.** Presença e reações são transitórias — persistir não agrega
  valor ao produto nem à auditoria. O chat persiste como hoje (`ChatMessage`); reações e
  feed não.
- **Reações sem persistência cross-sessão.** Reações expiram no front após ~4s. Um jogador
  que entra na sala depois de uma reação não a vê — aceitável para o caráter efêmero.
- **Rate-limit de reações mais permissivo que chat** (10 vs 5 msg/5s). Reações são leves e
  frequentes; o limite existe para evitar abuso, não para restringir engajamento.

## Consequências

**Positivas:** sala mais viva sem infraestrutura nova; feed gratuito (derivado de dados já
existentes); sem risco de vazamento de PII (feed só expõe ticket_id e win_pattern, já
públicos); rate-limit anti-spam espelha o do chat; acessível (badge online com rótulo i18n,
reações `aria-hidden`).

**Negativas / custos:** o hook `useRoomSocial` abre socket próprio (namespace `/chat` com
JWT) — coexiste com o `useChat` mas o backend dedup por wallet, então não infla a contagem;
feed só é populado enquanto o jogador está na sala (não há histórico cross-sessão);
allowlist precisa ser mantida sincronizada entre front e back (documentada neste ADR).

## Alternativas descartadas

1. **Persistir presença/reações em Mongo.** Custo operacional sem valor de produto claro;
   presença é inerentemente efêmera. Rejeitada.
2. **Feed via novo canal do worker.** O worker já publica `winner_found` e `stage_cleared`;
   duplicar no socket do chat adicionaria complexidade sem ganho. Rejeitada — feed front-end
   é suficiente.
3. **Reagir com emoji livre (texto).** Risco de abuso (emojis ofensivos) e semântica pobre
   para rate-limit. Allowlist + validação no backend é mais seguro e previsível.

## Referências

- Spec: `docs/superpowers/specs/2026-06-23-gameroom-redesign-design.md` (§4 — Fase 4)
- Plano: `docs/superpowers/plans/2026-06-24-gameroom-fase4-social-ao-vivo.md`
- ADR-007 (Slow Reveal — feed deriva de winners/stages que ele entrega)
- ADR-010 (Chat — namespace /chat mantido, reações adicionadas ao mesmo namespace)
- AsyncAPI: `docs/asyncapi.yaml` (canais `presence:update`, `reaction:send`, `reaction:new`)
- `apps/api-gateway/src/socket/presence.ts` (PresenceStore efêmero)
- `apps/frontend/src/hooks/useRoomSocial.ts` (hook frontend de presença/reações)
- `apps/frontend/src/components/gameroom/RoomSocial.tsx` (UI social)
