# ADR-035 — Infraestrutura Azure (Free Tier) + CD Pipeline para Testnet

**Status:** Implementado
**Data:** 2026-06-27

---

## Problema

Testnet anterior rodava em vcluster.cloud (K8s) com custo fixo e operação manual.
Migrar para Azure free tier elimina custo recorrente, mas troca K8s por serviços
gerenciados (Container Apps, Cosmos DB, PostgreSQL, Static Web Apps).

Build e push de imagens para GHCR está automatizado (`.github/workflows/build-push.yml`),
mas deploy era manual (kubectl + kustomize). Necessário adaptar para Azure CLI.

## Decisão

Substituir vcluster.cloud por Azure free tier. Código idêntico entre testnet e
produção (mesmas branches, zero divergência). GHCR mantido como registry.

### Stack Azure (testnet)

| Componente | Serviço Azure | Free tier | Custo |
|---|---|---|---|
| API Gateway | Container App (consumption) | 180K vCPU·s/mês, 2M req | $0 |
| Worker | Container App (consumption) | mesmo pool | $0 |
| Redis | Sidecar no Container App (redis:7-alpine) | incluso no container | $0 |
| RabbitMQ | CloudAMQP (Loyal Lemur) | 1M msg/mês, 100 filas | $0 |
| MongoDB | Cosmos DB MongoDB v7.0 | 1000 RU/s + 25GB | $0 vitalício |
| PostgreSQL | Flexible Server B1ms | 32GB, 750h/mês (12 meses) | $0 → ~$7/mês após |
| Frontend | Static Web App | 100GB bandwidth, SSL | $0 |
| Swap-UI | Static Web App | mesmo pool | $0 |
| Registry | GHCR (ghcr.io) | 500MB imagens públicas | $0 |
| CI/CD | GitHub Actions | 2000 min/mês | $0 |

### WAX testnet

| Conta | Chave Pública (active) |
|---|---|
| `bingogamectr` | `EOS5BZNXp...` (5K74egB8...) |
| `bingogamesvc` | `EOS7caD95...` (5JK7qyyr...) |
| `bingogametkn` | `EOS7kNHGW...` (5K1cqVcS...) |
| `bingogameswp` | `EOS5GJKA2...` (5KeLvfn2...) |

Contrato `bingogamectr` + permissão `admin` (ADR-026) configuradas:
- `bingogamectr@active` ↔ actions frias (setconfig, settreasury, sweepggr)
- `bingogamectr@admin` ↔ actions operacionais (creategame, addpattern, etc.)
  threshold 1: `bingogamectr@active` OU `bingogamesvc@active`
- `bingogamesvc@active` ↔ FSM do worker (fundgame, lockgame, startdraw, claimwin, etc.)

## Arquitetura

```
GitHub → push develop
        ↓
  build-push.yml
        ↓
  GHCR (4 imagens)
        ↓
  az containerapp update (api-gateway, worker)
  swa deploy (frontend, swap-ui)
        ↓
  Health check /api/v1/health
```

### Fluxo de dados

```
Usuário → Frontend (Static Web App)
           ↓ HTTPS
         API Gateway (Container App) → Cosmos DB (edge/gamification)
           ↓ HTTPS                       → PostgreSQL (ledger/compliance)
         Worker (Container App) → Cosmos DB (chat)
           ↓ RPC                    → WAX testnet (antelope)
                                    → CloudAMQP (RabbitMQ)
                                    → Redis (inverted index)
```

### Container Apps

Ambos em consumption plan (scale-to-zero, 0.25 vCPU / 0.5Gi):

- **api-gateway**: 1 container + Redis sidecar. Ingress externo porta 8080.
- **worker-game-loop**: 1 container + Redis sidecar. Ingress interno.

Redis sidecar: `redis:7-alpine`, sem persistência, `--save "" --appendonly no`.

### Container Registry

GHCR (`ghcr.io`). Autenticação via PAT do `gh` (token com `read:packages` + `repo`).
Azure Container Apps referenciam o secret `ghcrio-iurineumann` para pull.

### Cronologia de provisionamento (ordem crítica)

1. Resource Group + Log Analytics
2. Cosmos DB MongoDB (v7.0, session consistency)
3. PostgreSQL Flexible Server (B1ms, 32GB)
4. Container Apps Environment (consumption)
5. Container Apps (api-gateway + worker + Redis sidecar)
6. CloudAMQP instance (RabbitMQ URL)
7. Static Web Apps (frontend, swap-ui)
8. WAX testnet contas + deploy contrato + permissões

## Pipeline de CD

### Jobs

```yaml
jobs:
  resolve-env:  # (existente) mapeia branch → vars
  build:        # (existente) docker build + push GHCR
  deploy-testnet:
    needs: build
    if: github.ref_name == 'develop' && github.event_name == 'push'
    steps:
      - az login (service principal)
      - az containerapp update api-gateway --image testnet-{sha}
      - az containerapp update worker-game-loop --image testnet-{sha}
      - pnpm build frontend + swa deploy
      - pnpm build swap-ui + swa deploy
  smoke-test:
    needs: deploy-testnet
    steps:
      - curl health/live + health/ready
      - k6 smoke.js
```

### GitHub Secrets necessários

| Secret | Valor |
|---|---|
| `AZURE_CLIENT_ID` | Service principal appId |
| `AZURE_TENANT_ID` | Tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Subscription ID |
| `AZURE_CLIENT_SECRET` | Service principal password |
| `SWA_DEPLOY_TOKEN_FRONTEND` | Static Web Apps deploy token |
| `SWA_DEPLOY_TOKEN_SWAP` | Static Web Apps deploy token |
| `RABBITMQ_URL` | CloudAMQP URL |
| `MICROSERVICE_PRIVATE_KEY` | bingogamesvc@active private key |

### Rollback

Container Apps em Single revision mode. Rollback via:
- `az containerapp revision activate --revision anterior`
- Ou re-deploy com tag `testnet` anterior

## Setup inicial (uma vez)

```bash
# Resource group
az group create -n cryptobingo-testnet -l westus

# Log Analytics
az monitor log-analytics workspace create -g cryptobingo-testnet -n cryptobingo-logs

# Cosmos DB (MongoDB v7.0, free tier)
az cosmosdb create -n cryptobingo-mongo -g cryptobingo-testnet \
  --kind MongoDB --server-version 7.0 --locations regionName=westus \
  --capabilities EnableMongo --default-consistency-level Session \
  --free-tier true --max-throughput 1000

# PostgreSQL (B1ms, 32GB, 12 meses grátis)
az postgres flexible-server create -n cryptobingo-pg -g cryptobingo-testnet \
  --sku-name Standard_B1ms --storage-size 32 --tier Burstable \
  --admin-user cryptobingo --admin-password <pw> --yes

# Container Apps Environment
az containerapp env create -n cryptobingo-env -g cryptobingo-testnet \
  -l westus --logs-workspace-id <workspace-id>

# GHCR registry credential
az containerapp registry set -n api-gateway -g cryptobingo-testnet \
  --server ghcr.io --username iurineumann --password <ghcr-pat>
```

## Consequências

### Positivas

- Custo $0/mês para testnet (exceto PostgreSQL após 12 meses: ~$7/mês)
- Código idêntico testnet/produção (sem branches divergentes)
- Scale-to-zero elimina custo ocioso
- Container Apps consumption plan escala sob demanda

### Negativas

- Cold start (30-60s) após período inativo
- Container Apps consumption plan sem reserva de CPU (concorrência limitada)
- Redis sem persistência (perde cache em restart)
- Static Web Apps sem staging slots (deploy direto em produção)

### Riscos

- WAX testnet RPC instável → falsos negativos nos health checks
- Cosmos DB 1000 RU/s pode throttler em picos (monitorar)
- Container Apps consumption plan limite de 8 requests concorrentes por réplica

## Replicação (novo ambiente)

Para replicar em novo ambiente (ex: produção):

1. Seguir cronologia de provisionamento acima
2. Configurar GitHub Secrets (AZURE_*, SWA tokens, RABBITMQ_URL, MICROSERVICE_PRIVATE_KEY)
3. Deployar contrato na WAX (mainnet) com as permissões ADR-026
4. Criar gametypes + salas via admin UI
5. Ajustar env vars (MONGO_URL, POSTGRES_URL, JWT_SECRET, CORS)
6. Atualizar `resolve-env` no build-push.yml com vars do novo ambiente
