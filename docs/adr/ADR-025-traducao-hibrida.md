# ADR-025 — Serviço de Tradução Automática Híbrido

**Status:** Aceito  
**Data:** 2026-06-11  
**Issue:** [#29](https://github.com/iurineumann/cryptobingo/issues/29)  
**Depende de:** ADR-024 (News/Promoções)  
**Autores:** Iuri Neumann, Claude Sonnet 4.6

---

## Contexto

O `newsController` (ADR-024) persiste publicações com `locale_overrides` opcionais para
en-US e zh-CN. Sem tradução automática, o admin precisa preencher manualmente as três
versões — atrito alto que reduz a chance de conteúdo multilíngue ser publicado.

Precisamos de tradução automática que seja:
- Gratuita (sem custo operacional no MVP)
- Adaptável ao ambiente (dev vs. produção sem infra extra)
- Resiliente (nunca bloqueia a publicação por falha de tradução)
- Eficiente (cache evita retraduções e consumo desnecessário de quota)

---

## Decisão

### Arquitetura: Provider Chain com Roteamento por Par Linguístico

```
TranslationService.translate(text, from, to)
        │
        ├── router seleciona providers ordenados por: env + par linguístico
        │
        ├── tenta provider[0] → sucesso → cacheia Redis 24h → retorna
        ├── falha → tenta provider[1] → ...
        └── todos falharam → retorna null (publicação salva sem override)
```

### Providers e seus papéis

| Provider | Papel | Quando ativo |
|---|---|---|
| **LibreTranslate** | Dev/self-hosted — ilimitado, zero quota | `LIBRE_TRANSLATE_URL` configurado (dev) |
| **DeepL Free** | Produção, pt↔en — melhor qualidade nesse par | `DEEPL_API_KEY` presente |
| **Google Cloud** | Produção, qualquer→zh-CN — melhor cobertura | `GOOGLE_TRANSLATE_API_KEY` presente |
| **MyMemory** | Fallback universal — sem chave, sempre disponível | sempre (último recurso) |

### Roteamento por par linguístico

```
pt → en-US:  DeepL Free (1°) → Google (2°) → MyMemory
pt → zh-CN:  Google (1°)     → DeepL (2°)  → MyMemory
en → zh-CN:  Google (1°)     → DeepL (2°)  → MyMemory
* → *:       DeepL (1°)      → Google (2°) → MyMemory

dev com LibreTranslate: LibreTranslate sempre antes de qualquer provider externo
```

### Integração no newsController

- `POST /news` sem `locale_overrides` → traduz `title` e `content` de `pt` para `en-US` e `zh-CN`
- Falha total de tradução: salva normalmente sem overrides (não bloqueia)
- Falha parcial (ex: zh-CN falhou): salva override apenas do que foi traduzido
- `locale_overrides` explícito no payload: bypass completo da tradução (admin override)

### Cache

- Chave: `translation:{SHA-256(text)}:{from}:{to}` — hash evita chaves enormes
- TTL: 86400s (24h) — conteúdo editorial não muda com frequência
- Backend: Redis já existente no api-gateway
- Fail-open: falha no Redis não bloqueia a tradução

### Implementação: REST puro (sem SDK)

Todos os providers usam `fetch` nativo (Node 22) contra a API REST de cada serviço.
Zero dependências adicionais.

#### Mapeamento de códigos de idioma por provider

| Locale interno | LibreTranslate | DeepL (source) | DeepL (target) | Google | MyMemory |
|---|---|---|---|---|---|
| `pt` | `pt` | `PT` | `PT-BR` | `pt` | `pt-BR` |
| `en-US` | `en` | `EN` | `EN-US` | `en` | `en-US` |
| `zh-CN` | `zh` | `ZH` | `ZH-HANS` | `zh-CN` | `zh-CN` |

---

## Alternativas consideradas

| Alternativa | Decisão |
|---|---|
| SDK `deepl-node` + `@google-cloud/translate` | Rejeitado — dependências pesadas desnecessárias; REST cobre o mesmo com menos overhead |
| Detecção automática de idioma de origem | Rejeitado — admin publica sempre em pt-BR (idioma da plataforma); adiciona latência e complexidade sem ganho real |
| Tradução síncrona (bloquear resposta) | Rejeitado — latência de rede afeta UX do admin; tradução em background pós-save seria alternativa futura |
| Fila assíncrona (RabbitMQ) | Pós-MVP — para volume alto; no MVP o volume de postagens admin é baixo |

---

## Consequências

### Positivo
- Zero custo no MVP: MyMemory sempre disponível; DeepL/Google só consomem quota em produção
- Dev: LibreTranslate ilimitado, sem gastar quota dos providers externos
- Publicação nunca bloqueada: tradução é best-effort
- Admin pode sobrescrever qualquer tradução via `PATCH /news/:id`

### Negativo / Mitigações
- Qualidade variável: se DeepL/Google estiverem indisponíveis, MyMemory pode retornar qualidade menor — mitigado pelo fallback chain e pela possibilidade de o admin corrigir
- Cache em Redis: se o mesmo texto for republicado após 24h, pode usar tradução levemente desatualizada — aceitável para conteúdo editorial

---

## Variáveis de ambiente

```bash
# LibreTranslate (dev / self-hosted)
LIBRE_TRANSLATE_URL=http://libretranslate:5000   # opcional; ativa o provider

# DeepL Free (produção)
DEEPL_API_KEY=                                    # opcional; ativa o provider

# Google Cloud Translation (produção)
GOOGLE_TRANSLATE_API_KEY=                         # opcional; ativa o provider

# Cache TTL (default: 86400s = 24h)
TRANSLATION_CACHE_TTL=86400
```

---

## Referências

- ADR-024: Rankings & Conteúdo (newsController, NewsItem.locale_overrides)
- [Issue #29](https://github.com/iurineumann/cryptobingo/issues/29)
