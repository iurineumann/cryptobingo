---
target: apps/frontend/src/components/LandingPage.tsx
total_score: 22
p0_count: 0
p1_count: 3
timestamp: 2026-06-18T20-46-03Z
slug: apps-frontend-src-components-landingpage-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Countdowns e loading states presentes; sem feedback do "connect wallet" |
| 2 | Match System / Real World | 3 | "funding/archived/aborted" são estados FSM internos expostos ao player |
| 3 | User Control and Freedom | 2 | Página unidirecional; connect wallet não tem escape/feedback de próximo passo |
| 4 | Consistency and Standards | 3 | cb-btn classes consistentes; emoji STATUS_EMOJI ao lado de CSS badges mistura vocabulário |
| 5 | Error Prevention | 2 | fetchRooms falha silenciosamente; sem fallback visível; live count falha retorna "0 players" |
| 6 | Recognition Rather Than Recall | 3 | Room cards com toda info visível; nav mínima; trust badges explícitas |
| 7 | Flexibility and Efficiency | 1 | Página informacional pura; sem atalhos ou nav por teclado |
| 8 | Aesthetic and Minimalist Design | 2 | Gradient text (banned), stats strip (hero-metric banned), WHY card grid (identical-grid banned) |
| 9 | Error Recovery | 1 | Sem estados de erro visíveis; API failures → empty array silencioso; sem retry |
| 10 | Help and Documentation | 2 | Trust badges implícitas; sem contextual help para iniciantes em WAX/crypto |
| **Total** | | **22/40** | **Acceptable — melhorias significativas necessárias** |

## Anti-Patterns Verdict

**LLM assessment**: A LandingPage parece AI-generated em 3 pontos imediatos. (1) Gradient text no hero h1 — o tell mais óbvio; qualquer gerador cai nesse padrão. (2) Stats strip com grandes números + label + hint — hero-metric template que aparece em ~70% de landing pages de SaaS/DeFi geradas por IA. (3) WHY_ITEMS: 3× ícone emoji + título + parágrafo em grid — identical-card-grid. O conjunto dessas três seções em sequência (hero com gradient → stats → cards) é o scaffold AI mais saturado de 2024-2025. O HeroBall é genuíno e forte — não é AI slop. O problema é o que está em torno dele.

**Deterministic scan**: 6 findings — 1 warning + 5 advisories:
- `gradient-text` (warning): linha 283 — `bg-clip-text + bg-gradient` no hero h1. Hard ban confirmado.
- `design-system-color` × 5 (advisory): linhas 376 e 381 — cores hardcoded para badges NFT/Token (`rgb(147 51 234 / 0.12)`, `rgb(147 51 234 / 0.3)`, `rgb(234 179 8 / 0.12)`, `rgb(253 224 71)`, `rgb(234 179 8 / 0.3)`) fora do DESIGN.md. Drift de tokens — não são falsos positivos, são tokens de badge legítimos que precisam entrar no design system.

## Overall Impression

O HeroBall é o melhor elemento da página — animado, on-brand, tecnicamente sofisticado. O resto do layout sabota esse momento: gradient text no título competindo com a bola, stats strip removendo o foco imediatamente após o hero, e WHY section em grid genérico. A maior oportunidade: tornar o HeroBall o verdadeiro herói em todos os viewports (hoje é `hidden lg:block`) e eliminar os 3 anti-patterns que gritam "AI fez isso".

## What's Working

1. **HeroBall component** — animação de drop, halo responsivo à cor da coluna, ciclo automático de bolas. É o elemento de maior personalidade na página inteira. Bem implementado.
2. **Room cards com dados ao vivo** — countdown, status FSM mapeado, tickets sold, badges NFT/Token. Informação certa no lugar certo para quem já sabe o que está vendo.
3. **Dark theme + tokens** — o design system está sólido. `--cb-*` tokens usados consistentemente em quase toda a página; gradiente e cores hardcoded são exceções pontuais, não padrão.

## Priority Issues

### [P1] Gradient text no hero h1
**Why it matters**: É o primeiro elemento de texto que o usuário lê. Gradient text reduz contraste, quebra leitura em dark mode em certos viewports, e é o tell mais reconhecível de design AI-generated. Vai contra DESIGN.md ("Don't: gradient text") e o próprio impeccable ban.  
**Fix**: Substituir o `<span>` com gradient-text pelo `highlight` word em cor sólida. Usar `--cb-accent` (#fbbf24) para a word destacada — gold sólido em dark background tem contraste AA e carrega mais peso semântico (gold = valor, prêmio) do que um gradient decorativo.  
**Suggested command**: `/impeccable craft LandingPage`

### [P1] HeroBall escondida no mobile (`hidden lg:block`)
**Why it matters**: A assinatura visual da plataforma desaparece completamente em mobile. O hero no mobile é texto puro: status pill + h1 + subtítulo + 2 CTAs + 4 trust badges. Sem diferenciação visual nenhuma. Em uma plataforma de jogos onde mobile é primário, isso é abandono de identidade.  
**Fix**: Versão compacta do HeroBall para mobile (ex: 5rem ao invés de 12rem, posicionada acima do h1 ou inline com ele). Ou restructurar o hero para centrar visualmente na bola em todos os viewports.  
**Suggested command**: `/impeccable adapt LandingPage`

### [P1] Stats strip = hero-metric template (banned)
**Why it matters**: Big number + small label + hint × 3 = o template SaaS/DeFi mais saturado. Undermines credibilidade de "playfully premium". Os dados são reais e valiosos (RTP verificável, prêmios pagos), mas o formato grita genérico.  
**Fix**: Substituir por **Audit Trail** — mostrar as últimas N transações com tx hash truncado, link para chain explorer, valor pago. Diferencia: nenhum concorrente faz isso tão explicitamente. Mantém a transparência on-chain como proposta de valor real, não como número marketing.  
**Suggested command**: `/impeccable craft LandingPage`

### [P2] WHY section — identical card grid (banned)
**Why it matters**: Ícone emoji + título + texto × 3 em grid auto-fill = banned pattern. Elimina qualquer diferenciação visual entre os benefícios. Usuário escaneia e registra "3 itens genéricos".  
**Fix**: Layout assimétrico ou sequencial. Opção A: stagger horizontal — item 1 à esquerda com número grande, item 2 centrado com destaque visual diferente, item 3 à direita. Opção B: lista vertical com progressão visual usando os BINGO column colors (B-I-N-G-O) como marcadores.  
**Suggested command**: `/impeccable layout LandingPage`

### [P2] Off-design-system colors nas badges NFT/Token (6 hardcoded)
**Why it matters**: `rgb(147 51 234 / 0.12)` e `rgb(234 179 8 / 0.12)` aparecem também no Lobby.tsx com os mesmos valores. Quando o design system evoluir, esses valores ficam fora de sincronia. São 2 badges legítimos (NFT = violet, Token = gold) que precisam virar tokens semânticos.  
**Fix**: Adicionar `--cb-badge-nft-*` e `--cb-badge-token-*` ao design system e criar classes `.cb-badge-nft` / `.cb-badge-token` no globals.design.css.  
**Suggested command**: `/impeccable extract LandingPage`

## Persona Red Flags

**Jordan (First-Timer)**: Chega na página e vê rooms com status "funding" — não sabe o que significa. Os trust badges (⚡ ⛊ ◆ ⚖) têm labels de 1-2 palavras sem contexto: "on-chain" e "provably fair" são jargão crypto sem explicação. O "Connect Wallet" não indica o que acontece depois: abre uma extensão? cria uma conta? Jordan abandona antes de clicar.

**Casey (Distracted Mobile User)**: HeroBall inexistente (hidden). Hero é um bloco de texto com 2 CTAs e 4 badges — alto no viewport, fora do thumb zone. O botão "📋" de histórico da sala é emoji icon-only; `title` attr não funciona no touch. Room cards têm texto de 0.8rem no DL de stats — pequeno demais para leitura rápida em movimento.

**Crypto Player (project-specific)**: Não vê o prize pool atual das salas na landing — só o ticket price. Sem nenhuma menção ao sistema de progressão (XP, tiers, NFTs) que diferencia o CryptoBingo de um bingo genérico. O diferencial da plataforma está escondido atrás do login.

## Minor Observations

- Footer usa `<span className="cb-logo">` inline ao invés do componente `<Logo>` — inconsistência com o navbar.
- `STATUS_EMOJI` mix de emoji + CSS badge no mesmo card cria dois vocabulários visuais de status.
- `REVEAL_INTERVAL_MS` e `AUTO_LOCK_SEC` duplicados entre LandingPage.tsx e Lobby.tsx — não é design issue mas sinaliza oportunidade de extração.
- Nav links (`#rooms`, `#stats`, `#sponsors`) são anchor links para seções da mesma página — considerar scroll-spy para indicar qual seção está ativa no nav.

## Questions to Consider

- "Se o HeroBall é a assinatura da plataforma, por que ela está escondida no momento que mais importa (mobile, primeiro acesso)?"
- "O que um player novo precisa ver em 5 segundos para confiar o suficiente para conectar a wallet?"
- "O Audit Trail (TXs reais verificáveis) não é mais convincente do que 3 métricas formatadas como marketing?"
