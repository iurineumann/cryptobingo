# ADR-039 — Landing Page API: Migração para Function App Standalone + Aiven

**Status:** Aceito (2026-07-03)
**Data:** 2026-07-03

---

## Problema

A landing page (`apps/landing-page`) precisava de endpoints serverless para:
- `/api/stats` — estatísticas do site
- `/api/subscribe` — newsletter
- `/api/ideas` / `/api/ideas/vote` / `/api/votes/confirm` — sistema de ideias + votação
- `/api/admin/login` / `/api/admin/confirm` / `/api/admin/newsletter` / `/api/admin/ideas` — admin

Originalmente deployada como **Azure Static Web Apps (Free)** com funções em `apps/landing-page/api/`. O plano Free não suporta API functions gerenciadas — retorna 500.

## Decisão

Migrar API para Azure Function App standalone no plano **Consumption** + banco PostgreSQL via **Aiven**.

### Stack

| Camada | Serviço | Custo |
|---|---|---|
| Frontend (SSG) | Azure Static Web Apps Free | Grátis |
| API (Node 22) | Azure Function App Consumption | Grátis (1M req/mês) |
| DNS + SSL | Cloudflare proxy (`landing-api.cryptobingo.bet`) | Grátis |
| PostgreSQL | Aiven (free tier) | Grátis |
| Email transacional | Azure Communication Services | PAYG |
| Storage | Azure Storage (via Function App) | Grátis |

### Arquitetura

```
Usuário → Cloudflare → SWA (frontend estático)
                            ├── landing-api.cryptobingo.bet (Function App)
                            └── Aiven PostgreSQL
```

Frontend chama API diretamente via `landing-api.cryptobingo.bet`, não via proxy SWA.

## Observações Técnicas

### ESM vs CommonJS no Functions v4

Azure Functions v4 com Node.js **não carrega módulos ES** (`import`/`export`). Runtime falha silenciosamente — `admin/functions` retorna lista vazia.

**Solução:** Compilar TypeScript com `module: "commonjs"` no tsconfig. `index.js` usa `require()` para importar módulos de função.

### pnpm symlinks corrompem zip deploy

pnpm hoist symlinks para `.pnpm/` store. Zip deploy via `az webapp deployment source config-zip` não segue symlinks — arquivos vazios no runtime.

**Solução:** Instalar production deps com `npm install` limpo em `/tmp/fa-prod`, compilar `.js`, zipar e deployar.

### SSL do Aiven PostgreSQL

`pg` com `sslmode=require` na connection string sobrescreve pool config `ssl: { rejectUnauthorized: false }`. Runtime lança `self-signed certificate in certificate chain`.

**Solução:** Remover `sslmode` da URL. Pool config `ssl: { rejectUnauthorized: false }` ativa SSL sem verificação de certificado.

## Domínio Customizado

- Domínio: `landing-api.cryptobingo.bet`
- DNS Cloudflare: CNAME proxied (orange cloud) → SSL automático
- TXT `asuid.landing-api.cryptobingo.bet` para validação de domínio do Azure
- Function App aceita requisições no custom domain via `az functionapp config hostname add`

## Comandos de Deploy

```bash
# 1. Compilar
cd apps/landing-page/api && npx tsc

# 2. Montar pacote em /tmp (npm install limpo, sem pnpm)
rm -rf /tmp/fa-prod && mkdir -p /tmp/fa-prod
cd /tmp/fa-prod
cat > package.json << 'PKGJSON'
{
  "name": "cryptobingo-landing-api",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@azure/functions": "^4.8.0",
    "@azure/communication-email": "^1.0.0",
    "pg": "^8.13.0"
  }
}
PKGJSON
npm install
mkdir -p _lib ideas votes admin
cp <api-dir>/host.json ./
cp <api-dir>/*.js ./
cp <api-dir>/_lib/*.js _lib/
cp <api-dir>/ideas/*.js ideas/
cp <api-dir>/votes/*.js votes/
cp <api-dir>/admin/*.js admin/

# 3. Deploy
zip -r /tmp/fa-prod.zip .
az webapp deployment source config-zip \
  --name cryptobingo-landing-api \
  --resource-group cryptobingo-testnet \
  --src /tmp/fa-prod.zip
```

## Env Vars da Function App

| Variável | Origem |
|---|---|
| `DATABASE_URL` | Aiven PostgreSQL |
| `ACS_CONNECTION_STRING` | Azure Communication Services |
| `ACS_FROM` | `nao-responda@cryptobingo.com.br` |
| `FRONTEND_URL` | SWA preview (dev) |
| `VITE_API_URL` | `https://landing-api.cryptobingo.bet/api` (build time) |

## Referências

- [Azure Functions Node.js v4 model](https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node)
- [Aiven PostgreSQL](https://aiven.io/postgresql)
- CLI docs em `CLAUDE.md`
