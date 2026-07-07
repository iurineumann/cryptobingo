# Plano de Remediacao de Conteudo — Julho 2026

**Base:** ADR-044
**Branch:** `feature/lp-content-ux-search` (continuacao)
**Data:** 2026-07-05

---

## Contexto

75 arquivos de conteudo criados sem seguir workflow de qualidade definido. Este plano repara o conteudo existente e implementa os mecanismos para evitar reincidencia.

## Fase 0: Infraestrutura de Qualidade

### Task 0.1: Indice de Slugs Traduzidos

**Arquivo:** `content/slugs.json`
**Modificacao:** `lib/content.ts`

Criar mapeamento {filename → {pt, en, zh}}. Modificar `loadBlogPost`, `loadBlogPosts`, `loadTutorial`, `loadTutorials` p/ usar slugs do indice nas URLs.

**Testes:** slugIndex.test.ts — verifica que cada locale tem slug unico, que filenames existem, que slugs sao URL-safe.

### Task 0.2: Link Pattern

Criar padrao de links contextuais:
- Secao "Referencias" no final de cada post
- Links internos usando slugs do indice
- Links externos com URL completa

### Task 0.3: Content QA Tooling

Script `scripts/check-content-qa.mjs` que valida:
- `images: []` nao vazio em todo post
- Nenhum placeholder como "TODO" ou "EXEMPLO" no body
- `reading_time` > 0
- `related` com pelo menos 1 entry
- `date` valida (ISO 8601)
- Body tem mais de 500 caracteres
- Nenhum link quebrado (valida internos)

---

## Fase 1: Remediacao de Conteudo (P0 — Erros Factuais)

### Task 1.1: WAX Cloud Wallet — Atualizar Info

**Arquivos (9):**
- `content/blog/{locale}/carteiras-crypto.md`
- `content/tutorial/{locale}/criar-carteira-wax.mdx`
- `content/tutorial/{locale}/configurar-carteira.mdx`

**O que mudar:**
- WAX Cloud Wallet **nao e mais custodial pura** — novo modelo (Mar 2026) usa passkeys + mnemonic 12 palavras
- Adicionar: exportacao de private keys, importacao na Anchor, Vault (signing persistente)
- Adicionar: criacao de conta **gratuita** (sem taxa)
- Adicionar: mobile iOS/Android
- Atualizar: "anchor.link" → docs.wax.io links oficiais

### Task 1.2: EOS → Vaulta

**Arquivos (3):**
- `content/blog/{locale}/wax-blockchain.md`

**O que mudar:**
- EOS renomeado para **Vaulta** (Mar 2025) — Web3 banking
- Tabela comparativa WAX vs concorrentes: substituir EOS por Vaulta
- Adicionar: chains Antelope atuais (Telos, UX Network, Proton, Ultra, FIO)

### Task 1.3: Stats WAX Atualizadas

**Arquivos (3):**
- `content/blog/{locale}/wax-blockchain.md`

**O que mudar:**
- Confirmar 215,6K DAU (Jun 2026, Gate News) — OK
- Atualizar: transacoes por trimestre com dados mais recentes
- Adicionar: WAX carbon neutral desde 2021
- Adicionar: criacao de conta gratuita desde 2026

---

## Fase 2: Imagens

### Task 2.1: Frontmatter images

Para cada post/tutorial, adicionar `images: []` com ao menos 1 image conceitual (Unsplash). Seguir padrao:

```yaml
images:
  - src: https://images.unsplash.com/photo-XXX?w=1200&q=80
    alt: "Descricao"
    caption: "Legenda opcional"
```

### Task 2.2: Figure inline

Adicionar `<Figure>` e `![alt](src)` inline nos pontos-chave de cada post:
- Diagramas conceituais (blockchain, provably fair fluxo)
- Screenshots (tutoriais: criar carteira, comprar ticket)
- Tabelas e comparativos (quando relevante)

---

## Fase 3: Links Contextuais

### Task 3.1: Secao Referencias

Adicionar secao "Referencias" ao final de cada post listando:
- Documentacao oficial WAX (docs.wax.io)
- Fontes de dados (DappRadar, Gate News)
- Links p/ posts relacionados internos

### Task 3.2: Links Inline

Revisar cada post para adicionar links contextuais:
- Ao mencionar "WAX Cloud Wallet" → link p/ tutorial criar-carteira-wax
- Ao mencionar "provably fair" → link p/ post provably-fair
- Ao mencionar "RTP 85%" → link p/ post rtp-85-porcento

---

## Fase 4: Workflow de Personas (Pre-commit)

### Task 4.1: Executar Personas no Conteudo Remediatado

Para cada bloco de remediacao, ativar:

1. **Core:** Copywriter, Editor, Domain Expert — revisam correcoes
2. **Visual Designer:** valida imagens e layout
3. **SEO Specialist:** valida slugs, links internos, meta descriptions
4. **Curador Midia:** valida fontes de imagens e atribuicoes
5. **Localization QA:** valida traducao pt/en/zh

### Task 4.2: Indexar Decisoes no RAG

Apos cada task, indexar:
- Decisoes de correcao factual
- URLs de imagens escolhidas
- Padroes de link adotados

---

## Riscos e Mitigacoes

| Risco | Impacto | Mitigacao |
|-------|---------|-----------|
| Links externos quebrarem | Medio | Usar archive.org como fallback nas referencias |
| Slugs index desync | Alto | Script de validacao CI compara slugs.json com filesystem |
| Imagens Unsplash expirarem | Baixo | Baixar imagens p/ `/public/images/` como step final |
| Novo workflow aumentar tempo | Medio | Aceitar como custo de qualidade |

---

## Criterios de Aceitacao

- [ ] `scripts/check-content-qa.mjs` nao reporta erros
- [ ] Info factual verificada contra docs.wax.io (menos de 90 dias)
- [ ] Cada post tem ≥1 imagem no frontmatter
- [ ] Cada post tem secao "Referencias"
- [ ] Slugs traduzidos funcionam (URL = slug locale, file = filename original)
- [ ] Personas workflow executado e indexado no RAG
- [ ] Build OK (99+ URLs)
- [ ] 40+ test files / 160+ tests PASS
