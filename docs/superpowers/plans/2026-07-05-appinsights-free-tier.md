# App Insights Free Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument api-gateway + worker-game-loop with Azure Application Insights (free tier) using OpenTelemetry exporter, and wire landing page Functions via runtime config.

**Architecture:** Replace existing OTel NodeSDK + OTLP exporter in api-gateway and worker-game-loop with `@azure/monitor-opentelemetry` SDK. This SDK wraps OpenTelemetry and exports directly to App Insights. Landing page uses Azure Functions native App Insights integration (no code change). All three share a single workspace-based App Insights resource. Telemetry gated by `APPLICATIONINSIGHTS_ENABLED` env var.

**Tech Stack:** `@azure/monitor-opentelemetry` (Azure OTel SDK), Application Insights workspace-based (free tier 5GB/mo), Log Analytics workspace, Azure Functions runtime integration.

## Global Constraints

- Language: TypeScript, strict mode, no `any` unless unavoidable
- TDD: every implementation step must have preceding RED test step
- Commit per task (frequent, logical, PT-BR conventional commits)
- All env vars namespaced with `APPLICATIONINSIGHTS_` prefix
- Sampling ratio: api-gateway 0.2, worker-game-loop 0.1
- `APPLICATIONINSIGHTS_ENABLED=false` disables telemetry entirely (no side effects)
- Connection string NEVER logged or exposed in error messages
- Existing OTel SDK (`@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-proto`) deps replaced by `@azure/monitor-opentelemetry`
- Worker keeps `@opentelemetry/instrumentation-amqplib` (explicit instrumentation for AMQP)
- All existing tests must still pass after changes
- `pnpm build` must compile without errors

---

### Task 1: Update ADR-043 With App Insights Decision

**Files:**
- Modify: `docs/adr/ADR-043-observabilidade.md`

**Interfaces:**
- Consumes: (none)
- Produces: updated ADR reflecting App Insights decision for downstream team reference

- [ ] **Step 1: Read current ADR-043**

ADR already read above. Confirms existing content at `docs/adr/ADR-043-observabilidade.md`.

- [ ] **Step 2: Update ADR with new content**

Replace existing "Tracing — OpenTelemetry" section and add "Application Insights" section. Append context about free tier cost.

Content to write (overwrite entire file):

```markdown
# ADR-043: Stack de Observabilidade

**Status:** Aceito (2026-07-05, atualizado)
**Data:** 2026-07-04
**Atualização:** 2026-07-05 — Migração OTLP → Azure Application Insights (free tier)

---

## Problema

O CryptoBingo roda em produção com múltiplos serviços (API Gateway, Worker Game Loop,
Frontend, Landing Page, Azure Functions). Sem observabilidade estruturada, diagnosticar
falhas em produção era lento e impreciso:

- Logs soltos via `console.*` sem nível, sem requestId, sem estrutura JSON
- Erros no frontend mudos (sem capture automático)
- Sem alertas proativos para downtime ou degradação
- Sem tracing distribuído entre API → Worker → Blockchain

## Decisão

Adotar stack de observabilidade em 4 camadas:

### Logger — Pino

- Substituir `console.*` por pino em API Gateway + Worker Game Loop
- requestId via AsyncLocalStorage (header `x-request-id` ou UUID)
- `LOG_LEVEL` env var (default: info)
- pino-pretty em dev, JSON puro em produção
- Sem alteração na lógica de negócio

### Error Tracking — Sentry

- `@sentry/react` no Frontend (React + Vite) + Landing Page (React Router SSG)
- `Sentry.init` com `browserTracingIntegration` (sample rate 0.1 prod, 0 dev)
- ErrorBoundary no root do Frontend
- Landing SSG: init com `typeof window !== 'undefined'` guard (sem ErrorBoundary)
- DSN via `VITE_SENTRY_DSN`

### Alertas — Grafana Alerting

- Provisionado como código em `infra/grafana/alerting/`
- Notifier Slack (`SLACK_WEBHOOK_URL`)
- 6 regras: `worker-stopped`, `worker-dlq-growing`, `worker-rtp-out-of-range`,
  `api-5xx-rate`, `chain-block-stalled`, `chain-tx-fail-rate`
- Severidades: critical (aciona Slack) / warning (dashboard)

### Tracing & Métricas — Azure Application Insights

Substitui OpenTelemetry OTLP export por Azure Monitor exporter via `@azure/monitor-opentelemetry`.

**Motivação:**
- Free tier: 5GB/mês inclusos — estimativa de uso < 15MB/mês (>300x margem)
- Workspace-based App Insights integra com Log Analytics para queries KQL
- Zero custo de infra adicional vs operar collector OTLP próprio
- Azure Functions runtime tem integração nativa (sem código)
- Disponível em westus2 (mesma região dos container apps)

**Cobertura:**

| App | Runtime | Instrumentação | Sampling |
|---|---|---|---|
| api-gateway | Express/TS | `@azure/monitor-opentelemetry` auto | 20% |
| worker-game-loop | Node (background) | `@azure/monitor-opentelemetry` auto | 10% |
| landing-page | Azure Functions | Nativa do runtime | default |

**Setup:**
- `APPLICATIONINSIGHTS_CONNECTION_STRING` (env var, obrigatória)
- `APPLICATIONINSIGHTS_SAMPLING_RATIO` (env var, default 0.2 api / 0.1 worker)
- `APPLICATIONINSIGHTS_ENABLED` (env var, default true, desliga sem remover código)
- `src/instrumentation.ts` importado como side-effect ANTES do Express/consumers
- `useAzureMonitor()` do pacote `@azure/monitor-opentelemetry`

**Captura:** HTTP requests, dependências (Redis, PG, RabbitMQ), uncaught exceptions, logs.
**Não cobre:** Frontend/swap-ui (SPA), landing page SSG (estático).

## Consequências

Positivas:
- Debugging produtivo: logs JSON filtráveis por nível/requestId/tag
- Frontend errors capturados automaticamente com stack trace + breadcrumbs
- Alertas proativos: downtime detectado em <2 min
- Tracing distribuído API → Worker → Blockchain (via App Insights)
- Custo zero (free tier 5GB/mês, uso estimado < 15MB/mês)

Negativas:
- Overhead de dependências (~3 pacotes por serviço)
- Sentry source maps requerem CI config
- Alertas requerem `SLACK_WEBHOOK_URL` configurado

Neutras:
- App Insights connection string aumenta complexidade de config (env var)
- Sampling ratio precisa ser ajustado conforme volume cresce
- Grafana alertas precisam ser sincronizados via API ou provisionamento
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-043-observabilidade.md
git commit -m "docs(adr): atualiza ADR-043 com decisão App Insights free tier"
```

---

### Task 2: Create App Insights Resource in Azure

**Files:**
- (none — Azure CLI, no code change)

**Interfaces:**
- Consumes: Azure subscription `cryptobingo-testnet`
- Produces: `APPLICATIONINSIGHTS_CONNECTION_STRING` value (used in Tasks 3-6)

- [ ] **Step 1: Create Log Analytics workspace + App Insights**

```bash
az group deployment create \
  --resource-group cryptobingo-testnet \
  --template-uri <(cat << 'EOF'
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "lawName": { "type": "string", "defaultValue": "cryptobingo-testnet-ai-law" },
    "aiName": { "type": "string", "defaultValue": "cryptobingo-testnet-ai" },
    "location": { "type": "string", "defaultValue": "westus2" }
  },
  "resources": [
    {
      "type": "Microsoft.OperationalInsights/workspaces",
      "apiVersion": "2023-09-01",
      "name": "[parameters('lawName')]",
      "location": "[parameters('location')]",
      "properties": {
        "sku": { "name": "pergb2018" },
        "retentionInDays": 30
      }
    },
    {
      "type": "Microsoft.Insights/components",
      "apiVersion": "2020-02-02",
      "name": "[parameters('aiName')]",
      "location": "[parameters('location')]",
      "kind": "web",
      "properties": {
        "Application_Type": "web",
        "WorkspaceResourceId": "[resourceId('Microsoft.OperationalInsights/workspaces', parameters('lawName'))]"
      },
      "dependsOn": [
        "[resourceId('Microsoft.OperationalInsights/workspaces', parameters('lawName'))]"
      ]
    }
  ],
  "outputs": {
    "connectionString": {
      "type": "string",
      "value": "[listKeys(resourceId('Microsoft.Insights/components', parameters('aiName')), '2020-02-02').ConnectionString]"
    }
  }
}
EOF
) \

```

Note: The inline template above may need to be written to a temp file first. Alternative one-liner:

```bash
az deployment group create \
  --resource-group cryptobingo-testnet \
  --name appinsights-deploy \
  --template-file /tmp/ai-arm.json
```

Where `/tmp/ai-arm.json` contains the ARM template from the spec (Log Analytics workspace + workspace-based App Insights component).

- [ ] **Step 2: Capture connection string from deployment output**

```bash
az deployment group show \
  --resource-group cryptobingo-testnet \
  --name appinsights-deploy \
  --query properties.outputs.connectionString.value \
  --output tsv
```

Save the value to pass to GitHub secrets (`AZURE_AI_CS`) and local `.env` files.

- [ ] **Step 3: Save connection string to GitHub Actions secret**

```bash
gh secret set AZURE_AI_CS \
  --repo iurineumann/cryptobingo \
  --body "$AI_CS"
```

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore(infra): provisiona App Insights cryptobingo-testnet-ai"
```

---

### Task 3: api-gateway — Replace OTel With App Insights (TDD)

**Files:**
- Create: `apps/api-gateway/src/instrumentation.ts`
- Create: `apps/api-gateway/src/services/__tests__/instrumentation.test.ts`
- Modify: `apps/api-gateway/src/index.ts` (lines 6-9, replace tracing require)
- Modify: `apps/api-gateway/package.json` (replace OTel deps with App Insights, remove unused)
- Delete: `apps/api-gateway/src/services/tracing.ts`
- Delete: `apps/api-gateway/src/services/tracing.test.ts`

**Interfaces:**
- Consumes: env vars `APPLICATIONINSIGHTS_CONNECTION_STRING`, `APPLICATIONINSIGHTS_SAMPLING_RATIO`, `APPLICATIONINSIGHTS_ENABLED`
- Produces: side-effect module that calls `useAzureMonitor()` when enabled

- [ ] **Step 1: Write failing test for instrumentation.ts — disabled env**

```typescript
// apps/api-gateway/src/services/__tests__/instrumentation.test.ts

jest.mock('@azure/monitor-opentelemetry', () => ({
  useAzureMonitor: jest.fn(),
}));

import { useAzureMonitor } from '@azure/monitor-opentelemetry';

describe('instrumentation (api-gateway)', () => {
  const OGENABLED = process.env.APPLICATIONINSIGHTS_ENABLED;
  const OGCS = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  const OGSR = process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APPLICATIONINSIGHTS_ENABLED = OGENABLED;
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = OGCS;
    process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO = OGSR;
  });

  it('nao inicializa useAzureMonitor se APPLICATIONINSIGHTS_ENABLED=false', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'false';
    jest.isolateModules(() => {
      require('../instrumentation');
    });
    expect(useAzureMonitor).not.toHaveBeenCalled();
  });

  it('inicializa useAzureMonitor com samplingRatio do env', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'true';
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test';
    process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO = '0.5';
    jest.isolateModules(() => {
      require('../instrumentation');
    });
    expect(useAzureMonitor).toHaveBeenCalledTimes(1);
    expect(useAzureMonitor).toHaveBeenCalledWith(
      expect.objectContaining({
        samplingRatio: 0.5,
        azureMonitorExporterOptions: {
          connectionString: 'InstrumentationKey=test',
        },
      }),
    );
  });

  it('usa samplingRatio 0.2 se env nao definido', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'true';
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test';
    delete process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO;
    jest.isolateModules(() => {
      require('../instrumentation');
    });
    expect(useAzureMonitor).toHaveBeenCalledWith(
      expect.objectContaining({
        samplingRatio: 0.2,
      }),
    );
  });

  it('nao inicializa se connection string ausente', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'true';
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    jest.isolateModules(() => {
      require('../instrumentation');
    });
    expect(useAzureMonitor).not.toHaveBeenCalled();
  });

  it('initializa com http instrumentations habilitado', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'true';
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test';
    jest.isolateModules(() => {
      require('../instrumentation');
    });
    expect(useAzureMonitor).toHaveBeenCalledWith(
      expect.objectContaining({
        instrumentationOptions: {
          http: { enabled: true },
        },
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @cryptobingo/api-gateway test -- --testPathPattern instrumentation
```

Expected: FAIL — module not found, `useAzureMonitor` not imported.

- [ ] **Step 3: Write minimal instrumentation.ts**

```typescript
// apps/api-gateway/src/instrumentation.ts

import { useAzureMonitor } from '@azure/monitor-opentelemetry';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

if (
  process.env.APPLICATIONINSIGHTS_ENABLED !== 'false' &&
  process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
) {
  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    },
    samplingRatio: parseFloat(
      process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO || '0.2',
    ),
    instrumentationOptions: {
      http: { enabled: true },
    },
  });

  process.on('SIGTERM', () => {
    // Azure Monitor SDK handles graceful shutdown internally
  });
  process.on('SIGINT', () => {
    // Azure Monitor SDK handles graceful shutdown internally
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @cryptobingo/api-gateway test -- --testPathPattern instrumentation
```

Expected: 5 PASS, 0 FAIL

- [ ] **Step 5: Modify index.ts to import instrumentation instead of tracing**

Change lines 6-9 from:
```typescript
if (process.env.OTEL_ENABLED === 'true') {
  require('./services/tracing');
}
```

To:
```typescript
// Instrumentação App Insights — deve ser importada antes de qualquer outro módulo
// para capturar 100% das requisições desde o startup.
import './instrumentation';
```

- [ ] **Step 6: Update package.json — swap dependencies**

In `apps/api-gateway/package.json`, replace:

Remove these lines from `dependencies`:
```
"@opentelemetry/auto-instrumentations-node": "^0.60.0",
"@opentelemetry/exporter-trace-otlp-proto": "^0.200.0",
"@opentelemetry/sdk-node": "^0.200.0",
```

Add to `dependencies`:
```
"@azure/monitor-opentelemetry": "^1.10.0",
```

- [ ] **Step 7: Delete old tracing files**

```bash
rm apps/api-gateway/src/services/tracing.ts
rm apps/api-gateway/src/services/tracing.test.ts
```

- [ ] **Step 8: Run full test suite to verify no regressions**

```bash
pnpm --filter @cryptobingo/api-gateway test
```

Expected: all existing tests pass. If there are references to the old `tracing` module in other tests, fix imports.

- [ ] **Step 9: Commit**

```bash
git add apps/api-gateway/src/instrumentation.ts \
  apps/api-gateway/src/services/__tests__/instrumentation.test.ts \
  apps/api-gateway/src/index.ts \
  apps/api-gateway/package.json
git rm apps/api-gateway/src/services/tracing.ts \
  apps/api-gateway/src/services/tracing.test.ts
git commit -m "feat(api-gateway): substitui OTel OTLP por App Insights"
```

---

### Task 4: worker-game-loop — Replace OTel With App Insights (TDD)

**Files:**
- Create: `apps/worker-game-loop/src/instrumentation.ts`
- Create: `apps/worker-game-loop/src/services/__tests__/instrumentation.test.ts`
- Modify: `apps/worker-game-loop/src/index.ts` (lines 6-9, replace tracing require)
- Modify: `apps/worker-game-loop/package.json` (replace OTel deps with App Insights, keep amqplib)
- Delete: `apps/worker-game-loop/src/services/tracing.ts`
- Delete: `apps/worker-game-loop/src/services/tracing.test.ts`

**Interfaces:**
- Consumes: env vars `APPLICATIONINSIGHTS_CONNECTION_STRING`, `APPLICATIONINSIGHTS_SAMPLING_RATIO`, `APPLICATIONINSIGHTS_ENABLED`
- Produces: side-effect module that calls `useAzureMonitor()` when enabled

- [ ] **Step 1: Write failing test for instrumentation.ts — disabled env**

```typescript
// apps/worker-game-loop/src/services/__tests__/instrumentation.test.ts

jest.mock('@azure/monitor-opentelemetry', () => ({
  useAzureMonitor: jest.fn(),
}));

import { useAzureMonitor } from '@azure/monitor-opentelemetry';

describe('instrumentation (worker-game-loop)', () => {
  const OGENABLED = process.env.APPLICATIONINSIGHTS_ENABLED;
  const OGCS = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  const OGSR = process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APPLICATIONINSIGHTS_ENABLED = OGENABLED;
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = OGCS;
    process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO = OGSR;
  });

  it('nao inicializa useAzureMonitor se APPLICATIONINSIGHTS_ENABLED=false', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'false';
    jest.isolateModules(() => {
      require('../instrumentation');
    });
    expect(useAzureMonitor).not.toHaveBeenCalled();
  });

  it('inicializa useAzureMonitor com samplingRatio 0.1 (default worker)', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'true';
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test-worker';
    delete process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO;
    jest.isolateModules(() => {
      require('../instrumentation');
    });
    expect(useAzureMonitor).toHaveBeenCalledTimes(1);
    expect(useAzureMonitor).toHaveBeenCalledWith(
      expect.objectContaining({
        samplingRatio: 0.1,
        azureMonitorExporterOptions: {
          connectionString: 'InstrumentationKey=test-worker',
        },
      }),
    );
  });

  it('usa samplingRatio do env quando definido', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'true';
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test-worker';
    process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO = '0.05';
    jest.isolateModules(() => {
      require('../instrumentation');
    });
    expect(useAzureMonitor).toHaveBeenCalledWith(
      expect.objectContaining({
        samplingRatio: 0.05,
      }),
    );
  });

  it('nao inicializa se connection string ausente', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'true';
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    jest.isolateModules(() => {
      require('../instrumentation');
    });
    expect(useAzureMonitor).not.toHaveBeenCalled();
  });

  it('initializa com http instrumentations habilitado', () => {
    process.env.APPLICATIONINSIGHTS_ENABLED = 'true';
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test-worker';
    jest.isolateModules(() => {
      require('../instrumentation');
    });
    expect(useAzureMonitor).toHaveBeenCalledWith(
      expect.objectContaining({
        instrumentationOptions: {
          http: { enabled: true },
        },
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @cryptobingo/worker-game-loop test -- --testPathPattern instrumentation
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal instrumentation.ts (worker version)**

```typescript
// apps/worker-game-loop/src/instrumentation.ts

import { useAzureMonitor } from '@azure/monitor-opentelemetry';

if (
  process.env.APPLICATIONINSIGHTS_ENABLED !== 'false' &&
  process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
) {
  useAzureMonitor({
    azureMonitorExporterOptions: {
      connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    },
    samplingRatio: parseFloat(
      process.env.APPLICATIONINSIGHTS_SAMPLING_RATIO || '0.1',
    ),
    instrumentationOptions: {
      http: { enabled: true },
    },
  });

  process.on('SIGTERM', () => {
    // Azure Monitor SDK handles graceful shutdown internally
  });
  process.on('SIGINT', () => {
    // Azure Monitor SDK handles graceful shutdown internally
  });
}
```

Note: Worker does NOT import `getNodeAutoInstrumentations` — the `@azure/monitor-opentelemetry` SDK includes auto-instrumentations internally. The worker also keeps the explicit `@opentelemetry/instrumentation-amqplib` dep for AMQP tracing if needed, but it's not imported here — `useAzureMonitor` handles it if the auto-instrumentation detects the amqplib package.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @cryptobingo/worker-game-loop test -- --testPathPattern instrumentation
```

Expected: 5 PASS, 0 FAIL

- [ ] **Step 5: Modify index.ts to import instrumentation instead of tracing**

Change lines 6-9 from:
```typescript
if (process.env.OTEL_ENABLED === 'true') {
  require('./services/tracing');
}
```

To:
```typescript
// Instrumentação App Insights — deve ser importada antes de qualquer consumo
// para capturar traces desde o startup do worker.
import './instrumentation';
```

- [ ] **Step 6: Update package.json — swap dependencies**

In `apps/worker-game-loop/package.json`, replace:

Remove these lines from `dependencies`:
```
"@opentelemetry/exporter-trace-otlp-proto": "^0.200.0",
"@opentelemetry/sdk-node": "^0.200.0",
```

Add to `dependencies`:
```
"@azure/monitor-opentelemetry": "^1.10.0",
```

Keep `@opentelemetry/instrumentation-amqplib` in dependencies (it's used by `@azure/monitor-opentelemetry` auto-instrumentation discovery, even though we don't import it directly).

- [ ] **Step 7: Delete old tracing files**

```bash
rm apps/worker-game-loop/src/services/tracing.ts
rm apps/worker-game-loop/src/services/tracing.test.ts
```

- [ ] **Step 8: Run full test suite to verify no regressions**

```bash
pnpm --filter @cryptobingo/worker-game-loop test
```

Expected: all existing tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/worker-game-loop/src/instrumentation.ts \
  apps/worker-game-loop/src/services/__tests__/instrumentation.test.ts \
  apps/worker-game-loop/src/index.ts \
  apps/worker-game-loop/package.json
git rm apps/worker-game-loop/src/services/tracing.ts \
  apps/worker-game-loop/src/services/tracing.test.ts
git commit -m "feat(worker): substitui OTel OTLP por App Insights"
```

---

### Task 5: Landing Page Functions — Set App Insights Connection String

**Files:**
- (none — Azure CLI only)

**Interfaces:**
- Consumes: `APPLICATIONINSIGHTS_CONNECTION_STRING` from Task 2
- Produces: Function App with App Insights integration active

- [ ] **Step 1: Set connection string on Function App**

```bash
az functionapp config appsettings set \
  --name cryptobingo-landing-api \
  --resource-group cryptobingo-testnet \
  --settings "APPLICATIONINSIGHTS_CONNECTION_STRING=$AI_CS"
```

- [ ] **Step 2: Verify the setting is applied**

```bash
az functionapp config appsettings list \
  --name cryptobingo-landing-api \
  --resource-group cryptobingo-testnet \
  --query "[?name=='APPLICATIONINSIGHTS_CONNECTION_STRING'].value" \
  --output tsv
```

Expected: returns the connection string (masked partially by Azure CLI).

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore(infra): configura App Insights na landing page Function App"
```

---

### Task 6: CI and Local Env Config — Add Connection String

**Files:**
- Modify: `.github/workflows/build-push.yml`
- Modify: `.github/workflows/deploy-landing.yml`
- Modify: `apps/api-gateway/.env`
- Modify: `apps/worker-game-loop/.env`

**Interfaces:**
- Consumes: `${{ secrets.AZURE_AI_CS }}` from GitHub Secrets, local `APPLICATIONINSIGHTS_*` values
- Produces: runtime env vars available to all three apps

- [ ] **Step 1: Add env vars to api-gateway .env**

In `apps/api-gateway/.env`, append at end of file:

```
# ==========================================
# APP INSIGHTS — Observabilidade
# ==========================================
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=dev-local
APPLICATIONINSIGHTS_SAMPLING_RATIO=0.2
APPLICATIONINSIGHTS_ENABLED=false
```

- [ ] **Step 2: Add env vars to worker-game-loop .env**

In `apps/worker-game-loop/.env`, append at end:

```
# ==========================================
# APP INSIGHTS — Observabilidade
# ==========================================
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=dev-local
APPLICATIONINSIGHTS_SAMPLING_RATIO=0.1
APPLICATIONINSIGHTS_ENABLED=false
```

- [ ] **Step 3: Add connection string build-arg to build-push.yml**

In `.github/workflows/build-push.yml`, add to the `build-args:` section (after the `VITE_SWAP_CONTRACT` line, line 104):

```yaml
            APPLICATIONINSIGHTS_CONNECTION_STRING=${{ secrets.AZURE_AI_CS }}
```

Also add as env to the `deploy-testnet` job's `az containerapp update` steps. Add BEFORE the `az containerapp update` command:

For API Gateway deploy (around line 131):
```bash
            az containerapp update \
              -g ${{ env.AZURE_RG }} \
              -n api-gateway \
              --container-name api-gateway \
              --image ${{ env.IMAGE_NS }}/cryptobingo-api-gateway:testnet \
              --set-env-vars APPLICATIONINSIGHTS_CONNECTION_STRING=${{ secrets.AZURE_AI_CS }} \
                           APPLICATIONINSIGHTS_SAMPLING_RATIO=0.2 \
                           APPLICATIONINSIGHTS_ENABLED=true
```

For Worker deploy (around line 142):
```bash
            az containerapp update \
              -g ${{ env.AZURE_RG }} \
              -n worker-game-loop \
              --container-name worker-game-loop \
              --image ${{ env.IMAGE_NS }}/cryptobingo-worker-game-loop:testnet \
              --set-env-vars APPLICATIONINSIGHTS_CONNECTION_STRING=${{ secrets.AZURE_AI_CS }} \
                           APPLICATIONINSIGHTS_SAMPLING_RATIO=0.1 \
                           APPLICATIONINSIGHTS_ENABLED=true
```

- [ ] **Step 4: Verify build-push.yml syntax**

```bash
# Parse YAML via Python to verify:
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-push.yml')); print('OK')"
```

Expected: OK

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/.env \
  apps/worker-game-loop/.env \
  .github/workflows/build-push.yml
git commit -m "chore(ci): adiciona APPLICATIONINSIGHTS env vars ao CI e .env local"
```

---

### Task 7: Smoke Tests (Manual After Deploy)

**Files:**
- (none — manual verification)

**Interfaces:**
- Consumes: deployed apps with App Insights wired
- Produces: verified telemetry flowing into Azure portal

- [ ] **Step 1: Deploy updated images to testnet**

```bash
# Manual deploy (CI não roda, conforme CLAUDE.md)
# Build + push images, then update container apps
```

- [ ] **Step 2: Verify api-gateway telemetry**

```bash
curl -s https://api-gateway.<...>.azurecontainerapps.io/health/live
```

Then check Azure portal → `cryptobingo-testnet-ai` → Transaction search for `requests` with name `GET /health/live`.

Expected: at least 1 request logged within 2-3 minutes.

- [ ] **Step 3: Simulate game flow to generate worker telemetry**

```bash
# Run a game via the harness or admin UI
# Then check App Insights → Traces for worker-game-loop service name
```

Expected: traces appear in Transaction search with `cloud_RoleName = worker-game-loop`.

- [ ] **Step 4: Verify landing page Function telemetry**

```bash
curl -s https://landing-api.cryptobingo.bet/api/subscribe
```

Then check Azure portal → `cryptobingo-testnet-ai` → Transaction search for `subscribe` invocation.

Expected: at least 1 Function invocation logged.

- [ ] **Step 5: Verify free tier usage in portal**

Check `cryptobingo-testnet-ai` → Usage and estimated costs → Daily data volume.

Expected: < 1 MB for the smoke test day.

---

### Task 8: RAG Indexing + CLAUDE.md Update

**Files:**
- Modify: `CLAUDE.md`
- Index via RAG: spec, instrumentation files, ADR

**Interfaces:**
- Consumes: all files created/modified in Tasks 1-6
- Produces: retrievable knowledge in RAG, updated CLAUDE.md section

- [ ] **Step 1: Add App Insights section to CLAUDE.md**

Read current CLAUDE.md top, then add after the "Prize Pipeline (ADR-038)" section (or at EOF if that section doesn't exist):

```
## App Insights (2026-07-05, ADR-043)

Observabilidade backend com Azure Application Insights (free tier, 5GB/mês).

**Serviços instrumentados:**
- api-gateway: `src/instrumentation.ts` — `@azure/monitor-opentelemetry`, sampling 20%
- worker-game-loop: `src/instrumentation.ts` — `@azure/monitor-opentelemetry`, sampling 10%
- landing-page: runtime nativa via `APPLICATIONINSIGHTS_CONNECTION_STRING`

**Env vars:**
- `APPLICATIONINSIGHTS_CONNECTION_STRING` — obrigatória em produção
- `APPLICATIONINSIGHTS_SAMPLING_RATIO` — default 0.2 (api) / 0.1 (worker)
- `APPLICATIONINSIGHTS_ENABLED=false` — desliga em dev sem remover código

**Recurso Azure:** `cryptobingo-testnet-ai` (westus2, workspace-based, Log Analytics `cryptobingo-testnet-ai-law`)

**TDD:** Testes mockam `@azure/monitor-opentelemetry.useAzureMonitor`. Não enviar telemetria real em teste.

**GitHub Secret:** `AZURE_AI_CS` — connection string do recurso.
```

- [ ] **Step 2: Index key files in RAG**

```typescript
// Index via RAG tool:
// Files to index:
// - docs/superpowers/specs/2026-07-05-appinsights-free-tier-design.md
// - docs/adr/ADR-043-observabilidade.md
// - apps/api-gateway/src/instrumentation.ts
// - apps/worker-game-loop/src/instrumentation.ts
// - CLAUDE.md (after update)
```

- [ ] **Step 3: Self-review memory**

Run `memory search` with query `"App Insights instrumentation"` to confirm the knowledge is retrievable.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: adiciona secao App Insights ao CLAUDE.md"
```

---

## Self-Review

**1. Spec coverage:**
- App Insights resource creation → Task 2
- api-gateway instrumentation.ts with TDD → Task 3 (Steps 1-4)
- worker-game-loop instrumentation.ts with TDD → Task 4 (Steps 1-4)
- landing page Functions (runtime integration) → Task 5
- Config/env vars → Task 6 (.env, CI)
- Smoke tests (manual) → Task 7
- Sampling ratios (0.2 api, 0.1 worker) → Tasks 3 and 4 instrumentation.ts
- `APPLICATIONINSIGHTS_ENABLED` gate → Tasks 3 and 4 (all tests verify disabled)
- ADR update → Task 1
- RAG/CLAUDE.md → Task 8
- Cost estimate (free tier) → Task 1 (ADR) and Task 2 output

**2. Placeholder scan:**
All steps contain complete code. No "TBD", "TODO", or "implement later" found. Every path and command is exact.

**3. Type consistency:**
- `useAzureMonitor` consistently used across Tasks 3 and 4
- `instrumentation.ts` naming consistent (not `tracing`)
- `APPLICATIONINSIGHTS_*` env var naming consistent across all tasks
- Sampling ratios: 0.2 api-gateway (Task 3), 0.1 worker (Task 4) — matches spec
- `process.env.APPLICATIONINSIGHTS_CONNECTION_STRING`  — consistently referenced
- `@azure/monitor-opentelemetry` version `^1.10.0` consistent in both package.json changes

**Gap found:** The spec mentions `@opentelemetry/instrumentation-express, instrumentation-http, instrumentation-ioredis, instrumentation-pg` as deps for api-gateway, but `@azure/monitor-opentelemetry` bundles auto-instrumentation internally via `getNodeAutoInstrumentations`. No need to add those individually. The existing `@opentelemetry/auto-instrumentations-node` is removed and replaced by the Azure SDK's internal auto-instrumentation. Correct.

**Gap found:** Worker's existing `@opentelemetry/instrumentation-amqplib` is kept as a dependency — the Azure Monitor SDK discovers installed instrumentations at runtime, so keeping it ensures AMQP tracing continues to work. The plan addresses this in Step 6 ("Keep `@opentelemetry/instrumentation-amqplib`"). Correct.
