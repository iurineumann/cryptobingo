# R2 — Cross-Reference: i18n/SEO + Legal/Trust + Build/Perf (Jul 2026)
**Persona: QA Lead**

**Fontes:**
- A3 — i18n + SEO (`docs/superpowers/research/A3-i18n-seo.md`)
- A4 — Trust + Legal (`docs/superpowers/research/A4-trust-legal.md`)
- A5 — Build + Performance (`docs/superpowers/research/A5-build-perf.md`)

---

## 1. GAPS identificados por camada

### A3 (i18n+SEO) — Gaps

1. **Canonical tags ausentes** — docs não mencionam `<link rel="canonical">`. Multi-locale SEM canonical = risco de duplicate content penalty. Cada `/en/faq`, `/pt/faq`, `/zh/faq` precisa de self-referencing canonical.

2. **og:locale / og:locale:alternate** — Open Graph sem locale tagging. Facebook/LinkedIn podem mostrar locale errado. Precisa: `og:locale: pt_BR`, `og:locale:alternate: en_US`, etc.

3. **Estratégia de persistência de locale incompleta** — A3:284-288 menciona cookie/LocalStorage mas não detalha implementação (cookie expiry, migração entre locales, reset de preferência).

4. **404 páginas por locale** — visitar `/pt/nonexistent` não tem fallback i18n. A1 (rota `*`) deve renderizar 404 com locale correto.

5. **Performance do locale redirect** — `/` → Accept-Language redirect (A3:284-289) só funciona após hidratação JS. Crawlers veem apenas `/en/index.html`. Impacto SEO aceitável? Documento não avalia.

6. **Fluxo de tradução** — quem traduz legal content? Tradutor humano no TinaCMS vs dev commit locale JSON? Nenhum define boundary entre CMS content vs locale-file UI strings.

7. **SEO metadata ausente** — `og:image` por locale, `twitter:card`, `twitter:site` — nenhum mencionado.

8. **Structured data (JSON-LD)** — FAQPage schema (A3:111-113 lista FAQ chaves mas não schema markup). Organization, WebSite, BreadcrumbList schemas ausentes.

### A4 (Trust+Legal) — Gaps

9. **Cookie Policy sem conteúdo** — P3 (A4:251) citado como existente ("Já tem CookieConsent v3") mas sem outline de conteúdo. CookieConsent v3 requer cookie table: nome, domínio, duração, propósito.

10. **Trust signals** — selos de segurança (SSL, Norton, etc.), contadores (usuários, jogos, prêmios pagos) como trust signals na landing page — zero menção.

11. **Licença regulatória** — muitas jurisdições exigem número de licença + logo do regulador visível no site. A4 lista ToS tópicos mas não diz onde exibir licença no footer/header.

12. **Política de menores** — A4:66 menciona "zero tolerância" mas não recomenda página/aviso separado. LGPD Art. 14 exige verificação parental.

13. **Acessibilidade** — aviso de acessibilidade obrigatório em algumas jurisdições. Ausente.

14. **Recursos de ajuda integrados** — hotlines (GamCare, Jogadores Anônimos) devem aparecer como widget/chat no site, não só em policy page. A4:63 menciona links mas não implementação frontend.

### A5 (Build+Perf) — Gaps

15. **Impacto de 3× locales no build time** — prerender salta de N páginas para N × 3. Blog com 50 posts × 3 = 150 HTML. Nenhuma estimativa de tempo.

16. **CSP (Content-Security-Policy)** — `staticwebapp.config.json` (A5:60-94) não inclui security headers. Landing page multi-script (GTM, CookieConsent, CF Insights) precisa de CSP.

17. **Preconnect/preload para third-party** — GTM, CookieConsent CDN, Cloudflare Insights sem `dns-prefetch`/`preconnect`. Pode melhorar LCP/FCP.

18. **CDN purging estratégia** — conteúdo legal muda (lei nova, DPO troca). Como purgar somente `/pt/terms` sem afetar outras páginas? A5:323 recomenda `no-cache` no index.html mas não fala de purge granular.

19. **Locale JSON no bundle final** — A3:126-132 recomenda importação estática. Mas 6 páginas legais × 3 locales = ~15K linhas de JSON. Se for para locale files (contra recomendação A4), bundle explode. A5:264-269 (JS bundle audit) não considera esse risco.

20. **Differential serving** — `build.target: 'es2022'` (A5:21) exclui browsers antigos. Decisão documentada? Risco de suporte.

### Gaps transversais (nenhuma camada cobre)

21. **Pipeline de conteúdo legal: TinaCMS → locale → deploy** — quem escreve, revisa, aprova, traduz, deploya texto legal? Compliance officer? Advogado? Tradutor? CI/CD precisa de stage de approval?

22. **Testes multi-locale automatizados** — Ninguém propõe teste de: (a) todas as páginas existem em 3 locales, (b) hreflang tags são recíprocas, (c) strings legais não têm placeholder vazio.

23. **Self-exclusion flow frontend** — A4:59-60 lista self-exclusion 1-5 anos. Onde o jogador clica? Landing page? App? Precisa de componente React com i18n, identidade verificada. Nem A3 nem A5 tocam no assunto.

24. **Responsible Gaming tools UI** — deposit limits, session timers (A4:58) requerem UI de configuração. Landing page não tem área logada. É feature do frontend principal, não da landing page. Boundary não documentado.

---

## 2. Conflitos cross-camada

### Conflito 1: Mecanismo de hreflang — Helmet (A3) vs prerender (A5) vs prioridade
| | A3 (i18n+SEO) | A5 (Build+Perf) |
|---|---|---|
| Mecanismo | `<Helmet>` via `useLocation()` em `root.tsx` (A3:144-174) | Apenas lista tags HTML (A5:303-309) |
| Priorização | Core do plano, passo 4 de 11 (A3:347-357) | P2 — "Otimização" (A5:334) |
| Teste | Google Search Console hreflang report (A3:362) | Nenhum |

**Impacto:** Mesmo mecanismo proposto (Helmet em build time) — alinhamento técnico ok. Mas **priority mismatch**: A5 trata hreflang como P2 (otimização opcional), A3 trata como passo obrigatório. Sem consolidação, equipe pode pular hreflang por achar "P2".

### Conflito 2: Implementação de sitemap — script separado (A3) vs prerender() (A5)
| | A3 (i18n+SEO) | A5 (Build+Perf) |
|---|---|---|
| Abordagem | Script `scripts/generate-sitemap.mjs` pós-build (A3:236-241) | Dentro de `prerender()` no `react-router.config.ts` (A5:286-300) |
| Locales | Sim, com xhtml:link alternates (A3:208-231) | Não menciona (A5:289 lista paths sem locale) |
| Blog slugs | "inclui blog slugs dinâmicos" (A3:240) | `fs.readdirSync("content/blog")` (A5:291) |

**Impacto:** **Conflito direto de implementação.** A5 gera sitemap no build (mais simples, descobre paths automaticamente) mas **sem xhtml:link alternates**. A3 tem formato correto (xhtml:link) mas em script separado — risco de desalinhamento de URLs. Se implementar ambos, sobrescrevem o mesmo arquivo.

### Conflito 3: Páginas legais no bundle — estático (A3) vs TinaCMS (A4) vs bundle (A5)
- A3:126-132 recomenda **importação estática** de locale JSON (~100-200 keys para landing page)
- A4:253-255 recomenda criar páginas **via Content System (ADR-037)** ou páginas estáticas
- A5:264-269 aponta **317KB JS bundle como problema existente**

**Impacto:** Se conteúdo legal (6 páginas × 3 locales = milhares de linhas) for importado estaticamente como locale JSON (A3 pattern), bundle cresce 50-100KB+ — conflito direto com A5 que quer reduzir bundle. Se for TinaCMS content (A4), conteúdo fica em HTML estático separado — zero impacto no bundle, mas depende de submodule sync (A5:106-114 P0).

**Recomendação implícita:** Legal pages **não podem** usar locale files estáticos. **Forçar TinaCMS como mecanismo** para legal content. A3 deve ser corrigida para excluir legal pages de importação estática.

### Conflito 4: Priorização — 3 escalas incomparáveis
| Documento | P0 | P1 | P2 |
|---|---|---|---|
| A4 | ToS, Privacy, Risk Disclaimer (obrigação legal) | RG, AML, Dispute (regulatório) | PoF, Bug Bounty, Whitepaper (trust) |
| A5 | Submodules, pnpm cache (CI/CD quebrado) | Cache-Control, sitemap, JS bundle audit | og-image, font subset, hreflang, PR previews |
| A3 | (não explicita) | Passos 1-11 = tudo P1? | — |

**Impacto:** Sem tabela consolidada, legal team prioriza ToS (P0), dev team prioriza submodules (P0). Ambos certos, mas sequência de execução indefinida. **ToS não pode ir ao ar sem locale routing funcionando. Submodules não pode ser resolvido sem saber se legal content vem de submodule TinaCMS.**

### Conflito 5: Bug Bounty NFT — infra (A4) vs CI/CD (A5)
A4:259-263 afirma que infra NFT já existe (`nft_config`, `confignft`) e estima 3-5 dias. A5:106-114 fala de submodules e CI/CD mas não cobre deploy de schemas AtomicAssets, collection, templates.

**Impacto:** Bug Bounty NFT minting depende de pipeline que A5 não define: deploy de AtomicAssets schema, CI/CD para minting automático, worker handler. **Gap entre "já existe" (A4) e "não tem pipeline" (A5).**

### Conflito 6: Responsible Gaming — frontend UI vs landing page scope
A4:57-66 lista ferramentas RG obrigatórias (Lei 14.790/2023): deposit limits, session timers, self-exclusion. Landing page é SSG estática — **não tem área logada para implementar essas ferramentas.** O frontend (`apps/frontend/`) tem área logada mas está fora do escopo da landing page.

**Impacto:** Responsible Gaming tools **não podem ser implementadas na landing page**. É feature cross-project. Gap de escopo: ninguém documentou onde elas vão. Se ficarem só na landing page policy page (texto), sem UI funcional no app principal, compliance é insuficiente.

---

## 3. Riscos

| # | Risco | Severidade | Documentos afetados | Descrição |
|---|---|---|---|---|
| R1 | Legal content no bundle JS explode 317KB | **Critical** | A3:126-132, A5:264-269 | Se legal text for locale JSON import estático (A3 recommendation), bundle cresce 50-100KB+. A5 já considera 317KB problema. |
| R2 | Sitemap sem xhtml:link alternates | **High** | A3:208-231, A5:286-300 | Se implementar A5 (prerender) sem A3 (xhtml:link), Google não vê relação entre locale pages no sitemap. |
| R3 | Submodule TinaCMS sem conteúdo legal pronto | **High** | A4:253-255, A5:106-114 | A5 P0 (submodules) depende de conteúdo existir no submodule. Se content team não populou, build passa com vazio. |
| R4 | Self-exclusion sem UI funcional | **High** | A4:59-60 | Landing page SSG não tem como implementar self-exclusion flow. App frontend está fora do escopo. Quem faz? |
| R5 | Cookie Policy sem cookie table | **Medium** | A4:251 | "P3 — Cookie Policy" sem conteúdo mínimo. Sem tabela de cookies pode não comprir LGPD Art. 9/GDPR Art. 13(2). |
| R6 | CSP ausente para multi-script landing page | **Medium** | A5:60-94 | Landing page carrega GTM + CookieConsent + CF Insights sem CSP. XSS ou injeção de script por CDN comprometido. |
| R7 | Build time não estimado com 3× locales | **Medium** | A5 | Se build atual leva ~30s, com 3× + blog população pode ir a 2-3 min. CI timeout? |
| R8 | Locale redirect tracking duplicado no GTM | **Medium** | A3:284-289, A5:312-316 | Visitante vai a `/`, redirect JS para `/pt/`, GTM dispara page_view duas vezes. Métricas infladas. |
| R9 | Hreflang tags quebradas por falta de reciprocidade | **Low** | A3:182-183 | Se `/pt/blog/post` existe mas hreflang não inclui `/en/blog/post` e `/zh/blog/post`, Google ignora todo o set. |
| R10 | Font Geist sem fallback para zh-CN | **Low** | A5:277-280, A3:68-71 | Landing page em zh-CN sem fonte CJK = renderização quebrada. A5 subset trimming só latim. |
| R11 | 404 páginas sem locale detection | **Low** | A3 gap | Visitante `/pt/nonexistent` vê 404 genérico sem i18n. Experiência ruim. |

---

## 4. Priorização revisada (consolidada A3+A4+A5)

Unificando prioridades dos 3 documentos. Toda página legal que vive em TinaCMS depende de submodules funcionando (A5 P0) primeiro.

| Prioridade | Task | Dono | Depende de | Nota |
|---|---|---|---|---|
| **P0** | Submodules checkout no CI/CD (A5:110-114) | DevOps | — | Sem isso, TinaCMS content não deploya |
| **P0** | Decisão: legal content em TinaCMS (não locale JSON) | QA Lead + Eng | — | Define se A3 recommendation de static import é válida para legal ou só UI |
| **P0** | ToS + Privacy + Risk Disclaimer pages (A4:242-244) | Compliance + Content | P0 submodules | Substituir `href="#"` no Footer |
| **P0** | staticwebapp.config.json com Cache-Control + CSP (A5:60-94) | DevOps | — | Segurança + perf |
| **P1** | Locale routing + prerender (A3:296-329) | Frontend | — | Base para todo o resto |
| **P1** | Responsible Gaming policy page (A4:245) | Compliance | P0 legal pages | Lei 14.790/2023 |
| **P1** | JS bundle audit: tree-shake tinacms/lucide-react (A5:264-269) | Frontend | — | 317KB precisa cair |
| **P1** | Hreflang tags no Helmet (A3:138-174) | Frontend | P1 locale routing | Prioridade correta: P1, não P2 (corrigir A5:334) |
| **P1** | Sitemap com xhtml:link alternates (A3:208-231 + A5:286-300) | Frontend | P1 locale routing | **Resolver conflito A3 vs A5:** usar gerador dentro do prerender() adaptado |
| **P1** | AML Policy + Dispute Resolution (A4:246) | Compliance | P0 legal pages | |
| **P1** | Canonical tags (gap A3) | Frontend | P1 locale routing | Adicionar ao mesmo Helmet de hreflang |
| **P2** | Proof of Fairness page (A4:248) | Tech Writer | P1 locale routing | Conteúdo já existe nos ADRs |
| **P2** | Bug Bounty page + NFT pipeline (A4:249) | Eng + Sec | P2 | Pipeline NFT precisa de CI/CD |
| **P2** | Whitepaper (A4:250) | Tech Writer | — | Compilar docs existentes |
| **P2** | og-image → WebP/AVIF (A5:332) | Frontend | — | Melhoria marginal |
| **P2** | Font subset trimming (A5:333) | Frontend | — | + fallback zh-CN |
| **P2** | Cookie Policy content + cookie table (A4:251) | Compliance | P0 legal pages | |
| **P3** | Structured data JSON-LD (gap A3) | Frontend | — | FAQPage, Organization, BreadcrumbList |
| **P3** | Self-exclusion flow (app, não landing page) | App team | Fora do escopo landing page | Documentar boundary |
| **P3** | Deposit limits / session timers UI | App team | Fora do escopo landing page | Documentar boundary |

---

## 5. Recomendações para o plano

### 5.1 Correções obrigatórias no plano

1. **Legal content → TinaCMS, não locale files.** A3:126-132 recomenda importação estática de locale JSON — isso vale para UI strings (nav, hero, features). Conteúdo legal (ToS, Privacy, etc.) deve ser TinaCMS com locale variant. Zero impacto no bundle JS (A5:264-269).

2. **Resolver conflito sitemap A3 vs A5.** Adotar A5 (dentro de `prerender()`) por ser mais confiável, mas **adaptar para gerar xhtml:link alternates**. Script separado (A3:236-241) gera risco de desalinhamento. Criar helper `generateSitemapWithLocales(paths, locales)` chamado dentro do `prerender`.

3. **Adicionar canonical tags ao plano.** Mesmo Helmet component que gera hreflang (A3:144-174) deve gerar `rel="canonical"` self-referencing. Adicionar ao step 8 do plano A3.

4. **Adicionar CSP ao staticwebapp.config.json.** A5:60-94 não inclui. Configurar Content-Security-Policy permitindo GTM + CookieConsent + CF Insights + GA4.

### 5.2 Mudanças na ordem de execução

5. **Mover hreflang de P2 (A5) para P1** — alinhado com A3. Sem hreflang, Google trata locale pages como duplicatas.

6. **Separar "legal content structure" em task de discovery** antes de Fase 2 (TinaCMS) — decisão: TinaCMS vs locale files define arquitetura de diretórios, rotas e plano de build.

### 5.3 Novos itens a adicionar

7. **Fase 0.5 — Content pipeline legal:**
   - Decidir dono (compliance officer / legal counsel)
   - Setup TinaCMS collections para legal pages (terms, privacy, risk, rg, aml, dispute)
   - Setup locale variant workflow (tradutor humano revisa por locale)
   - Definir submodule content structure: `content/terms/en/`, `content/terms/pt/`, etc.

8. **Testes multi-locale obrigatórios (fase 5):**
   - Cada página de cada locale retorna 200
   - Hreflang tags recíprocas (validação automática)
   - Strings legais sem placeholder vazio
   - Sitemap válido (XML schema + xhtml:link)

9. **Documentar boundary landing page vs app frontend:**
   - Responsible Gaming tools (deposit limits, session timers) → app frontend
   - Self-exclusion flow → app frontend + on-chain action
   - Landing page → only RG policy page (text), not tools

### 5.4 Observações finais

- **Nenhum conflito técnico irreconciliável** — todos são de priorização, arquitetura de conteúdo, ou escopo.
- **Risco R1 (bundle explode)** é o mais urgente: decisão de arquitetura tem que ser tomada antes de escrever uma linha de código das fases 0-5.
- **R4 (self-exclusion sem UI)** é o de maior consequência legal, mas está fora do escopo landing page — precisa ser escalation para o time do app.
