# ADR-031 — UX do Palco de Sorteio (GameRoom Fase 1)

**Status:** Aceito
**Data:** 2026-06-24

---

## Problema

Após a Fase 0 (ADR-030), o palco do sorteio (`DrawStage`) está isolado mas **estático**: a bola
aparece com um drop simples, sem reforço de cor por coluna, sem vida na trilha de histórico, sem
tensão entre bolas e sem áudio. A Fase 1 do redesign (spec
`docs/superpowers/specs/2026-06-23-gameroom-redesign-design.md`) pede um sorteio **cinematográfico**
que prenda a atenção, sem quebrar o Slow Reveal (ADR-007) nem a acessibilidade.

## Decisão

Enriquecer apenas o `DrawStage` (componente isolado) + dois hooks novos, sem tocar a lógica de
jogo:

1. **Revelação com presença** — keyframe `cb-ball-reveal` (giro + queda + acomodação) no estilo
   `spotlight`, substituindo o drop simples; mantém `cb-ball-drop` nos demais estilos.
2. **Pulso de cor B-I-N-G-O** — a cada nova bola, o halo "respira" na cor da coluna
   (`cb-col-pulse`), disparado por `data-col` + classe re-triggada no `.gr-stage-spot`.
3. **Trilha animada** — a mini-bola mais recente entra com `cb-mini-pop`.
4. **Som opcional** — hook `useDrawSound` (oscilador Web Audio, sem assets); botão no header do
   palco; toque por coluna na nova bola.

### Decisões não-óbvias

- **Suspense, não countdown numérico.** O Slow Reveal (ADR-007) **não expõe ETA** da próxima bola
  ao front. Um "tempo regressivo" exigiria o worker publicar o instante da próxima bola — fora de
  escopo. Em vez disso, enquanto `isDrawing`, o palco entra em estado `is-suspense`
  (`cb-stage-suspense`, pulso lento infinito) — antecipação visual sem mentir um número.
- **Reduced-motion via bloco global.** O bloco `@media (prefers-reduced-motion: reduce)` em
  `apps/frontend/src/styles/globals.css` neutraliza TODA animação (`*` →
  `animation-duration:0.01ms !important; animation-iteration-count:1 !important`). Por isso **não**
  há media query por animação nova — confiar no global evita duplicação e divergência. O hook
  `useReducedMotion` existe para efeitos eventualmente dirigidos por JS.
- **Som default OFF, só após gesto.** Áudio não-solicitado é hostil. O toggle persiste em
  `localStorage['gr-sound-enabled']` (default `'0'`), e o `AudioContext` é criado lazy no primeiro
  play habilitado — o clique no toggle é o gesto do usuário que libera o áudio no navegador.
- **Efeito de nova bola unificado.** Um único `useEffect` em `lastDrawn`, com um único guard
  `prevBall`, dispara drop + pulso + som — evita efeitos concorrentes que double-atualizariam o
  guard e quebrariam o pulso. Deps `[lastDrawn, col, sound.playBallCall]` (playBallCall estável via
  `useCallback`).

## Consequências

**Positivas:** palco vivo e tenso; identidade sonora por coluna; acessível (aria-live preservado,
som opt-in, reduced-motion respeitado); animações GPU-friendly (`transform`/`opacity`, alvo 60fps);
base isolada não contamina a lógica de jogo.

**Negativas / custos:** mais CSS e dois hooks a manter; o suspense é qualitativo (não informa
tempo) — se no futuro o worker publicar ETA, dá para evoluir para countdown real; `AudioContext`
não é fechado no unmount (desprezível — a sala monta uma vez).

## Alternativas descartadas

1. **Countdown numérico regressivo.** Exigiria ETA da próxima bola publicado pelo worker; sem isso
   seria inventar número (anti-honestidade). Rejeitada — vira candidata a fase futura com suporte
   do worker.
2. **Assets de áudio (.mp3/.wav).** Custo de carregar/gerenciar assets e licenças; o oscilador Web
   Audio entrega o "toque" com zero asset. Rejeitada.

## Referências

- Spec: `docs/superpowers/specs/2026-06-23-gameroom-redesign-design.md`
- Plano: `docs/superpowers/plans/2026-06-24-gameroom-fase1-sorteio-cinematografico.md`
- ADR-007 (Slow Reveal — preservado; animação dirigida por Sequence ID)
- ADR-030 (arquitetura de componentes da GameRoom)
