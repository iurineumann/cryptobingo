# Application Insights Free Tier — CryptoBingo

**Data:** 2026-07-05
**Contexto:** Instrumentar servicos backend com Azure Application Insights no free tier (5GB/mes gratis).

## Escopo

| App | Runtime | Instrumentacao | Sampling |
|---|---|---|---|
| api-gateway | Express/TS | OpenTelemetry auto | 20% |
| worker-game-loop | Node (background) | OpenTelemetry auto | 10% |
| landing-page | Azure Functions (Consumption) | Nativa do runtime | default |

Frontend, swap-ui e landing page SSG **fora do escopo**.

## Infra

- Recurso: `Application Insights` workspace-based
- Nome: `cryptobingo-testnet-ai`
- Resource group: `cryptobingo-testnet`
- Regiao: `westus2`
- Log Analytics workspace: `cryptobingo-testnet-ai-law` (criado automaticamente)
- Retention: 30 dias
- Plano: Pay-as-you-go (5GB/mes gratis inclusos)

## Instrumentacao

### api-gateway

**Deps:**
- `@azure/monitor-opentelemetry` (SDK principal + exporter)
- `@opentelemetry/instrumentation-express`
- `@opentelemetry/instrumentation-http`
- `@opentelemetry/instrumentation-ioredis`
- `@opentelemetry/instrumentation-pg`

**Setup:**
Arquivo `src/instrumentation.ts` importado ANTES do Express (top-level side-effect).

```typescript
import { useAzureMonitor } from '@azure/monitor-opentelemetry';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

if (process.env.APPLICATIONINSIGHTS_ENABLED !== 'false') {
  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    },
    samplingRatio: parseFloat(process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO || '0.2'),
    instrumentationOptions: {
      http: { enabled: true },
      // Express e outros via getNodeAutoInstrumentations
    },
  });
}
```

Captura: HTTP requests, dependencias (Redis, PG), uncaught exceptions, logs.

### worker-game-loop

**Deps:**
- `@azure/monitor-opentelemetry`
- `@opentelemetry/instrumentation-http`
- `@opentelemetry/instrumentation-amqplib` (se disponivel)
- `@opentelemetry/instrumentation-ioredis`

**Setup:**
No `main.ts` ou entrypoint, antes de iniciar consumers.

```typescript
if (process.env.APPLICATIONINSIGHTS_ENABLED !== 'false') {
  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    },
    samplingRatio: parseFloat(process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO || '0.1'),
    instrumentationOptions: {
      http: { enabled: true },
    },
  });
}
```

Captura: mensageria RabbitMQ, Redis, chamadas HTTP para chain/nodeos, logs.

### landing-page (Azure Functions)

Functions runtime tem integracao nativa com App Insights. Basta configurar:

```bash
az functionapp config appsettings set \
  --name cryptobingo-landing-api \
  --resource-group cryptobingo-testnet \
  --settings "APPLICATIONINSIGHTS_CONNECTION_STRING=<connection_string>"
```

Sem alteracao de codigo. O runtime captura: invocations, exceptions, logs, bindings.

## Configuracao

| Variavel | Default | Descricao |
|---|---|---|
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | — | Connection string do recurso (obrigatoria) |
| `APPLICATIONINSIGHTS_SAMPLING_RATIO` | `0.2` (api), `0.1` (worker) | Taxa de amostragem (0.0–1.0) |
| `APPLICATIONINSIGHTS_ENABLED` | `true` | Desliga telemetria sem remover codigo |

Connection string e config:
- `.env` local dos servicos (dev)
- `build-push.yml` CI (testnet com `${{ secrets.AZURE_AI_CS }}`)
- `az webapp config appsettings set` (landing page)

## Custo (estimativa)

| App | Reqs/dia | Tamanho medio | Total/mes |
|---|---|---|---|
| api-gateway | ~100 | 1KB | ~3MB |
| worker-game-loop | ~50 jogos × ~5KB | 5KB | ~7.5MB |
| landing-page | ~200 | 0.5KB | ~3MB |
| **Total** | | | **< 15MB/mes** |

Free tier: 5GB/mes. Mais de 300x margem.

## Metricas e Dashboards

- `traces` — logs estruturados
- `requests` — HTTP (api-gateway) e function invocations (landing)
- `dependencies` — Redis, PG, RabbitMQ, chain RPC
- `exceptions` — uncaught exceptions tracking
- Criar dashboard Grafana opcional (reuso `infra/grafana/`)

## Nao incluso

- Frontend/swap-ui (React SPA)
- Landing page SSG (estatico)
- Custom events/transactions de negocio (futuro ADR)

## Processo de desenvolvimento

### Git flow

1. Criar issue: `gh issue create --repo iurineumann/cryptobingo --title "feat(observabilidade): App Insights api-gateway + worker" --label "enhancement"`
2. Adicionar ao Kanban (#4)
3. Branch: `git checkout -b feat/appinsights-backend`
4. Commits TDD (RED → GREEN → refactor)
5. PR para `develop` com corpo estruturado + `Closes #N`
6. Merge → push → deploy manual

### ADR

Mudanca estrutural (nova dependencia de observabilidade). Atualizar `ADR-043-observabilidade.md` existente com:
- Decisao: OpenTelemetry + Azure Monitor (exporter)
- Alternativas consideradas (App Insights SDK clasico)
- Impacto no custo (free tier 5GB/mes)

### RAG

Apos merge, indexar:
- `docs/superpowers/specs/*` — esta spec
- `docs/adr/ADR-041*` — ADR de observabilidade
- `apps/api-gateway/src/instrumentation.ts`
- `apps/worker-game-loop/src/instrumentation.ts`
- `CLAUDE.md` — adicionar secao App Insights

### TDD obrigatorio

Aplicar RED → GREEN → refactor para cada unidade:

**api-gateway:**
1. RED: teste que `instrumentation.ts` nao crasha quando `APPLICATIONINSIGHTS_ENABLED=false`
2. RED: teste que `instrumentation.ts` inicializa `useAzureMonitor` quando connection string presente
3. GREEN: implementar `instrumentation.ts`
4. Refactor: extrair helper de config

**worker-game-loop:**
1. RED: teste que `instrumentation.ts` respeita env var de desligamento
2. GREEN: implementar `instrumentation.ts`
3. VERDE: `pnpm test` dos pacotes tocados passando

Nao testar envio real de telemetria (exige connection string valida). Usar mocks/stubs.

## Teste

### Unitario (TDD)

```typescript
// api-gateway: instrumentation.test.ts
it('nao inicializa OpenTelemetry se APPLICATIONINSIGHTS_ENABLED=false', () => {
  process.env.APPLICATIONINSIGHTS_ENABLED = 'false';
  // assert useAzureMonitor nao foi chamado
});

it('inicializa OpenTelemetry com samplingRatio do env', () => {
  process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO = '0.5';
  process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test';
  // assert useAzureMonitor chamado com samplingRatio = 0.5
});
```

### Smoke (manual, apos deploy)

- api-gateway: `curl /health/live` → ver "Live Metrics" no portal App Insights
- Worker: jogar partida → ver traces de resolucao no portal
- Landing: `GET /api/subscribe` → ver invocation no portal

### Regressao

`pnpm test` dos pacotes tocados deve passar antes do commit.
`pnpm build` deve compilar sem erros.
