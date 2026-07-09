# Plan C: Content Production — Blog Posts & Tutorials (Track 2)

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Tasks within same priority batch can run in parallel via fresh subagents.

**Goal:** Produzir 14 blog posts (6 novos P0 + 5 P1 + 3 P2) e 9 tutoriais (1 revisado + 4 novos P0 + 4 P1) em 3 locales (pt/en/zh), com frontmatter enriquecido e cross-references.

**Architecture:** Markdown (blog) + MDX (tutorial) em `content/{blog,tutorial}/{locale}/`. Frontmatter gray-matter parseado por `lib/content.ts`. Related posts via `computeRelatedPosts` (Jaccard tag overlap + `related:` frontmatter override). Search index consumido por Plan D (MiniSearch, document ID format: `{type}/{slug}`).

**Tech Stack:** gray-matter, marked, vitest, React Router v7 SSG, i18next

## Process & Compliance (Obrigatorio)

Cada task **deve** seguir este checklist antes de considerar completa:

### Metodologia
- **TDD (RED→GREEN→refactor):** escrever teste primeiro, código mínimo para passar, refatorar. Nuca implementar sem teste vermelho primeiro.
- **1 commit por task lógica:** `tipo(escopo): descrição` em PT-BR. `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- **Git flow:** feature branch → PR → develop. Nunca commit direto em develop.
- **SonarQube:** rodar `sonarqube_analyze_code_snippet` em cada arquivo `.ts`/`.tsx` modificado. Corrigir BLOCKER/CRITICAL/MAJOR antes do commit.

### Ferramentas
- **RAG:** consultar RAG ao iniciar cada task para reuso de decisoes anteriores relevantes (tags: `content-quality`, `persona-decision`, `images`, `figure`, `audience-personas`)
- **Skills:** carregar skill `frontend-feature` ao mexer em `src/`, `modern-typescript` para testes/refatoracao
- **Ensemble:** se task tiver escopo multi-camada ou depender de outro pacote, considerar uso de agentes paralelos

### Fluxo de Personas (para conteudo novo)
1. Core team produz rascunho inicial
2. Especialistas produtores refinam ate consenso
3. Core seleciona 1-2 personas audiencia relevantes → avaliam eficacia
4. Feedback incorporado
5. Lead aprova
6. Outputs indexados no RAG

### Verificação pré-commit
```bash
# 1. Testes
pnpm --filter @cryptobingo/landing-page test

# 2. Build
pnpm --filter @cryptobingo/landing-page build

# 3. SonarQube em arquivos modificados

# 4. Git diff review — staging so arquivos intencionados
```

## Global Constraints

- SSG prerender (`ssr:false`)
- i18n pt/en/zh obrigatorio em todo texto visivel (3 arquivos por post)
- Sem comentarios em codigo
- Nao mexer em `index.html` ou `app/root.tsx`
- PT-BR conventional commits (ex: `feat(content): novo post blockchain iniciantes`)
- Git flow: feature branch → PR → develop
- `content/blog/{locale}/*.md` — blog em markdown com gray-matter
- `content/tutorial/{locale}/*.mdx` — tutoriais em MDX (obrigatorio `.mdx`, ver `content.ts:136`)
- Blog frontmatter: `title, description, date (ISO 8601), author, cover (opcional), tags, category, reading_time, images, related, related_tutorials`
- Tutorial frontmatter: `title, description, order, cover (opcional), images, related`
- `date` ISO 8601: `2026-07-07T10:00:00Z`
- Posts ordenados por `date` desc, tutoriais por `order` asc
- `computeRelatedPosts` ja implementado em `lib/content.ts:237-262` — usa Jaccard tag overlap + `related:` override
- Document ID para Plan D (Search): `blog/{slug}` ou `tutorial/{slug}`
- Empty `/` separa frontmatter do body (linha apos `---` final)
- Tags taxonomy (18): wax, blockchain, gamefi, rng, security, economy, tokenomics, patterns, strategy, guide, tutorial, community, provably-fair, beginner, wallet, trust, nft, faq
- Categories (5): technology, gameplay, economy, community, beginner

## Content Quality Standards

Aplicam-se a todo conteudo criado neste plan. Ver spec `docs/superpowers/specs/2026-07-04-content-ux-search-design.md` secao 4.7 para detalhes completos.

### Imagens inline

Cada post/tutorial pode conter quantas imagens forem necessarias. Fontes: Unsplash (fotos conceituais), Mermaid.js (diagramas), screenshots (tutoriais). Toda imagem requer `alt` para acessibilidade.

**Frontmatter `images: []` obrigatorio** para todas as imagens do post. Usado por:
- `<Figure>` component para renderizar com lazy loading, legenda e zoom
- Plan D (Search) para indexar metadados de imagem
- SEO (image sitemap)

```yaml
images:
  - src: /images/blog/{slug}/diagrama-fluxo.png
    alt: "Descricao da imagem"
    caption: "Legenda explicativa (opcional)"
```

### Componentes de conteudo

| Componente | Uso |
|------------|-----|
| `<Figure src alt caption? zoomable? />` | Imagem com lazy loading, legenda, zoom |
| `<FigureGallery images zoomable? />` | Grid de imagens (2 colunas desktop) |
| `<Callout type=tip|warning|info>` | Dica, aviso, informacao complementar |
| `<Checklist items completed? />` | Lista de verificacao (tutoriais) |

### Imagens no body vs frontmatter

- **Frontmatter `images: []`**: declara todas as imagens do post. Usado para SEO, galeria, indexacao.
- **Inline markdown**: `![alt](src)` para imagens no fluxo do texto. O `<Figure>` component substitui quando disponivel.
- **`<FigureGallery>`**: renderiza grid das imagens do frontmatter no inicio ou fim do post.

### Workflow de personas

Cada post/tutorial segue este fluxo antes da publicacao:

1. **Core team** (Strategist, Writer, Editor, Domain Expert) produz rascunho
2. Rascunho circula para **especialistas sob demanda** (Psicologo Cognitivo, Designer Instrucional, Visual Designer, Curador de Midia, UX Writer, SEO, Community, Localization QA, Legal)
3. Especialistas refinam ate consenso. Podem declarar "sem contribuicao".
4. **Lead** aprova ou pede revisao
5. Decisoes indexadas no RAG (ver `docs/guides/content-personas.md`)

### Templates flexiveis

Cada post adapta seu layout. Templates MDX sao ponto de partida editavel, nao regra fixa. Estrutura sugerida:

```mdx
---
title: ""
description: ""
date: ""
author: ""
tags: []
category: ""
cover: ""
reading_time: N
images: []
related: []
related_tutorials: []
---

## Introducao

<Callout type="info">Contexto</Callout>

## Secao 1

![Descricao](/path/to/image.png)
*Legenda*

Conteudo...

## Resumo

CTA final.
```

### Conteudo legado

Revisao dos 3 itens existentes (2 posts + 1 tutorial) ocorre **apos** producao do novo conteudo. O aprendizado dos novos guiara as correcoes nos antigos. Escopo: todo conteudo publicado ou planejado. Todas as personas participam.

---

## File Map

```
content/
  blog/
    en/
      wax-blockchain-beginners.md     [REVISE — enriched frontmatter]
      rng-oracle-explained.md         [REVISE — enriched frontmatter, rename? No, keep slug]
      o-que-e-blockchain.md           [NEW P0]
      carteiras-crypto.md             [NEW P0]
      wax-blockchain.md               [NEW P0 — separate from wax-blockchain-beginners]
      cryptobingo-e-seguro.md         [NEW P0]
      provably-fair.md                [NEW P0]
      modos-de-jogo.md                [NEW P0]
      seguranca-iniciantes.md         [NEW P1]
      smart-contracts.md              [NEW P1]
      rtp-85-porcento.md              [NEW P1]
      estrategias-padroes.md          [NEW P1]
      nfts-na-wax.md                  [NEW P1]
      tokenomics.md                   [NEW P2]
      futuro-gaming-onchain.md        [NEW P2]
      roadmap.md                      [NEW P2]
    pt/                              [same files as en — PT-BR originals]
    zh/                               [same files as en — simplified Chinese]
  tutorial/
    en/
      criar-carteira-wax.mdx          [REVISE P0 — enriched frontmatter]
      configurar-carteira.mdx         [NEW P0]
      comprar-wax.mdx                 [NEW P0]
      comprar-tickets.mdx             [NEW P0]
      recursos-wax.mdx                [NEW P1]
      depositar-sacar.mdx             [NEW P1]
      receber-premios.mdx             [NEW P1]
      verificar-sorteio.mdx           [NEW P1]
      staking-governance.mdx          [NEW P2]
    pt/                              [same as en]
    zh/                              [same as en]
```

---

### Task 0: Revise Existing Blog Posts — Enriched Frontmatter

**Files:**
- Modify: `content/blog/{locale}/wax-blockchain-beginners.md` (3 locales)
- Modify: `content/blog/{locale}/rng-oracle-explained.md` (3 locales)

**Interfaces:**
- Consumes: existing frontmatter format (`title, description, date, author, tags`)
- Produces: enriched frontmatter (`+cover, category, reading_time, related, related_tutorials`)

**What this task adds to each existing post:**
1. `cover` field (empty string — no cover image yet)
2. `category` field
3. `reading_time` field (computed from body word count / 200)
4. `related` array of related blog slugs
5. `related_tutorials` array of related tutorial slugs

No body content changes — just frontmatter enrichment.

- [ ] **Step 1: Revise `wax-blockchain-beginners.md` (pt)**

Add to frontmatter (keep existing body):

```diff
---
 title: "Por que WAX e Perfeita para GameFi: Guia para Iniciantes"
 description: "Zero taxas, carbono neutro e ultrarrápido"
 date: "2026-06-10"
 author: "Time CryptoBingo"
 tags: ["wax", "blockchain", "iniciantes"]
+cover: ""
+category: "technology"
+reading_time: 3
+related:
+  - o-que-e-blockchain
+  - carteiras-crypto
+  - wax-blockchain
+related_tutorials:
+  - criar-carteira-wax
+  - configurar-carteira
+images: []
 ---
```

- [ ] **Step 2: Revise `wax-blockchain-beginners.md` (en)**

```diff
---
 title: "Why WAX is Perfect for GameFi: A Beginner's Guide"
 description: "Zero gas fees, carbon-neutral, and lightning-fast"
 date: "2026-06-10"
 author: "CryptoBingo Team"
 tags: ["wax", "blockchain", "beginners"]
+cover: ""
+category: "technology"
+reading_time: 3
+related:
+  - o-que-e-blockchain
+  - carteiras-crypto
+  - wax-blockchain
+related_tutorials:
+  - criar-carteira-wax
+  - configurar-carteira
---
```

- [ ] **Step 3: Revise `wax-blockchain-beginners.md` (zh)**

Create file `content/blog/zh/wax-blockchain-beginners.md` (frontmatter in zh):

```yaml
---
title: "为什么WAX是GameFi的完美选择：初学者指南"
description: "零Gas费、碳中和、超快速度"
date: "2026-06-10"
author: "CryptoBingo 团队"
tags: ["wax", "blockchain", "beginner"]
cover: ""
category: "technology"
reading_time: 3
related:
  - o-que-e-blockchain
  - carteiras-crypto
  - wax-blockchain
related_tutorials:
  - criar-carteira-wax
  - configurar-carteira
---

## 游戏需要不同的区块链

以太坊和其他公链因高昂的Gas费和缓慢的交易速度而难以承载游戏。对于每几秒抽一个球的宾果游戏，你需要一条为速度而生的区块链。

## 认识WAX

Worldwide Asset eXchange（WAX）是一条专为游戏和数字资产构建的区块链：
```

(Body: translate from en version. Sections: "Gaming Needs a Different Blockchain", "Enter WAX", "WAX for Players", "The WAX Ecosystem".)

- [ ] **Step 4: Revise `rng-oracle-explained.md` (pt)**

Add to frontmatter:

```diff
---
 title: "Como o Oracle RNG do CryptoBingo Garante Sorteios Justos"
 description: "Mergulho tecnico no oracle RSA-SHA256 que alimenta cada sorteio"
 date: "2026-06-15"
 author: "Engenharia CryptoBingo"
 tags: ["tecnico", "seguranca", "rng"]
+cover: ""
+category: "technology"
+reading_time: 3
+related:
+  - provably-fair
+  - cryptobingo-e-seguro
+  - smart-contracts
+related_tutorials:
+  - verificar-sorteio
---
```

- [ ] **Step 5: Revise `rng-oracle-explained.md` (en)**

```diff
---
 title: "How CryptoBingo's RNG Oracle Ensures Provably Fair Draws"
 description: "Deep dive into the RSA-SHA256 oracle powering every draw"
 date: "2026-06-15"
 author: "CryptoBingo Engineering"
 tags: ["technical", "security", "rng"]
+cover: ""
+category: "technology"
+reading_time: 3
+related:
+  - provably-fair
+  - cryptobingo-e-seguro
+  - smart-contracts
+related_tutorials:
+  - verificar-sorteio
---
```

- [ ] **Step 6: Create `rng-oracle-explained.md` (zh)**

`content/blog/zh/rng-oracle-explained.md`:

```yaml
---
title: "CryptoBingo的RNG预言机如何确保公平抽奖"
description: "深入解析驱动每次抽奖的RSA-SHA256预言机"
date: "2026-06-15"
author: "CryptoBingo 工程团队"
tags: ["blockchain", "security", "rng"]
cover: ""
category: "technology"
reading_time: 3
related:
  - provably-fair
  - cryptobingo-e-seguro
  - smart-contracts
related_tutorials:
  - verificar-sorteio
---
```

(Body: translate from en. Sections: "The Trust Problem", "How It Works", "Why RSA-SHA256?", "Verifying Draws".)

- [ ] **Step 7: Verify all 6 revised files load correctly**

```bash
pnpm --filter @cryptobingo/landing-page build
```

Expected: build succeeds, all blog posts render, frontmatter fields parse without gray-matter errors.

- [ ] **Step 8: Commit**

```bash
git add content/blog/en/wax-blockchain-beginners.md \
        content/blog/en/rng-oracle-explained.md \
        content/blog/pt/wax-blockchain-beginners.md \
        content/blog/pt/rng-oracle-explained.md \
        content/blog/zh/wax-blockchain-beginners.md \
        content/blog/zh/rng-oracle-explained.md
git commit -m "feat(content): enriquece frontmatter posts existentes
Adiciona cover, category, reading_time, related, related_tutorials
aos 2 posts existentes (wax-blockchain-beginners, rng-oracle-explained)
em pt/en/zh. Prepara para computeRelatedPosts e busca.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 1: P0 Blog Posts — Batch 1 (blockchain + wallets + wax)

**Files — Create (3 files each × 3 posts = 9 files + 3 zh):**
- Create: `content/blog/{locale}/o-que-e-blockchain.md`
- Create: `content/blog/{locale}/carteiras-crypto.md`
- Create: `content/blog/{locale}/wax-blockchain.md`

**Research sources:**
- Topic 1 (WAX) for `wax-blockchain.md`
- General blockchain knowledge + Topic 1 for blockchain basics

**Interfaces:**
- Consumes: gray-matter frontmatter pattern from existing posts
- Produces: 3 locale files per post with enriched frontmatter + body
- Document IDs for Plan D: `blog/o-que-e-blockchain`, `blog/carteiras-crypto`, `blog/wax-blockchain`

#### Post 1.1: `o-que-e-blockchain.md` — "O Que e Blockchain? Guia para Iniciantes"

Publish date: 2026-07-07 (Phase 1, Week 1-2)

Content angle: Blockchain basics from scratch. No crypto knowledge assumed. Bridge to bingo.

- [ ] **Step 1.1a: Create pt file**

`content/blog/pt/o-que-e-blockchain.md`:

```yaml
---
title: "O Que e Blockchain? Guia para Iniciantes"
description: "Entenda o basico da tecnologia blockchain sem jargão — e porque ela torna o bingo online mais justo"
date: "2026-07-07T10:00:00Z"
author: "Time CryptoBingo"
tags: ["blockchain", "guide", "beginner"]
cover: ""
category: "beginner"
reading_time: 7
related:
  - wax-blockchain-beginners
  - carteiras-crypto
  - smart-contracts
related_tutorials:
  - configurar-carteira
  - criar-carteira-wax
---

## O que e uma Blockchain?

Explique como um livro-razao digital compartilhado. Analogia: caderno de anotacoes que todo mundo ve e ninguem pode apagar.

## Como Funciona em Termos Simples

- **Blocos:** paginas do caderno, contem transacoes
- **Cadeia:** cada pagina referencia a anterior (hash)
- **Consenso:** todo mundo concorda com o conteudo

Secoes:
- **Nao tem um dono:** descentralizacao explicada
- **Nao da pra apagar:** imutabilidade
- **Todo mundo ve:** transparencia

## Por que Blockchain importa para Jogos?

- Sem taxas ocultas
- Resultados verificaveis
- Premios automaticos via smart contract
- Nao precisa confiar na "casa" — confie no codigo

## Blockchain vs Banco de Dados Tradicional

Tabela comparativa: Blockchain (descentralizado, imutavel, publico) vs Banco de Dados (centralizado, alteravel, privado).

## O que Blockchain Nao e

- Nao e so criptomoeda
- Nao e necessariamente lento (WAX: 1.5s finalidade)
- Nao e complicado de usar (WAX Cloud Wallet: 30s onboarding)

## Resumo

Blockchain e a infraestrutura que torna o CryptoBingo possivel: sorteios justos, premios instantaneos, zero confianca necessaria.

**CTA:** Quer comecar? Crie sua carteira WAX em 2 minutos e ganhe seu primeiro ticket.
```

- [ ] **Step 1.1b: Create en file**

`content/blog/en/o-que-e-blockchain.md`:

```yaml
---
title: "What is Blockchain? A Beginner's Guide"
description: "Understand blockchain technology without the jargon — and why it makes online bingo fairer"
date: "2026-07-07T10:00:00Z"
author: "CryptoBingo Team"
tags: ["blockchain", "guide", "beginner"]
cover: ""
category: "beginner"
reading_time: 7
related:
  - wax-blockchain-beginners
  - carteiras-crypto
  - smart-contracts
related_tutorials:
  - configurar-carteira
  - criar-carteira-wax
---
```

(Same sections as pt, translated to EN. Sections: "What is a Blockchain?", "How It Works in Simple Terms", "Why Blockchain Matters for Gaming", "Blockchain vs Traditional Database", "What Blockchain Is Not", "Summary".)

- [ ] **Step 1.1c: Create zh file**

`content/blog/zh/o-que-e-blockchain.md`:

```yaml
---
title: "什么是区块链？初学者指南"
description: "不用术语理解区块链技术——以及它如何让在线宾果更公平"
date: "2026-07-07T10:00:00Z"
author: "CryptoBingo 团队"
tags: ["blockchain", "guide", "beginner"]
cover: ""
category: "beginner"
reading_time: 7
related:
  - wax-blockchain-beginners
  - carteiras-crypto
  - smart-contracts
related_tutorials:
  - configurar-carteira
  - criar-carteira-wax
---
```

(Same sections as en, translated to simplified Chinese.)

#### Post 1.2: `carteiras-crypto.md` — "Carteiras Crypto: Escolhendo a Sua Primeira"

Publish date: 2026-07-10 (Phase 1, Week 3-4)

Content focus: What is a crypto wallet, types (hot/custodial/self-custody), WAX-specific options.

- [ ] **Step 1.2a: Create pt file**

`content/blog/pt/carteiras-crypto.md`:

```yaml
---
title: "Carteiras Crypto: Escolhendo a Sua Primeira Carteira"
description: "Guia completo para iniciantes escolherem entre Anchor, WAX Cloud Wallet e outras"
date: "2026-07-10T10:00:00Z"
author: "Time CryptoBingo"
tags: ["wallet", "guide", "beginner"]
cover: ""
category: "beginner"
reading_time: 6
related:
  - wax-blockchain-beginners
  - o-que-e-blockchain
  - wax-blockchain
related_tutorials:
  - criar-carteira-wax
  - configurar-carteira
  - comprar-wax
---
```

Sections:
- **O que e uma carteira crypto?** Chaves publica/privada. Nao "guarda" crypto — guarda chaves.
- **Tipos de Carteira:** Custodial vs auto-custodia. Hot wallet vs cold wallet.
- **WAX Cloud Wallet:** Email + senha. Melhor para iniciantes. 30s para criar. Nao precisa gerenciar seed phrase.
- **Anchor Wallet:** Auto-custodia. Mais controle. Precisa salvar seed phrase. Ideal para usuarios avancados.
- **Qual escolher?** Tabela comparativa: facilidade vs controle vs seguranca.
- **Cuidados de seguranca:** Seed phrase offline. 2FA. Cuidado com sites falsos. Never share private keys.
- **Conectando ao CryptoBingo:** WalletConnect / Anchor link. 1 click.

- [ ] **Step 1.2b-c: Create en + zh files**

EN title: "Crypto Wallets: Choosing Your First Wallet"
ZH title: "加密货币钱包：选择你的第一个钱包"

Same structure, translated. `content/blog/en/carteiras-crypto.md`, `content/blog/zh/carteiras-crypto.md`.

#### Post 1.3: `wax-blockchain.md` — "WAX Blockchain para Iniciantes"

Publish date: 2026-07-14 (Phase 1, Week 5-6)

**Research source:** Topic 1 — WAX Blockchain

Content focus: Different from `wax-blockchain-beginners.md` (which is a quick overview). This is a comprehensive guide covering WAX's technical advantages, ecosystem, and positioning.

- [ ] **Step 1.3a: Create pt file**

`content/blog/pt/wax-blockchain.md`:

```yaml
---
title: "WAX Blockchain para Iniciantes: O Guia Completo"
description: "Tudo que voce precisa saber sobre a WAX: zero taxas, 215 mil usuarios diarios, carbono neutro e por que e a blockchain ideal para games"
date: "2026-07-14T10:00:00Z"
author: "Time CryptoBingo"
tags: ["wax", "blockchain", "guide", "beginner"]
cover: ""
category: "technology"
reading_time: 8
related:
  - wax-blockchain-beginners
  - o-que-e-blockchain
  - nfts-na-wax
  - tokenomics
related_tutorials:
  - criar-carteira-wax
  - recursos-wax
  - comprar-wax
---
```

Sections (use Topic 1 research statistics):
- **O que torna a WAX especial:** Zero gas fees (diferencial vs Ethereum/Polygon), 1.5s finality, carbono neutro desde 2021.
- **Numeros que importam (Jun 2026):** 215K+ daily unique active wallets (#5 entre gaming chains), +11.98% crescimento 30d (Gate News Jun 2026). 570-687M transacoes por trimestre — mais que qualquer outra gaming chain (DappRadar Q3 2025, Q4 2024).
- **WAX vs Concorrentes:** Tabela WAX vs opBNB (1.62M DAU), SKALE, Ronin, Immutable — WAX ganha em transacoes por carteira.
- **Ecossistema WAX:** Alien Worlds (420K wallets/mes, 599tx/wallet). AtomicHub, NeftyBlocks. 15M+ usuarios, 30K+ dApps.
- **Cloud Wallet:** Onboarding 30s sem seed phrase. A "blockchain invisivel".
- **WAX-TON Bridge (2024):** Desbloqueia 900M usuarios Telegram.
- **Por que WAX para CryptoBingo:** Velocidade de sorteio, zero taxas para jogadores, finalidade em segundos.
- **Riscos honestos:** Dependencia de Alien Worlds. Queda de DAU Q4 2024 seguida de recuperacao. Modelo zero-gas requer staking de CPU/NET.

- [ ] **Step 1.3b-c: Create en + zh files**

EN title: "WAX Blockchain for Beginners: The Complete Guide"
ZH title: "WAX区块链初学者完整指南"

#### Verification for Task 1

- [ ] **Step 1.4: Verify all 9 files created and build succeeds**

```bash
pnpm --filter @cryptobingo/landing-page build
```

Expected: build succeeds. Check that `content/blog/en/o-que-e-blockchain.md` et al appear in build output.

- [ ] **Step 1.5: Commit**

```bash
git add content/blog/en/o-que-e-blockchain.md content/blog/en/carteiras-crypto.md content/blog/en/wax-blockchain.md content/blog/pt/o-que-e-blockchain.md content/blog/pt/carteiras-crypto.md content/blog/pt/wax-blockchain.md content/blog/zh/o-que-e-blockchain.md content/blog/zh/carteiras-crypto.md content/blog/zh/wax-blockchain.md
git commit -m "feat(content): 3 novos posts P0 blockchain iniciantes + wallets + wax
Cria o-que-e-blockchain, carteiras-crypto, wax-blockchain em pt/en/zh.
Usa pesquisa Topic 1 (WAX) com dados Gate News Jun 2026, DappRadar Q3/Q4 2025.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: P0 Blog Posts — Batch 2 (security + provably-fair + draw modes)

**Files — Create (3 files each × 3 posts = 9 files):**
- `content/blog/{locale}/cryptobingo-e-seguro.md`
- `content/blog/{locale}/provably-fair.md`
- `content/blog/{locale}/modos-de-jogo.md`

**Research sources:**
- Topic 2 (Provably Fair) for `provably-fair.md`
- Topic 3 (Draw Modes) for `modos-de-jogo.md`
- Topics 2 + 7 for `cryptobingo-e-seguro.md`

#### Post 2.1: `cryptobingo-e-seguro.md` — "CryptoBingo e Seguro? Respondendo Suas Duvidas"

Publish date: 2026-07-17 (Phase 1, Week 3-4)

Content focus: Trust/security FAQ-style post addressing common concerns.

- [ ] **Step 2.1a: Create pt file**

```yaml
---
title: "CryptoBingo e Seguro? Respondendo Suas Duvidas"
description: "Transparencia total sobre seguranca da plataforma: smart contracts auditados, provably fair, cold wallet, e porque seus fundos estao seguros"
date: "2026-07-17T10:00:00Z"
author: "Time CryptoBingo"
tags: ["security", "trust", "faq", "blockchain"]
cover: ""
category: "community"
reading_time: 6
related:
  - provably-fair
  - seguranca-iniciantes
  - smart-contracts
  - rng-oracle-explained
related_tutorials:
  - verificar-sorteio
  - receber-premios
---
```

Sections (FAQ-style Q&A):
- **O contrato e auditado?** Sim, terceirizado. Link para auditoria.
- **Onde ficam os fundos dos jogadores?** Treasury multisig on-chain. Nao em conta centralizada.
- **Como sei que o sorteio nao foi manipulado?** Provably fair: commit-reveal com RSA-SHA256. Qualquer um verifica.
- **E se o servidor cair?** Fundos estao na blockchain, nao no servidor. Recuperaveis a qualquer momento.
- **Meus dados pessoais estao seguros?** So email (Cloud Wallet). Nao armazenamos dados bancarios.
- **Carteira WAX foi hackeada?** WAX nunca foi hackeada desde 2019. Nenhum incidente de seguranca na camada base.
- **Posso confiar no time?** Time doxed, publico. GitHub open-source. Transparencia total.

- [ ] **Step 2.1b-c: Create en + zh**

EN title: "Is CryptoBingo Safe? Answering Your Questions"
ZH title: "CryptoBingo 安全吗？解答你的疑问"

#### Post 2.2: `provably-fair.md` — "Provably Fair: Como Verificamos Cada Sorteio"

Publish date: 2026-07-21 (Phase 1, Week 7-8)

**Research source:** Topic 2 — Provably Fair (full brief with UKGC/MGA 2026 standards, HMAC-SHA256, commit-reveal protocol)

Content focus: Beginner-friendly explainer of provably fair concept with bingo-specific application. Different from `rng-oracle-explained.md` (which is technical deep-dive on RSA-SHA256 oracle). This post is conceptual/educational.

- [ ] **Step 2.2a: Create pt file**

```yaml
---
title: "Provably Fair: Como Verificamos Cada Sorteio"
description: "Entenda o conceito de provably fair — a tecnologia que permite voce verificar cada resultado sem confiar em ninguem"
date: "2026-07-21T10:00:00Z"
author: "Time CryptoBingo"
tags: ["rng", "security", "provably-fair", "blockchain"]
cover: ""
category: "technology"
reading_time: 7
related:
  - rng-oracle-explained
  - cryptobingo-e-seguro
  - smart-contracts
related_tutorials:
  - verificar-sorteio
  - receber-premios
---
```

Sections (use Topic 2 research):
- **O problema da confianca:** Cassinos online tradicionais sao caixas-pretas. Provably fair elimina a necessidade de confianca.
- **Como funciona (analogia):** Cofre com cadeado. Mostra o cadeado antes (commit). Depois da a chave (reveal). Qualquer um confere.
- **O protocolo commit-reveal:** HMAC-SHA256. Server seed + client seed + nonce. 3 fases: commit antes do jogo → seed combinada durante → revelacao apos.
- **Como aplicamos ao bingo 5x5:** Server seed + client seed + nonce → numeros 1-75 determinados deterministicamente.
- **Multiplayer fair:** Bitcoin blockhash como client seed neutro — nenhum jogador individual pode fraudar (Topic 2, CryptoGambling Guide Dec 2025).
- **Por que nao usamos so blockhash:** Blockhash sozinho e insuficiente — mineradores tem influencia limitada. HMAC commitment e mais seguro (Topic 2, ChainScore Aug 2025).
- **Regulacao 2026:** UKGC e MGA agora exigem provably fair (Tech Insider Jun 2026). Nao e mais opcional para operadores licenciados.
- **Voce pode verificar:** Ferramenta open-source no GitHub. Cada sorteio tem TX IDs de commit e reveal.

- [ ] **Step 2.2b-c: Create en + zh**

EN title: "Provably Fair: How We Verify Every Draw"
ZH title: "可验证公平：我们如何验证每一次抽奖"

#### Post 2.3: `modos-de-jogo.md` — "Entendendo os Modos de Jogo (Draw Modes)"

Publish date: 2026-07-25 (Phase 1, Week 9-10)

**Research source:** Topic 3 — Draw Modes

Content focus: Explain each draw mode (Standard, Fixed, FirstFull, GoldenBall, MultiMatch/Stage) and how blockchain enables them.

- [ ] **Step 2.3a: Create pt file**

```yaml
---
title: "Entendendo os Modos de Jogo (Draw Modes)"
description: "Conheca os 5 modos de sorteio do CryptoBingo: Standard, Fixed, FirstFull, Golden Ball e Multi-Match — e como cada um funciona"
date: "2026-07-25T10:00:00Z"
author: "Time CryptoBingo"
tags: ["gameplay", "patterns", "guide", "beginner"]
cover: ""
category: "gameplay"
reading_time: 7
related:
  - estrategias-padroes
  - provably-fair
  - rtp-85-porcento
related_tutorials:
  - comprar-tickets
  - receber-premios
---
```

Sections (use Topic 3 research):
- **O que torna o bingo blockchain diferente:** Sem caller humano, pagamentos automaticos, sorteios verificaveis, premios programaveis (Topic 3, CryptoGambling Guide Dec 2025).
- **Standard:** Bolas sorteadas sequencialmente a cada 3.5s. Previsivel. Ideal para iniciantes.
- **Fixed:** Conjunto pre-definido de bolas. Sabe quantas bolas serao sorteadas antes de comecar.
- **FirstFull:** Corrida para completar o padrao primeiro. Alta variancia. Para jogadores competitivos.
- **Golden Ball:** Bola especial que desbloqueia jackpot/tier multiplo. Emocao adicional.
- **Multi-Match / Stage:** Multiplas condicoes de vitoria em uma rodada. 2 ou 3 estagios. Pagamentos mais frequentes.
- **Tabela comparativa:** Modo | Velocidade | Variancia | Engajamento | Melhor para
- **Como escolher o modo certo:** Iniciante → Standard. Busca emocao → Golden Ball. Quer ganhos frequentes → Multi-Match.

- [ ] **Step 2.3b-c: Create en + zh**

EN title: "Understanding Draw Modes"
ZH title: "了解游戏模式（抽奖模式）"

#### Verification for Task 2

- [ ] **Step 2.4: Build + verify**

```bash
pnpm --filter @cryptobingo/landing-page build
```

- [ ] **Step 2.5: Commit**

```bash
git add content/blog/en/cryptobingo-e-seguro.md content/blog/en/provably-fair.md content/blog/en/modos-de-jogo.md content/blog/pt/cryptobingo-e-seguro.md content/blog/pt/provably-fair.md content/blog/pt/modos-de-jogo.md content/blog/zh/cryptobingo-e-seguro.md content/blog/zh/provably-fair.md content/blog/zh/modos-de-jogo.md
git commit -m "feat(content): 3 novos posts P0 seguranca + provably-fair + modos
cryptobingo-e-seguro (FAQ seguranca), provably-fair (Topic 2 UKGC/MGA 2026),
modos-de-jogo (Topic 3 draw modes). pt/en/zh.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: P1 Blog Posts (security + smart contracts + rtp + patterns + nfts)

**Files — Create (3 files each × 5 posts = 15 files):**
- `content/blog/{locale}/seguranca-iniciantes.md`
- `content/blog/{locale}/smart-contracts.md`
- `content/blog/{locale}/rtp-85-porcento.md`
- `content/blog/{locale}/estrategias-padroes.md`
- `content/blog/{locale}/nfts-na-wax.md`

**Research sources:**
- Topics 2/7 for `seguranca-iniciantes.md`
- Topic 4 (RTP) for `rtp-85-porcento.md`
- Topic 5 (Patterns Strategy) for `estrategias-padroes.md`
- Topic 1 (WAX/NFTs) for `nfts-na-wax.md`

#### Post 3.1: `seguranca-iniciantes.md` — "Seguranca para Iniciantes: Protegendo Seus Ativos"

Publish date: 2026-07-28 (Phase 2, Week 9-10)

- [ ] **Step 3.1a: Create pt file**

```yaml
---
title: "Seguranca para Iniciantes: Protegendo Seus Ativos na WAX"
description: "Guia pratico de seguranca digital: proteja sua carteira, evite golpes e mantenja seus tokens seguros"
date: "2026-07-28T10:00:00Z"
author: "Time CryptoBingo"
tags: ["security", "guide", "beginner", "wallet"]
cover: ""
category: "beginner"
reading_time: 6
related:
  - cryptobingo-e-seguro
  - carteiras-crypto
  - provably-fair
related_tutorials:
  - criar-carteira-wax
  - configurar-carteira
  - verificar-sorteio
---
```

Sections:
- **Fundamentos de seguranca:** Seed phrase = tudo. Nunca digitalizar. Offline em papel/aco.
- **Protegendo sua WAX Wallet:** 2FA no Cloud Wallet. Nao compartilhar chave privada. Cuidado com extensoes maliciosas.
- **Golpes comuns:** Phishing (links falsos), airdrops maliciosos (approve scams), suporte falso no Discord/Telegram.
- **Permissoes de contrato:** Nunca aprovar "unlimited" sem entender. Revogar permissoes nao utilizadas (AtomicHub).
- **Seguranca no CryptoBingo:** So conectamos WalletConnect oficial. Nunca pedimos seed phrase.
- **O que fazer se for hackeado:** [checklist de emergencia]

- [ ] **Step 3.1b-c: en + zh**

EN title: "Security for Beginners: Protecting Your WAX Assets"
ZH title: "初学者安全指南：保护你的WAX资产"

#### Post 3.2: `smart-contracts.md` — "Como Funciona um Smart Contract?"

Publish date: 2026-08-04 (Phase 2, Week 11-12)

- [ ] **Step 3.2a: Create pt file**

```yaml
---
title: "Como Funciona um Smart Contract? Explicacao Simples"
description: "Desmistificando smart contracts: o que sao, como funcionam e porque garantem premios automaticos sem intermediarios"
date: "2026-08-04T10:00:00Z"
author: "Time CryptoBingo"
tags: ["blockchain", "guide", "beginner", "trust"]
cover: ""
category: "technology"
reading_time: 6
related:
  - o-que-e-blockchain
  - provably-fair
  - cryptobingo-e-seguro
related_tutorials:
  - verificar-sorteio
  - receber-premios
---
```

Sections:
- **O que e um smart contract?** Contrato auto-executavel. Codigo = lei. Analogia: maquina de vendas.
- **Como aplicamos no CryptoBingo:** Contrato gerencia: compra de tickets, sorteio (RNG oracle), pagamento de premios.
- **Imutabilidade:** Uma vez deployado, nem o time pode mudar as regras. So com novo contrato.
- **Transparencia:** Codigo no GitHub. Qualquer um pode auditar.
- **Por que nao da pra trapacear:** Regras硬codificadas. Validacao on-chain de pesos premios. Anti-inflacao de premio.
- **Exemplo pratico:** Fluxo completo: comprar ticket (on-chain) → sorteio (RNG oracle) → premio automatico.

- [ ] **Step 3.2b-c: en + zh**

EN title: "How Does a Smart Contract Work? Simple Explanation"
ZH title: "智能合约如何运作？简单解释"

#### Post 3.3: `rtp-85-porcento.md` — "RTP 85%: Como Funciona a Economia do Jogo"

Publish date: 2026-08-11 (Phase 3, Week 13-14)

**Research source:** Topic 4 — RTP in Blockchain Gaming

- [ ] **Step 3.3a: Create pt file**

```yaml
---
title: "RTP 85%: Como Funciona a Economia do CryptoBingo"
description: "Entenda o Return to Player de 85%, por que e menor que slots tradicional, e como o GGR de 15% sustenta a plataforma"
date: "2026-08-11T10:00:00Z"
author: "Time CryptoBingo"
tags: ["economy", "rtp", "tokenomics", "guide"]
cover: ""
category: "economy"
reading_time: 8
related:
  - tokenomics
  - estrategias-padroes
  - modos-de-jogo
related_tutorials:
  - receber-premios
  - comprar-tickets
---
```

Sections (use Topic 4 research):
- **O que e RTP?** Return to Player: % do dinheiro apostado que retorna aos jogadores como premios. Longo prazo, nao por sessao.
- **Onde o CryptoBingo se situa:** 85% RTP / 15% GGR. Comparacao: dice/crash crypto 99%, slots crypto 96-98%, slots tradicionais 92-95%, loteria 50-70% (KryptoCasinos Mar 2026).
- **Por que 85% e sustentavel:** Custo de transacoes on-chain, complexidade multi-padrao/multi-estagio, anti-inflacao de premios. Bingo nao e jogo de pura sorte por rodada — e produto multi-premio com custos on-chain (Coinranking May 2026).
- **Diferenca: RTP crypto vs tradicional:** Smart contracts imutaveis = RTP nao pode ser alterado (Quadcode Nov 2025). Operador nao ajusta meio do jogo.
- **O problema do RTP variavel:** Alguns provedores tem multi-tier (94/96/98%) e operador escolhe. Lobby pode mostrar RTP errado (WiseCasinoPicks Jun 2026). CryptoBingo: 85% fixo, on-chain, verificavel.
- **Para onde vai o GGR:** 15% → operacoes (infra, dev, suporte) + prize pools + tesouraria + crescimento.
- **RTP ≠ promessa de sessao:** Estatistica de longo prazo. Variancia e normal.

- [ ] **Step 3.3b-c: en + zh**

EN title: "85% RTP: How CryptoBingo's Game Economy Works"
ZH title: "85% 返奖率：CryptoBingo 游戏经济如何运作"

#### Post 3.4: `estrategias-padroes.md` — "Estrategias de Padroes no Bingo 5x5"

Publish date: 2026-08-18 (Phase 3, Week 15-16)

**Research source:** Topic 5 — Bingo Patterns Strategy

- [ ] **Step 3.4a: Create pt file**

```yaml
---
title: "Estrategias de Padroes no Bingo 5x5"
description: "Analise matematica dos padroes de bingo: probabilidades, estrategia multi-cartela e como maximizar seu entendimento do jogo"
date: "2026-08-18T10:00:00Z"
author: "Time CryptoBingo"
tags: ["patterns", "strategy", "gameplay", "guide"]
cover: ""
category: "gameplay"
reading_time: 8
related:
  - modos-de-jogo
  - rtp-85-porcento
  - provably-fair
related_tutorials:
  - comprar-tickets
  - receber-premios
---
```

Sections (use Topic 5 research data from RarePike and ToolsGambling):
- **Entendendo as probabilidades:** Distribuicao hipergeometrica. Linha unica: 50% prob em ~call 41. Four corners: ~call 58. Coverall: ~call 73 (ToolsGambling Mar 2026).
- **Estrategia multi-cartela:** 1 cartela → 5.6% ganhar linha em 20 calls. 4 cartelas → 20.6%. Rendimentos decrescentes explicados.
- **O mito das cartelas "da sorte":** Odds determinados por razao cartelas-jogadas / total, nao por selecao.
- **12 linhas possiveis:** 5 horizontais + 5 verticais + 2 diagonais (RarePike Mar 2026).
- **Padroes progressivos:** Linha → Four corners → X → Coverall — tensao crescente.
- **Teoria Tippett:** Jogos curtos: vies para numeros extremos. Jogos longos/coverall: vies para mediana (38 no 75-ball).
- **Quando trocar de estrategia:** Baseado no modo de jogo e premio.

- [ ] **Step 3.4b-c: en + zh**

EN title: "Bingo Pattern Strategies for 5x5"
ZH title: "5x5 宾果模式策略"

#### Post 3.5: `nfts-na-wax.md` — "NFTs na WAX: O Que Sao e Como Usar"

Publish date: 2026-08-25 (Phase 3, Week 13-14)

- [ ] **Step 3.5a: Create pt file**

```yaml
---
title: "NFTs na WAX: O Que Sao e Como Usar"
description: "Guia completo sobre NFTs no ecossistema WAX: AtomicHub, NeftyBlocks, e como NFTs se integram ao CryptoBingo"
date: "2026-08-25T10:00:00Z"
author: "Time CryptoBingo"
tags: ["wax", "nft", "guide", "blockchain"]
cover: ""
category: "technology"
reading_time: 6
related:
  - wax-blockchain-beginners
  - wax-blockchain
  - o-que-e-blockchain
related_tutorials:
  - criar-carteira-wax
  - recursos-wax
---
```

Sections:
- **O que sao NFTs na WAX:** Ativos digitais unicos na blockchain. Diferente de ETH — taxas de mint quase zero.
- **AtomicHub e NeftyBlocks:** Marketplace principal. Como comprar, vender, criar colecoes.
- **NFTs no CryptoBingo:** Esboco do modelo de integracao (se aplicavel). NFTs como badges, rewards, acesso a salas VIP.
- **Criando seu primeiro NFT:** Guia rapido. Ferramentas: SimpleAssets, AtomicAssets padrao.
- **Cuidados:** Verificar colecoes legitimas. Scams de "free mint" com approvals maliciosos.

- [ ] **Step 3.5b-c: en + zh**

EN title: "NFTs on WAX: What They Are and How to Use Them"
ZH title: "WAX 上的 NFT：它们是什么以及如何使用"

#### Verification for Task 3

- [ ] **Step 3.6: Build + verify**

```bash
pnpm --filter @cryptobingo/landing-page build
```

- [ ] **Step 3.7: Commit** (separate commits per post recommended, or batch)

```bash
git add content/blog/en/seguranca-iniciantes.md content/blog/en/smart-contracts.md content/blog/en/rtp-85-porcento.md content/blog/en/estrategias-padroes.md content/blog/en/nfts-na-wax.md content/blog/pt/seguranca-iniciantes.md content/blog/pt/smart-contracts.md content/blog/pt/rtp-85-porcento.md content/blog/pt/estrategias-padroes.md content/blog/pt/nfts-na-wax.md content/blog/zh/seguranca-iniciantes.md content/blog/zh/smart-contracts.md content/blog/zh/rtp-85-porcento.md content/blog/zh/estrategias-padroes.md content/blog/zh/nfts-na-wax.md
git commit -m "feat(content): 5 novos posts P1 seguranca + smart-contracts + rtp + padroes + nfts
Inclui pesquisa Topics 2/4/5/7 (RTP KryptoCasinos 2026, padroes ToolsGambling/RarePike 2026).
pt/en/zh.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: P2 Blog Posts (tokenomics + future + roadmap)

**Files — Create (3 files each × 3 posts = 9 files):**
- `content/blog/{locale}/tokenomics.md`
- `content/blog/{locale}/futuro-gaming-onchain.md`
- `content/blog/{locale}/roadmap.md`

**Research sources:**
- Topic 6 (Tokenomics) for `tokenomics.md`
- Topic 7 (Future of On-Chain Gaming) for `futuro-gaming-onchain.md`
- Topic 8 (Roadmap Communications) for `roadmap.md`

#### Post 4.1: `tokenomics.md` — "Tokenomics: BINGO Token e Seu Valor"

Publish date: 2026-09-01 (Phase 3, Week 17-18)

- [ ] **Step 4.1a: Create pt file**

```yaml
---
title: "Tokenomics: BINGO Token e a Economia do CryptoBingo"
description: "Analise do modelo economico do token BINGO: oferta, utilidade, sinks, e licoes do colapso do Axie Infinity"
date: "2026-09-01T10:00:00Z"
author: "Time CryptoBingo"
tags: ["tokenomics", "economy", "gamefi", "guide"]
cover: ""
category: "economy"
reading_time: 10
related:
  - rtp-85-porcento
  - futuro-gaming-onchain
  - roadmap
related_tutorials:
  - staking-governance
---
```

Sections (use Topic 6 research):
- **Por que tokenomics importa:** 93% dos blockchain games falham. Tokenomics mal desenhada e a causa principal (Plisio Apr 2026).
- **O colapso do Axie Infinity:** AXS -99.3% do ATH. SLP (utility token) com emissoes ilimitadas sem sinks proporcionais. Licao principal (Gate Blog Feb 2026).
- **GameFi 2.0 (2026):** bAXS (bonded token nao-transferivel), emission halt, treasury diversification. O novo padrao (Blockchaingames.fun Mar 2026).
- **Modelo dual-token:** Governance (votacao, controle) + Utility (uso no jogo, sinks). Separacao de papeis (CryptoGames.gg May 2026).
- **Sinks > Faucets:** Emissoes controladas. Mecanismos de queima proporcionais ao crescimento. RavenQuest como caso de sucesso.
- **BINGO token (projetado):** [Esboco do modelo baseado nos docs do projeto — oferta, utilidades, sinks planejados].
- **Mercado GameFi 2026:** $29.9B, projetado $259B ate 2035 (CAGR 27%) (Plisio).

- [ ] **Step 4.1b-c: en + zh**

EN title: "Tokenomics: BINGO Token and Its Value"
ZH title: "代币经济学：BINGO 代币及其价值"

#### Post 4.2: `futuro-gaming-onchain.md` — "O Futuro do Gaming On-Chain"

Publish date: 2026-09-08 (Phase 3, Week 19-20)

- [ ] **Step 4.2a: Create pt file**

```yaml
---
title: "O Futuro do Gaming On-Chain em 2026"
description: "Mercado de $29.9B, 7M+ carteiras ativas, blockchains invisiveis, IA autonomica — o estado do blockchain gaming"
date: "2026-09-08T10:00:00Z"
author: "Time CryptoBingo"
tags: ["blockchain", "gamefi", "guide", "community"]
cover: ""
category: "community"
reading_time: 9
related:
  - tokenomics
  - roadmap
  - wax-blockchain
related_tutorials: []
---
```

Sections (use Topic 7 research):
- **O mercado em 2026:** $29.9B, projetado $259B em 2035. 7M+ daily active wallets (Plisio Apr 2026).
- **A blockchain desapareceu:** Account abstraction, email login, gasless tx. Jogadores nao sabem que estao on-chain.
- **IA + Blockchain convergindo:** Agentes autonomos, NPCs com economias dinâmicas, conteudo gerado proceduralmente verificavel.
- **Mobile e a porta de entrada:** TON/Telegram, Sui (81.7x DAU growth). 900M usuarios Telegram.
- **O que sobreviveu:** 93% falharam. Os 7% que funcionam (Off The Grid, Axie Classic, Pixels) — o jogo funciona sem tokens.
- **AAA finalmente construindo:** Nexon (MapleStory N), Ubisoft, Square Enix.
- **Onde o CryptoBingo se encaixa:** Bingo on-chain como caso de uso massivo — jogo casual + premios reais + zero taxas na WAX.

- [ ] **Step 4.2b-c: en + zh**

EN title: "The Future of On-Chain Gaming in 2026"
ZH title: "2026年链上游戏的未来"

#### Post 4.3: `roadmap.md` — "Roadmap: O Que Vem Por Ai"

Publish date: 2026-09-15 (Phase 3, Week 19-20)

- [ ] **Step 4.3a: Create pt file**

```yaml
---
title: "Roadmap CryptoBingo: O Que Vem Por Ai"
description: "Nossos planos para os proximos meses: novos modos de jogo, token BINGO, integracao mobile e muito mais"
date: "2026-09-15T10:00:00Z"
author: "Time CryptoBingo"
tags: ["community", "guide", "gamefi"]
cover: ""
category: "community"
reading_time: 6
related:
  - futuro-gaming-onchain
  - tokenomics
  - modos-de-jogo
related_tutorials:
  - staking-governance
---
```

Sections (use Topic 8 research approach):
- **Transparencia como valor:** Projetos com roadmap transparente tem 2x mais retencao de comunidade (CoinGecko via CryptoPromo Apr 2026).
- **O que entregamos ate agora:** Recapitulacao de milestones cumpridos.
- **Proximos 3 meses:** Novos modos de jogo, melhorias de UI, integracoes.
- **Proximos 6 meses:** Token BINGO, staking/governance, mobile app.
- **Proximos 12 meses:** Expansao de mercado, parcerias, integracao TON.
- **Como acompanhamos:** GitHub publico, dashboard de milestones, AMAs trimestrais.
- **Participe:** Discord, Telegram, forum de governance.

- [ ] **Step 4.3b-c: en + zh**

EN title: "CryptoBingo Roadmap: What's Coming Next"
ZH title: "CryptoBingo 路线图：接下来的计划"

#### Verification for Task 4

- [ ] **Step 4.4: Build + verify**

```bash
pnpm --filter @cryptobingo/landing-page build
```

- [ ] **Step 4.5: Commit**

```bash
git add content/blog/en/tokenomics.md content/blog/en/futuro-gaming-onchain.md content/blog/en/roadmap.md content/blog/pt/tokenomics.md content/blog/pt/futuro-gaming-onchain.md content/blog/pt/roadmap.md content/blog/zh/tokenomics.md content/blog/zh/futuro-gaming-onchain.md content/blog/zh/roadmap.md
git commit -m "feat(content): 3 posts P2 tokenomics + futuro on-chain + roadmap
Topics 6/7/8: mercado GameFi $29.9B, licoes Axie, roadmap transparente.
pt/en/zh. Todos os 14 posts blog completos.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Create Tutorial Directory Structure + Revise Existing Tutorial

**Files:**
- Create: `content/tutorial/en/` (directory)
- Create: `content/tutorial/pt/` (directory)
- Create: `content/tutorial/zh/` (directory)
- Create: `content/tutorial/{locale}/criar-carteira-wax.mdx` (revised)

**Interfaces:**
- Tutorial frontmatter: `title, description, order, cover (optional), related`
- Tutorial body: MDX (markdown with JSX support if needed, but plain markdown works)

The spec says tutorials = MDX, and `content.ts:136` loads `.mdx`. So ALL tutorial files MUST use `.mdx` extension.

#### Tutorial 5.1: `criar-carteira-wax.mdx`

Revise existing tutorial (currently exists as what? Let me check — the spec says "Criar Carteira WAX (ja existe, revisar)". But I found no tutorial directory. So either it exists in another form or it was planned but not created yet. I'll treat this as a new creation with "revised" referring to potential future state.)

- [ ] **Step 5.1a: Create directories**

```bash
mkdir -p content/tutorial/en content/tutorial/pt content/tutorial/zh
```

- [ ] **Step 5.1b: Create pt tutorial**

`content/tutorial/pt/criar-carteira-wax.mdx`:

```yaml
---
title: "Como Criar Sua Carteira WAX em 2 Minutos"
description: "Passo a passo para criar sua primeira carteira WAX — WAX Cloud Wallet (recomendada) ou Anchor Wallet"
order: 1
cover: ""
related:
  - carteiras-crypto
  - wax-blockchain-beginners
  - wax-blockchain
---
```

Sections:
- **Opcao 1: WAX Cloud Wallet (recomendado)**
  1. Acesse wallet.wax.io
  2. Clique "Create Account"
  3. Escolha nome de usuario (12 caracteres, a-z1-5)
  4. Defina email e senha
  5. Pronto! Carteira criada em 30 segundos
- **Opcao 2: Anchor Wallet (auto-custodia)**
  1. Baixe Anchor Wallet (anchor.link)
  2. Instale e crie nova wallet
  3. Salve a seed phrase OFFLINE (papel, nao print)
  4. Crie conta WAX (paga taxa unica ~10 WAX)
- **Dica:** Comece com Cloud Wallet. Migre para Anchor quando estiver confortavel.
- **Proximo passo:** Compre WAX para jogar.

- [ ] **Step 5.1c: Create en + zh**

EN title: "How to Create Your WAX Wallet in 2 Minutes"
ZH title: "如何在2分钟内创建你的WAX钱包"

Same structure, translated.

#### Verification for Task 5

- [ ] **Step 5.2: Build + verify**

```bash
pnpm --filter @cryptobingo/landing-page build
```

Expected: `lib/content.ts:loadTutorials` reads `content/tutorial/{locale}/*.mdx`, returns array sorted by `order`.

- [ ] **Step 5.3: Commit**

```bash
git add content/tutorial/
git commit -m "feat(content): cria diretorio tutorial + revisa criar-carteira-wax
Diretorio content/tutorial/{en,pt,zh}/criar-carteira-wax.mdx.
Formato MDX obrigatorio (content.ts:136 carrega .mdx).
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: P0 Tutorials — New Beginner Tutorials

**Files — Create (3 files each × 3 new tutorials = 9 files):**
- `content/tutorial/{locale}/configurar-carteira.mdx`
- `content/tutorial/{locale}/comprar-wax.mdx`
- `content/tutorial/{locale}/comprar-tickets.mdx`

#### Tutorial 6.1: `configurar-carteira.mdx`

Publish order: 2

- [ ] **Step 6.1a: Create pt file**

```yaml
---
title: "Como Configurar Sua Primeira Carteira WAX"
description: "Apos criar sua carteira, configure seguranca, salve a seed phrase, e prepare-se para jogar"
order: 2
cover: ""
related:
  - carteiras-crypto
  - seguranca-iniciantes
  - wax-blockchain-beginners
---
```

Sections:
- **Apos criar a carteira:** Verificar saldo, configurar 2FA (Cloud Wallet), testar conexao.
- **Seed phrase (Anchor):** Armazenar offline. Papel + plastico. NUNCA digitar online.
- **Seguranca basica:** Senha forte. 2FA. Nao compartilhar chave privada. Cuidado com phishing.
- **Conectando ao CryptoBingo:** Botao "Connect Wallet" → WAX Cloud Wallet ou Anchor → Confirmar conexao.
- **Testando:** Compartilhar link do perfil publico WAX.

- [ ] **Step 6.1b-c: en + zh**

EN title: "How to Set Up Your First WAX Wallet"
ZH title: "如何设置你的第一个WAX钱包"

#### Tutorial 6.2: `comprar-wax.mdx`

Publish order: 3

- [ ] **Step 6.2a: Create pt file**

```yaml
---
title: "Como Comprar WAX em Exchanges"
description: "Guia completo para comprar tokens WAX em exchanges centralizadas e descentralizadas"
order: 3
cover: ""
related:
  - carteiras-crypto
  - wax-blockchain
  - tokenomics
---
```

Sections:
- **Exchanges centralizadas:** Binance, KuCoin, Gate.io. Comprar WAX com cartao/PIX.
- **Exchanges descentralizadas:** Alcor Exchange (WAX DEX). Trocar USDT/WUF por WAX.
- **Transferindo para sua carteira:** Copiar endereco WAX da sua wallet. Enviar da exchange. Confirmar em ~2s (finalidade WAX).
- **Taxas:** Quase zero na WAX. Taxa na exchange (variavel).
- **Quanto WAX comprar:** Tickets CryptoBingo custam ~X WAX. Calcular orcamento.
- **Problemas comuns:** Endereco errado (verificar!), memo missing (algumas exchanges exigem), saldo minimo para staking.

- [ ] **Step 6.2b-c: en + zh**

EN title: "How to Buy WAX on Exchanges"
ZH title: "如何在交易所购买WAX"

#### Tutorial 6.3: `comprar-tickets.mdx`

Publish order: 4

- [ ] **Step 6.3a: Create pt file**

```yaml
---
title: "Como Comprar Tickets no CryptoBingo"
description: "Passo a passo para comprar seu primeiro ticket e comecar a jogar bingo on-chain"
order: 4
cover: ""
related:
  - modos-de-jogo
  - estrategias-padroes
  - rtp-85-porcento
---
```

Sections:
- **Antes de comecar:** Carteira WAX com saldo. Conectar ao CryptoBingo. Escolher sala.
- **Escolhendo uma sala:** Diferentes precos de ticket, premios, modos de jogo.
- **Comprando tickets:** Selecionar quantidade → Confirmar transacao na carteira → Aguardar ~2s → Tickets na sua conta.
- **Tipos de ticket:** Simples vs multiplo. Preco varia por sala.
- **Saldo e historico:** Ver tickets comprados, historico de partidas, premios recebidos.
- **WUF token:** Token usado nas salas. Onde comprar.

- [ ] **Step 6.3b-c: en + zh**

EN title: "How to Buy Tickets on CryptoBingo"
ZH title: "如何在CryptoBingo购买门票"

#### Verification for Task 6

- [ ] **Step 6.4: Build + verify**

```bash
pnpm --filter @cryptobingo/landing-page build
```

Expected: tutorials appear in tutorials index, ordered 1-4.

- [ ] **Step 6.5: Commit**

```bash
git add content/tutorial/en/configurar-carteira.mdx content/tutorial/en/comprar-wax.mdx content/tutorial/en/comprar-tickets.mdx content/tutorial/pt/configurar-carteira.mdx content/tutorial/pt/comprar-wax.mdx content/tutorial/pt/comprar-tickets.mdx content/tutorial/zh/configurar-carteira.mdx content/tutorial/zh/comprar-wax.mdx content/tutorial/zh/comprar-tickets.mdx
git commit -m "feat(content): 3 novos tutoriais P0 configurar-carteira + comprar-wax + tickets
Tutoriais passo-a-passo para iniciantes. pt/en/zh. Ordem 2-4.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: P1 Tutorials (intermediate)

**Files — Create (3 files each × 4 tutorials = 12 files):**
- `content/tutorial/{locale}/recursos-wax.mdx`
- `content/tutorial/{locale}/depositar-sacar.mdx`
- `content/tutorial/{locale}/receber-premios.mdx`
- `content/tutorial/{locale}/verificar-sorteio.mdx`

#### Tutorial 7.1: `recursos-wax.mdx`

Publish order: 5

- [ ] **Step 7.1a: Create pt file**

```yaml
---
title: "Entendendo Recursos na WAX (CPU, NET, RAM)"
description: "Guia sobre gerenciamento de recursos WAX: CPU, NET, RAM — e por que voce nunca paga gas"
order: 5
cover: ""
related:
  - wax-blockchain
  - criar-carteira-wax
  - configurar-carteira
---
```

Sections:
- **Zero gas nao e magica:** Precisa de recursos stakeados (CPU/NET). Explicacao do modelo delegado.
- **CPU:** Tempo de processamento. Recarrega com o tempo. Quanto mais WAX stakeado, mais CPU.
- **NET:** Largura de banda de rede. Raramente e problema.
- **RAM:** Armazenamento de dados (tickets, NFTs). Compravel/vendavel.
- **Verificando recursos:** `cleos get account` ou dashboard WAX.
- **O que fazer se ficar sem CPU:** Stake mais WAX. Ou espere recarregar (geralmente 24h).
- **Dica:** Compre um pouco mais de WAX do que precisa para jogar — use o excedente para staking de CPU.

- [ ] **Step 7.1b-c: en + zh**

#### Tutorial 7.2: `depositar-sacar.mdx`

Publish order: 6

- [ ] **Step 7.2a: Create pt file**

```yaml
---
title: "Como Depositar e Sacar no CryptoBingo"
description: "Guia completo sobre depositos e saques na plataforma: taxas, tempos e seguranca"
order: 6
cover: ""
related:
  - rtp-85-porcento
  - receber-premios
  - cryptobingo-e-seguro
---
```

Sections:
- **Depositando:** Enviar WAX/WUF para endereco do contrato CryptoBingo. Confirmacao on-chain.
- **Sacando:** Solicitar saque no dashboard. Processado automaticamente.
- **Taxas:** Quase zero na WAX. Nenhuma taxa do CryptoBingo (so a taxa da rede).
- **Tempos:** Depositos: ~2s (finalidade WAX). Saques: ~30s-2min (processamento do worker).
- **Seguranca:** Saques so para carteira conectada. Limites diarios (se aplicavel). Multisig para valores altos.

- [ ] **Step 7.2b-c: en + zh**

#### Tutorial 7.3: `receber-premios.mdx`

Publish order: 7

- [ ] **Step 7.3a: Create pt file**

```yaml
---
title: "Receber e Verificar Premios no CryptoBingo"
description: "Como os premios sao pagos automaticamente e como verificar se voce recebeu o valor correto"
order: 7
cover: ""
related:
  - provably-fair
  - rtp-85-porcento
  - estrategias-padroes
---
```

Sections:
- **Premios automaticos:** Nao precisa reivindicar — smart contract paga automaticamente.
- **Pipeline de premios:** 3 eventos WebSocket: winner_found → prize_tx_sent → prize_confirmed.
- **Verificando no block explorer:** Buscar TX ID da transacao de premio.
- **Multi-match stages:** Premios pagos por stage. Stage 1, Stage 2, etc.
- **Combo bonus:** Premios extras por combinacoes especiais. Verificado on-chain.
- **O que fazer se nao recebeu:** Verificar status no dashboard. Contatar suporte com game ID.

- [ ] **Step 7.3b-c: en + zh**

#### Tutorial 7.4: `verificar-sorteio.mdx`

Publish order: 8

- [ ] **Step 7.4a: Create pt file**

```yaml
---
title: "Como Verificar um Sorteio no Block Explorer"
description: "Passo a passo para verificar qualquer sorteio do CryptoBingo no WAX block explorer"
order: 8
cover: ""
related:
  - provably-fair
  - rng-oracle-explained
  - cryptobingo-e-seguro
---
```

Sections:
- **O que voce precisa:** Game ID (mostrado na UI do jogo). Block explorer URL (waxblock.io).
- **Passo 1:** Abrir waxblock.io e buscar pelo transaction ID do sorteio.
- **Passo 2:** Encontrar action `startdraw` ou `drawn` no contrato bingogamectr.
- **Passo 3:** Verificar commitment hash (publicado antes do sorteio).
- **Passo 4:** Verificar reveal (publicado apos o sorteio). Hash revelado = hash committed?
- **Passo 5:** Verificar numeros sorteados correspondem aos mostrados na UI.
- **Verificacao automatica:** Ferramenta open-source GitHub (link). Entra game ID, recebe resultado.

- [ ] **Step 7.4b-c: en + zh**

#### Verification for Task 7

- [ ] **Step 7.5: Build + verify**

```bash
pnpm --filter @cryptobingo/landing-page build
```

Expected: 9 tutorials total (1 revised + 4 P0 + 4 P1), ordered 1-8.

- [ ] **Step 7.6: Commit**

```bash
git add content/tutorial/en/recursos-wax.mdx content/tutorial/en/depositar-sacar.mdx content/tutorial/en/receber-premios.mdx content/tutorial/en/verificar-sorteio.mdx content/tutorial/pt/recursos-wax.mdx content/tutorial/pt/depositar-sacar.mdx content/tutorial/pt/receber-premios.mdx content/tutorial/pt/verificar-sorteio.mdx content/tutorial/zh/recursos-wax.mdx content/tutorial/zh/depositar-sacar.mdx content/tutorial/zh/receber-premios.mdx content/tutorial/zh/verificar-sorteio.mdx
git commit -m "feat(content): 4 novos tutoriais P1 recursos + depositar/sacar + premios + verificacao
Ordem 5-8. Topics: recursos CPU/NET/RAM, deposito/saque, pipeline premios ADR-038,
verificacao block explorer. pt/en/zh.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 8: P2 Tutorial (staking + governance)

**Files — Create (3 locales):**
- `content/tutorial/{locale}/staking-governance.mdx`

#### Tutorial 8.1: `staking-governance.mdx`

Publish order: 9

- [ ] **Step 8.1a: Create pt file**

```yaml
---
title: "Guia de Staking e Governance do CryptoBingo"
description: "Aprenda sobre staking de tokens BINGO, participacao em governance e como votar propostas"
order: 9
cover: ""
related:
  - tokenomics
  - roadmap
  - rtp-85-porcento
---
```

Sections:
- **O que e staking:** Travar tokens para receber rewards. Segurar oferta circulante.
- **Staking de CPU (WAX):** Como funciona. Diferente de staking de token.
- **Staking de BINGO:** (Projetado) Rewards em BINGO por staking. Periodos de lock. Penalidade por unstake antecipado.
- **Governance:** Votar propostas de parametros do jogo, taxas, novas features.
- **Como participar:** Conectar wallet → Delegar votos → Propor mudancas.
- **Riscos:** Impermanent loss (se aplicavel), periodo de lock, variacao de rewards.

- [ ] **Step 8.1b-c: en + zh**

EN title: "CryptoBingo Staking & Governance Guide"
ZH title: "CryptoBingo 质押与治理指南"

#### Verification for Task 8

- [ ] **Step 8.2: Build + verify**

```bash
pnpm --filter @cryptobingo/landing-page build
```

Expected: 9 tutorials total, ordered 1-9. All pages render.

- [ ] **Step 8.3: Commit**

```bash
git add content/tutorial/en/staking-governance.mdx content/tutorial/pt/staking-governance.mdx content/tutorial/zh/staking-governance.mdx
git commit -m "feat(content): tutorial P2 staking e governance
Ordem 9. Explica staking BINGO, governance, votacao de propostas.
pt/en/zh. 9 tutoriais completos.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Cross-Referencing Audit & Final Verification

**What:** Verify that ALL `related:` and `related_tutorials:` frontmatter fields across all 14 blog posts + 9 tutorials have correct slugs that exist. Run final build. Verify Plan D (Search) document ID compatibility.

- [ ] **Step 9.1: Audit cross-references**

Verify every slug in `related:` and `related_tutorials:` frontmatter across all files matches an existing file:

```bash
cd apps/landing-page && node -e "
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

function collectSlugs(dir) {
  const result = new Set();
  if (!fs.existsSync(dir)) return result;
  fs.readdirSync(dir).forEach(f => {
    if (f.endsWith('.md') || f.endsWith('.mdx')) result.add(f.replace(/\.(md|mdx)$/, ''));
  });
  return result;
}

const blogSlugs = collectSlugs('../../content/blog/en');
const tutorialSlugs = collectSlugs('../../content/tutorial/en');

let errors = 0;
['blog', 'tutorial'].forEach(type => {
  const dir = '../../content/' + (type === 'blog' ? 'blog' : 'tutorial') + '/en';
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(file => {
    const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
    const { data } = matter(raw);
    const related = data.related || [];
    const relatedTuts = data.related_tutorials || [];
    related.forEach(slug => {
      if (!blogSlugs.has(slug)) {
        console.error('MISSING blog related:', file, '->', slug);
        errors++;
      }
    });
    relatedTuts.forEach(slug => {
      if (!tutorialSlugs.has(slug)) {
        console.error('MISSING tutorial related_tutorials:', file, '->', slug);
        errors++;
      }
    });
  });
});

if (errors) process.exit(1);
else console.log('All cross-references valid:', blogSlugs.size, 'blog +', tutorialSlugs.size, 'tutorial slugs');
"
```

Expected: "All cross-references valid" with zero MISSING.

- [ ] **Step 9.2: Final build**

```bash
pnpm --filter @cryptobingo/landing-page build
```

Expected: build succeeds. All 14 blog posts + 9 tutorials render on their respective index pages and individual pages.

- [ ] **Step 9.3: Verify Plan D (Search) compatibility**

Ensure document ID format is `{type}/{slug}`:

```bash
cd apps/landing-page && node -e "
const slugs = [];
const blogDir = '../../content/blog/en';
const tutDir = '../../content/tutorial/en';
if (fs.existsSync(blogDir)) fs.readdirSync(blogDir).filter(f => f.endsWith('.md')).forEach(f => slugs.push('blog/' + f.replace(/\.md$/, '')));
if (fs.existsSync(tutDir)) fs.readdirSync(tutDir).filter(f => f.endsWith('.mdx')).forEach(f => slugs.push('tutorial/' + f.replace(/\.mdx$/, '')));
console.log('Search document IDs (' + slugs.length + '):');
slugs.sort().forEach(s => console.log('  ' + s));
"
```

Expected: all IDs in format `blog/{slug}` or `tutorial/{slug}`. No duplicates. This is the format consumed by Plan D's `generate-search-index.mjs`.

- [ ] **Step 9.4: Commit (if any fixes needed from steps 9.1-9.3)**

```bash
git add <fixed-files>
git commit -m "fix(content): corrige cross-references e document IDs
Audit de related/related_tutorials slugs. Prepara para Plan D search index.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Content Production Summary

| Type | Priority | Count × 3 Locales | Total Files |
|------|----------|-------------------|-------------|
| Blog — Revise existing | — | 2 | 6 |
| Blog — P0 (batch 1) | P0 | 3 | 9 |
| Blog — P0 (batch 2) | P0 | 3 | 9 |
| Blog — P1 | P1 | 5 | 15 |
| Blog — P2 | P2 | 3 | 9 |
| **Blog subtotal** | | **14 posts** | **48 files** |
| Tutorial — Revise | P0 | 1 | 3 |
| Tutorial — P0 new | P0 | 3 | 9 |
| Tutorial — P1 | P1 | 4 | 12 |
| Tutorial — P2 | P2 | 1 | 3 |
| **Tutorial subtotal** | | **9 tutorials** | **27 files** |
| **Grand total** | | **23 content items** | **75 files** |

### Tags Taxonomy Applied (18 tags):
wax, blockchain, gamefi, rng, security, economy, tokenomics, patterns, strategy, guide, tutorial, community, provably-fair, beginner, wallet, trust, nft, faq

### Categories Applied (5):
technology, gameplay, economy, community, beginner

### Editorial Calendar Adherence:
- Phase 1 (Weeks 1-6, Jul 7 — Aug 4): 6 P0 beginner posts + 4 P0 tutorials
- Phase 2 (Weeks 7-12, Aug 4 — Aug 25): 5 P1 posts + 4 P1 tutorials
- Phase 3 (Weeks 13-20, Sep 1 — Sep 15): 3 P2 posts + 1 P2 tutorial

### Cross-Dependency: Plan D (Search)
- Document ID format: `blog/{slug}` or `tutorial/{slug}`
- `generate-search-index.mjs` reads `content/blog/{locale}/*.md` and `content/tutorial/{locale}/*.mdx`
- Ensure body is plain text for search indexing (no JSX)
- All files in place before Plan D runs
