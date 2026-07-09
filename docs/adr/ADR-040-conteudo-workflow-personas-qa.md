# ADR-040 — Workflow de Producao de Conteudo com Personas e QA Obrigatorio

**Status:** Aceito (2026-07-05)
**Data:** 2026-07-05

---

## Problema

O Plan C produziu 75 arquivos de conteudo (14 blog posts + 9 tutoriais × 3 locales) sem seguir o workflow de qualidade definido no spec e nas skills. Como resultado:

1. **`images: []` vazio** em todos os 75 arquivos — violacao direta do Content Quality Standards (secao 4.7)
2. **Info desatualizada:** WAX Cloud Wallet descrita como custodial pura, mas versao Mar 2026 oferece mnemonic + export keys + passkeys + Vault
3. **EOS mencionado como concorrente** — renomeado para Vaulta em Mar 2025
4. **Links contextuais ausentes** — sem footnotes, sem referencias a fontes, sem links internos
5. **Slugs nao traduziveis** — URL atrelada ao nome do arquivo, impedindo URLs localizadas
6. **Workflow de personas nao executado** — 22 personas definidas, zero ativadas durante a producao
7. **RAG nao consultado** — decisoes anteriores (content quality, images, templates) ignoradas
8. **Task 9 (cross-ref audit) pulada** — validacao final never aconteceu

### Causa Raiz

O processo de criacao foi tratado como tarefa mecanica de "escrever N arquivos" sem ativar as camadas de qualidade definidas no proprio sistema:

| Camada | Status |
|--------|--------|
| TDD | OK (testes escritos primeiro) |
| Content Quality Standards | **Ignorado** |
| Workflow personas | **Ignorado** |
| RAG consulta pre-task | **Ignorado** |
| Cross-ref audit | **Pulado** |
| Revisao par (especialistas) | **Nao feito** |

A vice do sistema e que o agente executor (IA) nao tem o contexto completo de todas as camadas simultaneamente — ele precisa ser orientado por skills, RAG e personas para nao produzir conteudo raso.

## Decisao

### 1. Checkpoint de Qualidade Obrigatorio

Todo bloco de producao de conteudo (5+ arquivos) deve passar por um checkpoint de qualidade ANTES de ser considerado completo. O checkpoint inclui:

- [ ] Frontmatter `images: []` populado (pelo menos 1 imagem conceitual)
- [ ] Info factual verificada contra pesquisa web (max 90 dias)
- [ ] Links contextuais internos (min 3 por post) + footnote para fontes externas
- [ ] Slugs traduzidos indexados (se sistema implementado)
- [ ] Leitura cross-ref com posts relacionados (ao menos 1 paragrado por link)

### 2. Personas Engine Obrigatoria

Antes de criar conteudo, carregar as personas aplicaveis via skill `frontend-feature` e RAG:

| Tipo | Personas | Quando |
|------|----------|--------|
| Core | Copywriter, Editor, Domain Expert | Sempre |
| Producao | Visual Designer, Curador Midia, SEO Specialist | Sempre |
| Producao (condicional) | Psicologo Cognitivo, Designer Instrucional, UX Writer | Conteudo complexo |
| Audiencia | Leigo Total, Entusiasta Crypto, Bingueiro Tradicional, Gamer GameFi | Revisao pos-producao |

Fluxo:
1. Core produz rascunho
2. Especialistas produtores refinam ate consenso
3. Core seleciona 1-2 personas audiencia → avaliam eficacia
4. Feedback incorporado
5. Lead aprova

### 3. RAG como Fonte de Verdade de Qualidade

Consultar RAG no inicio de cada sessao/task com tags:
- `content-quality` — decisoes de imagens, Figure, templates
- `persona-decision` — decisoes de personas
- `audience-personas` — personas de publico-alvo
- `images` — workflow de imagens
- `figure` — componente Figure
- `callout` — componente Callout
- `template` — templates de conteudo

### 4. Slugs Traduziveis via Indice

Criar `content/slugs.json` com mapeamento:

```json
{
  "o-que-e-blockchain": {
    "pt": "o-que-e-blockchain",
    "en": "what-is-blockchain",
    "zh": "什么是区块链"
  }
}
```

`content.ts` modifica `loadBlogPost`/`loadBlogPosts` para ler slugs do indice. URL usa slug traduzido; filename permanece original.

### 5. Link Pattern

Padrao para referencias:
- **Links internos:** `[texto](/{locale}/blog/{slug})` ou usando `related:` frontmatter
- **Links externos:** footnote-style `[texto](url)` com URL completa
- **Secao de referencias:** ao final de cada post, secao "Referencias" listando fontes

## Consequencias

**Positivas:**
- Conteudo com qualidade consistente e verificavel
- Personas garantem multiplas perspectivas antes da publicacao
- URLs localizadas melhoram SEO internacional
- Links contextuais aumentam tempo na pagina e autoridade
- RAG evita retrabalho (decisoes reusadas)

**Negativas:**
- Aumento de tempo por post (estimado +40% sobre escrita pura)
- Necessidade de manter indice de slugs atualizado
- Dependencia de pesquisa web periodica para manter info atual

**Neutras:**
- ADR-025 (traducao hibrida) continua valido — slugs index complementa, nao substitui

## Implementacao

Ver plano detalhado em `.opencode/plans/2026-07-05-plano-remediacao-conteudo.md`

## Referencias

- `docs/superpowers/specs/2026-07-04-content-ux-search-design.md` — secao 4.7 Content Quality Standards
- `docs/guides/content-personas.md` — catalogo de 22 personas
- `docs/superpowers/plans/2026-07-04-plan-c-content-production.md` — Task 9 audit
- ADR-025 — traducao hibrida
