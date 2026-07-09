# A2 — TinaCMS + Content Research (Jul 2026)

**Persona: Content Engineer**

## Versões atuais no projeto

| Pacote | Versão |
|--------|--------|
| `tinacms` | `^3.9.4` |
| `@tinacms/cli` | `^2.5.2` |
| React | `^19.2.7` |
| React Router | `^7.18.1` |
| gray-matter | `^4.0.3` |

Framework: React Router v7 (SSG via `react-router build`). Vite 8, TypeScript 6, Tailwind 4.

Content storage: **git submodule** → `apps/landing-page/content/` aponta para `github.com/iurineumann/cryptobingo-tina.git`. TinaCloud conectado.

Coleções atuais (só PT, sem i18n): `page` (mdx), `blog` (mdx), `faq` (md), `settings` (json).

## 1. TinaCMS i18n — estratégias disponíveis

A documentação oficial do TinaCMS (jul 2026) define **duas estratégias**:

### A) Directory-Based Localization (recomendada)

Locale como subdiretório dentro da collection. Ex.:

```
content/blog/
  en/hello-world.md
  pt/hello-world.md
  zh/hello-world.md
```

**Schema:** uma collection única por tipo (`blog` aponta para `content/blog`). A seleção de locale acontece via `relativePath` na query.

```ts
// GraphQL query: relativePath = `${locale}/${filename}.mdx`
```

**Prós:**
- Body MDX/MD separado por locale — conteúdo rico independente
- Editor vê uma árvore de documentos: blog > en > hello-world, blog > pt > hello-world
- Duplicate document + renomear = criar nova versão em outro locale
- Scale linear — cada locale é só mais arquivos no FS
- Audit trail claro (git diff por arquivo)

**Contras:**
- N documentos por conteúdo = N arquivos (ex: 25 blog posts × 3 locales = 75 arquivos)
- Navegação no admin é por pasta — editor precisa saber qual locale está editando
- Sem locale switcher nativo no admin (editor troca manualmente de pasta)

### B) Field-Based Localization

Cada campo multilíngue contém objeto aninhado:

```yaml
# content/blog/hello-world.md
title:
  en: "Hello"
  pt: "Olá"
  zh: "你好"
```

**Schema:** campos do tipo `object` com subcampos `en`, `pt`, `zh`.

```ts
{
  type: 'object',
  name: 'title',
  fields: [
    { type: 'string', name: 'en', label: 'English' },
    { type: 'string', name: 'pt', label: 'Português' },
    { type: 'string', name: 'zh', label: '中文' },
  ]
}
```

**Prós:**
- Um arquivo contém todos os locales
- Ideal para settings/metadata curtas (hero title, SEO description)
- Editor vê todos os locales lado a lado no mesmo formulário

**Contras:**
- Body rich-text/MDX não escala bem — um único campo `body` com 3 locales objeto = documento enorme
- Sem separação de conteúdo — git diff mistura locales
- Editor precisa rolar/formulário fica longo
- Quebra lógica de SSG se o loader não souber filtrar por locale
- **Recomendação oficial:** "If you are using markdown/mdx content, prefer directory-based"

### C) Abordagem Híbrida (recomendada para CryptoBingo)

**Collections principais (page, blog, faq):** Directory-Based — body MDX/MD separado por locale.

**Settings:** Field-Based — hero, features, social são strings curtas, um único JSON com objetos locale é mais prático.

| Coleção | Estratégia | Motivo |
|---------|-----------|--------|
| page | Directory-Based | Body MDX rico, SEO por locale |
| blog | Directory-Based | Body MDX rico, imagens por locale |
| faq | Directory-Based | Answer rich-text por locale |
| settings | Field-Based | Strings curtas, um arquivo só |
| tutorial | Directory-Based | Body MDX rico (nova coleção) |

## 2. 13 collections — viabilidade e performance

### Análise

A Abordagem A original (3 coleções por locale) propunha **13 coleções**: page_pt, page_en, page_zh, blog_pt, blog_en, blog_zh, faq_pt, faq_en, faq_zh, tutorial_pt, tutorial_en, tutorial_zh, + settings_pt, settings_en, settings_zh.

Isso NÃO é necessário. TinaCMS recomenda **uma collection por tipo de conteúdo**, com locale como subdiretório. Não há ganho em ter 3 coleções separadas — só complexidade.

**Evidências:**
- TinaCMS é usado por Smashing Magazine (milhares de artigos) com dezenas de coleções
- Documentação oficial do TinaCMS sobre i18n usa **single collection** para directory-based
- Repositório público do TinaCMS (13.3k stars) não relata limite de coleções
- Performance depende de número total de documentos e complexidade do schema, não de quantidade de coleções
- TinaCloud Content API indexa por branch, não por coleção

**Risco baixo com 7 coleções:**

```
page      → content/pages/{en,pt,zh}/     mdx
blog      → content/blog/{en,pt,zh}/      mdx
faq       → content/faq/{en,pt,zh}/       md
tutorial  → content/tutorial/{en,pt,zh}/  mdx
settings  → content/settings/             json (field-based i18n)
```

Total: 5 collections, não 13. Settings field-based não precisa de subdiretório.

**Se tutorial for adicionado depois:** 6 collections. Ainda seguro.

Se no futuro precisar de locale switcher no admin, Tina planeja built-in (roadmap v4), mas hoje a navegação por subdiretório é suficiente.

**Conclusão:** Abordagem original de 13 coleções é over-engineering. **5-6 coleções com directory-based** é o padrão TinaCMS.

## 3. MDX rendering patterns

### TinaMarkdown (reactivo, visual editing)

TinaCMS fornece `<TinaMarkdown>` de `tinacms/dist/rich-text`. Aceita dados AST (não string MDX):

```tsx
import { TinaMarkdown } from 'tinacms/dist/rich-text';

function BlogPost({ data }) {
  return <TinaMarkdown content={data.body} />;
}
```

**Custom components** via prop `components`:

```tsx
const components = {
  NewsletterSignup: (props) => (
    <form>
      <TinaMarkdown content={props.children} />
      <button>{props.buttonText}</button>
    </form>
  ),
};
<TinaMarkdown content={body} components={components} />
```

No schema, o component MDX é registrado como `template` no campo `rich-text`:

```ts
{
  type: 'rich-text',
  name: 'body',
  isBody: true,
  templates: [{
    name: 'NewsletterSignup',
    label: 'Newsletter Sign Up',
    fields: [
      { name: 'children', type: 'rich-text', label: 'CTA' },
      { name: 'buttonText', type: 'string', label: 'Button Text' },
    ],
  }],
}
```

### Renderização SSG (React Router v7)

A landing page usa SSG (`react-router build`), não SSR. O `lib/content.ts` atual usa `gray-matter` para parsear arquivos MDX/MD.

**Caminhos possíveis:**

1. **Manter gray-matter + MDX string** (mais simples, sem visual editing): Parseia frontmatter, body como string, renderiza com `react-markdown` ou similar. Sem TinaMarkdown.

2. **Usar Tina GraphQL em build time:** Tina gera client GraphQL. Query em `getStaticProps` → dados AST → `TinaMarkdown`. Permite visual editing. Requer `tinacms build` antes do SSG.

3. **Híbrido:** gray-matter para SSG (build), Tina GraphQL para preview/visual editing em dev. Mais complexo mas flexível.

**Recomendação inicial:** Manter gray-matter para SSG (já implementado, funcional). Adicionar TinaMarkdown + visual editing posteriormente como melhoria.

### CVE-2026-55661

XSS via rich-text (slatejson) — URLs `javascript:` e `data:text/html` não sanitizadas. **Corrigido** em `@tinacms/mdx@2.1.7` e `tinacms@3.9.3`. Projeto está em `tinacms@^3.9.4` → **já patched**.

## 4. Git submodule + TinaCloud workflow

### Setup atual

`.gitmodules`:
```
[submodule "apps/landing-page/content"]
  path = apps/landing-page/content
  url = https://github.com/iurineumann/cryptobingo-tina.git
```

### TinaCloud + Separate Content Repo

Desde junho 2026, TinaCloud suporta **Separate Content Repos** nativamente:
- TinaCloud project aponta para **dois repositórios**: generator (código + schema) + content (arquivos .md/.mdx)
- `tina/config.ts` adiciona `localContentPath: '../cryptobingo-tina'` para dev local
- TinaCloud indexa o content repo automaticamente
- Editor cria branches/PRs no content repo via Tina UI
- Deploy build usa o content repo indexado

**Problemas conhecidos** (verificados em docs e relatos de comunidade):

1. **Submódulo detached HEAD:** Ao clonar o projeto, o submódulo fica em detached HEAD. `git submodule update --init --recursive` é obrigatório. Esquecer isso quebra o CI.

2. **Stale `tina/` folder no content repo:** Se migrou do padrão antigo (dois projetos TinaCloud), pode haver `tina/__generated__/` e `tina/tina-lock.json` no content repo. Seguro deletar.

3. **CI precisa de clone recursivo:** `actions/checkout@v4` com `submodules: 'recursive'`.

4. **Build webhook de content → website:** TinaCloud webhooks (recomendado) ou GitHub Actions com PAT para triggerar build do site principal quando content repo é atualizado.

5. **`localContentPath` conflito se o submódulo não for clonado:** `tinacms dev` quebra. Usar `localContentPath` só em dev/CI, TinaCloud production usa indexação independente.

6. **Atualizar o pointer do submódulo:** Muda conteúdo no content repo → commit no content repo → atualizar o submódulo no projeto principal → commit. Um commit extra, mas workflow padrão.

### Workflow recomendado para CryptoBingo

```
# Dev local
git clone --recurse-submodules <main-repo>
cd apps/landing-page
pnpm dev   # Tina dev server lê content do submódulo via localContentPath

# Editor via TinaCloud
Editor → app.tina.io → edita conteúdo → commit no content repo → webhook triggera build do site

# CI/CD
actions/checkout@v4 (submodules: recursive)
pnpm install && pnpm build  # gera SSG com conteúdo do submódulo
```

## 5. Recomendações específicas para CryptoBingo

### Abordagem confirmada: Directory-Based Híbrida

**Rejeitar** abordagem de 13 coleções (3 por tipo × locale). **Adotar** abordagem de 5-6 coleções com directory-based.

### Schema de coleções

```ts
// tina/config.ts — coleções com i18n

collections: [
  {
    name: 'page',
    label: 'Pages',
    path: 'content/pages',  // subdiretórios en/pt/zh
    format: 'mdx',
    fields: [
      { type: 'string', name: 'title', label: 'Title', isTitle: true, required: true },
      { type: 'string', name: 'description', label: 'Description (SEO)', ui: { component: 'textarea' } },
      { type: 'rich-text', name: 'body', label: 'Content', isBody: true },
    ],
  },
  {
    name: 'blog',
    label: 'Blog',
    path: 'content/blog',  // subdiretórios en/pt/zh
    format: 'mdx',
    fields: [
      { type: 'string', name: 'title', label: 'Title', isTitle: true },
      { type: 'string', name: 'description', label: 'Summary', ui: { component: 'textarea' } },
      { type: 'datetime', name: 'date', label: 'Date' },
      { type: 'image', name: 'cover', label: 'Cover' },
      { type: 'string', name: 'author', label: 'Author' },
      { type: 'rich-text', name: 'body', label: 'Content', isBody: true },
      { type: 'string', name: 'tags', label: 'Tags', list: true },
    ],
  },
  {
    name: 'faq',
    label: 'FAQ',
    path: 'content/faq',  // subdiretórios en/pt/zh
    format: 'md',
    fields: [
      { type: 'string', name: 'question', label: 'Question', isTitle: true },
      { type: 'rich-text', name: 'answer', label: 'Answer', isBody: true },
      { type: 'number', name: 'order', label: 'Order' },
      { type: 'string', name: 'category', label: 'Category', options: ['general', 'gameplay', 'tech', 'economy'] },
    ],
  },
  {
    name: 'tutorial',
    label: 'Tutorials',
    path: 'content/tutorial',  // subdiretórios en/pt/zh
    format: 'mdx',
    fields: [
      { type: 'string', name: 'title', label: 'Title', isTitle: true },
      { type: 'string', name: 'description', label: 'Description', ui: { component: 'textarea' } },
      { type: 'rich-text', name: 'body', label: 'Content', isBody: true },
    ],
  },
  // Settings field-based
  {
    name: 'settings',
    label: 'Settings',
    path: 'content/settings',
    format: 'json',
    fields: [
      { type: 'object', name: 'hero', label: 'Hero', fields: [
        { type: 'object', name: 'title', fields: [
          { type: 'string', name: 'en', label: 'English' },
          { type: 'string', name: 'pt', label: 'Português' },
          { type: 'string', name: 'zh', label: '中文' },
        ]},
        { type: 'object', name: 'subtitle', fields: [
          { type: 'string', name: 'en', label: 'English', ui: { component: 'textarea' } },
          { type: 'string', name: 'pt', label: 'Português', ui: { component: 'textarea' } },
          { type: 'string', name: 'zh', label: '中文', ui: { component: 'textarea' } },
        ]},
        { type: 'object', name: 'cta_text', fields: [
          { type: 'string', name: 'en', label: 'English' },
          { type: 'string', name: 'pt', label: 'Português' },
          { type: 'string', name: 'zh', label: '中文' },
        ]},
        { type: 'string', name: 'cta_link', label: 'CTA Link' },
      ]},
      // features com list de objetos i18n
      { type: 'object', name: 'features', label: 'Features', list: true, fields: [
        { type: 'object', name: 'title', fields: [
          { type: 'string', name: 'en' }, { type: 'string', name: 'pt' }, { type: 'string', name: 'zh' },
        ]},
        { type: 'object', name: 'description', fields: [
          { type: 'string', name: 'en', ui: { component: 'textarea' } },
          { type: 'string', name: 'pt', ui: { component: 'textarea' } },
          { type: 'string', name: 'zh', ui: { component: 'textarea' } },
        ]},
        { type: 'string', name: 'icon' },
      ]},
    ],
  },
]
```

### Estrutura de diretórios

```
content/
  pages/
    en/index.mdx
    en/privacy.mdx
    pt/index.mdx
    pt/privacidade.mdx
    zh/index.mdx
  blog/
    en/rng-explained.mdx
    en/testnet-launch.mdx
    pt/rng-explicado.mdx
    pt/testnet-lancamento.mdx
    zh/rng-explained.mdx
  faq/
    en/what-is-cryptobingo.md
    en/how-to-buy-tickets.md
    pt/o-que-e-cryptobingo.md
    pt/como-comprar-cartelas.md
    zh/what-is-cryptobingo.md
  tutorial/
    en/how-to-play.md
    pt/como-jogar.md
    zh/how-to-play.md
  settings/
    home.json   # field-based i18n
```

### Content loaders

Manter `lib/content.ts` com `gray-matter` + `fs` para SSG (sem dependência de Tina GraphQL em build). Adicionar parâmetro `locale`:

```ts
export function loadFAQItems(locale: string = 'pt'): FAQItem[] {
  const faqDir = path.join(contentDir, 'faq', locale);
  // ...
}
```

### Frontmatter + route

Slug único por post, independente de locale. Ex.: `blog/en/rng-explained.mdx` e `blog/pt/rng-explicado.mdx` — mesmo tema, slugs diferentes.

Roteamento no React Router v7 SSG: `/:lang?/blog/:slug` ou `/blog/:slug` + locale detection.

### Security: XSS

TinaCMS `^3.9.4` já inclui patch para CVE-2026-55661. Verificar que `@tinacms/mdx` está em `^2.1.7+`. Se for usar `<TinaMarkdown>` com conteúdo não-santizado, garantir versão mínima.

### Next steps

1. Migrar estrutura de diretórios (flat → locale subdirs) no content repo
2. Atualizar `tina/config.ts` para manter collections únicas com path existente (não precisa mudar — locale já será subdiretório dentro do mesmo path)
3. Atualizar `lib/content.ts` — loaders aceitarem locale param
4. Criar `lib/i18n.ts` — hook/helper de locale detection (URL, cookie, browser)
5. Settings: migrar `home.json` para field-based i18n
6. Testar TinaCloud visual editing com locale subdirs
7. Documentar workflow de tradução para editores

## 6. Referências

- [TinaCMS i18n Guide (directory vs field-based)](https://tina.io/docs/guides/internationalization)
- [TinaCMS NextJS i18n Guide](https://tina.io/docs/guides/nextjs-internationalization)
- [TinaCMS Separate Content Repo Guide](https://tina.io/docs/guides/separate-content-repo)
- [TinaMD Render MDX Guide](https://tina.io/docs/reference/types/rendering-markdown)
- [TinaCMS Collections Reference](https://tina.io/docs/reference/collections)
- [TinaCMS Collections v3.9.4 | npm](https://www.npmjs.com/package/tinacms)
- [CVE-2026-55661 — XSS rich-text](https://advisories.gitlab.com/npm/@tinacms/mdx/CVE-2026-55661/)
- [TinaCMS Review 2026 — Lucky Media](https://www.luckymedia.dev/insights/tina-cms)
- [react-tinacms-i18n (plugin legado)](https://github.com/tinalabs/react-tinacms-i18n)
- [TinaCMS GitHub](https://github.com/tinacms/tinacms)
- [TinaCMS Blog: Separate Content Repos (jun 2026)](https://tina.io/blog)
