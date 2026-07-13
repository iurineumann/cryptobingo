# Observabilidade Stack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar logging estruturado (pino), error tracking (Sentry), alertas (Grafana) e tracing (OpenTelemetry) em toda a stack.

**Architecture:** Por fase. Pino substitui console.* com JSON + requestId. Sentry captura erros no frontend + landing. Alertas Grafana provisionados como codigo. OTel tracing cross-service via Express + amqplib.

**Tech Stack:** Node 22, TypeScript 6+, Express 5, React 19, pino, @sentry/react, OpenTelemetry, Grafana Alerting, Prometheus

## Global Constraints
- NAO modificar logica de negocios existente — so substituir `console.*` por logger
- Manter compatibilidade com Prometheus metrics existentes
- Sentry DSN via env var (nao hardcoded)
- Pino logger aceita `level` via env var `LOG_LEVEL` (default: `info`)
- Seguir padrao do projeto: sem comentarios em codigo, PT-BR em docs, TDD

---

## Fase 1 — Pino Logger (API Gateway + Worker)

### Task 1.1: Adicionar pino no API Gateway + middleware

**Files:**
- Modify: `apps/api-gateway/package.json` (add `pino`, `pino-http`)
- Create: `apps/api-gateway/src/middleware/logger.ts`
- Create: `apps/api-gateway/src/middleware/requestId.ts`
- Create: `apps/api-gateway/src/middleware/__tests__/logger.test.ts`
- Create: `apps/api-gateway/src/middleware/__tests__/requestId.test.ts`
- Modify: `apps/api-gateway/src/index.ts` (registrar middleware)

- [ ] **Step 1: Add pino deps**

Run: `pnpm --filter @cryptobingo/api-gateway add pino pino-http`

- [ ] **Step 2: Write failing test for logger middleware**

- [ ] **Step 3: Create pino logger + requestId middleware**

```ts
// apps/api-gateway/src/middleware/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});
```

```ts
// apps/api-gateway/src/middleware/requestId.ts
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, NextFunction } from 'express';

export const als = new AsyncLocalStorage<string>();

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction) {
  const id = (req.headers['x-request-id'] as string) || randomUUID();
  req.headers['x-request-id'] = id;
  als.run(id, () => next());
}

export function getRequestId(): string {
  return als.getStore() || 'unknown';
}
```

- [ ] **Step 4: Register middleware in index.ts**

```ts
// Em registerMiddleware() ou setup inicial
app.use(requestIdMiddleware());
app.use(pinoHttp({ logger, quietReqLogger: true }));
```

- [ ] **Step 5: Run tests, commit**

```bash
git add apps/api-gateway/src/middleware/ apps/api-gateway/package.json
git commit -m "feat(observability): pino logger + requestId no API Gateway"
```

### Task 1.2: Substituir console.* nos controllers do API Gateway

**Files:**
- Modify: ~15 controllers em `apps/api-gateway/src/controllers/`

- [ ] **Step 1: Para cada controller, substituir:**
  - `console.log(...)` → `logger.info(...)`
  - `console.error(...)` → `logger.error({ err }, ...)`
  - `console.warn(...)` → `logger.warn(...)`

- [ ] **Step 2: Adicionar requestId nas mensagens via `getRequestId()`**

- [ ] **Step 3: Commit apos cada controller ou em lote**

```bash
git commit -m "feat(observability): console->pino nos controllers"
```

### Task 1.3: Pino no Worker

**Files:**
- Modify: `apps/worker-game-loop/package.json` (add `pino`)
- Create: `apps/worker-game-loop/src/services/logger.ts`
- Modify: ~30 ocorrencias de `console.*` no worker

- [ ] **Step 1: Add pino dep**

- [ ] **Step 2: Create logger service**

```ts
// apps/worker-game-loop/src/services/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});
```

- [ ] **Step 3: Substituir console.* nos services do worker**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(observability): pino logger no Worker"
```

---

## Fase 2 — Sentry (Frontend + Landing)

### Task 2.1: Sentry no Frontend

**Files:**
- Modify: `apps/frontend/package.json` (add `@sentry/react`)
- Modify: `apps/frontend/src/main.tsx` (Sentry.init + ErrorBoundary)
- Modify: `.github/workflows/build-push.yml` (source maps upload)

- [ ] **Step 1: Add @sentry/react dep**

- [ ] **Step 2: Write failing test (Sentry capture chamado em erro)**

- [ ] **Step 3: Configurar Sentry.init + ErrorBoundary**

```ts
// apps/frontend/src/main.tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 0,
});
```

```tsx
// ErrorBoundary wrapper no root
root.render(
  <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
    <App />
  </Sentry.ErrorBoundary>
);
```

- [ ] **Step 4: Adicionar source maps no CI build**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(observability): Sentry no Frontend + ErrorBoundary"
```

### Task 2.2: Sentry na Landing Page

**Files:**
- Modify: `apps/landing-page/package.json` (add `@sentry/react`)
- Modify: `apps/landing-page/app/root.tsx`

- [ ] **Step 1: Adicionar config minima**

```ts
// apps/landing-page/app/root.tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0,
});
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(observability): Sentry na Landing Page"
```

---

## Fase 3 — Alertas Grafana

### Task 3.1: Criar estrutura de alertas

**Files:**
- Create: `infra/grafana/alerting/worker-critical.json`
- Create: `infra/grafana/alerting/api-critical.json`
- Create: `infra/grafana/alerting/chain-critical.json`
- Create: `infra/grafana/alerting/notifiers.json`
- Modify: `infra/grafana/dashboards/` (adicionar paineis de alerta)

- [ ] **Step 1: Criar notificador Slack**

```json
{
  "uid": "slack-notifier",
  "name": "Slack CryptoBingo",
  "type": "slack",
  "settings": {
    "url": "${SLACK_WEBHOOK_URL}",
    "recipient": "#alerts"
  }
}
```

- [ ] **Step 2: Criar alerta Worker parado**

```json
{
  "ruleGroup": "worker-critical",
  "title": "Worker processamento parado",
  "condition": "worker_events_processed_total rate[5m] == 0",
  "for": "2m",
  "notifications": ["slack-notifier"]
}
```

- [ ] **Step 3: Criar alerta DLQ crescendo**

- [ ] **Step 4: Criar alerta RTP fora do range**

- [ ] **Step 5: Criar alerta API 5xx > 1%**

- [ ] **Step 6: Commit**

```bash
git add infra/grafana/alerting/
git commit -m "feat(observability): alertas Grafana provisionados como codigo"
```

### Task 3.2: Worker health check completo

**Files:**
- Modify: `apps/worker-game-loop/src/services/metrics.ts`

- [ ] **Step 1: Adicionar verificacoes no /readyz**

```ts
// Adicionar ao health check existente
async function checkMongo(): Promise<boolean> { /* ping mongo */ }
async function checkPostgres(): Promise<boolean> { /* pg ping */ }
async function checkChain(): Promise<boolean> { /* get_info block height */ }
```

- [ ] **Step 2: Atualizar /health com status parciais**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(observability): worker health check completo (mongo+pg+chain)"
```

---

## Fase 4 — OpenTelemetry Tracing

### Task 4.1: OTel no API Gateway

**Files:**
- Modify: `apps/api-gateway/package.json` (add OTel deps)
- Create: `apps/api-gateway/src/services/tracing.ts`
- Modify: `apps/api-gateway/src/index.ts`

- [ ] **Step 1: Add OTel deps**

- [ ] **Step 2: Create tracing setup**

```ts
// apps/api-gateway/src/services/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  instrumentations: [getNodeAutoInstrumentations()],
});

if (process.env.OTEL_ENABLED === 'true') {
  sdk.start();
}

process.on('SIGTERM', () => sdk.shutdown());
```

- [ ] **Step 3: Commit**

### Task 4.2: OTel no Worker com amqplib

**Files:**
- Modify: `apps/worker-game-loop/package.json`
- Create: `apps/worker-game-loop/src/services/tracing.ts`

- [ ] **Step 1: Setup OTel com instrumentacao amqplib**

```ts
// apps/worker-game-loop/src/services/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { AmqplibInstrumentation } from '@opentelemetry/instrumentation-amqplib';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [new AmqplibInstrumentation()],
});
```

- [ ] **Step 2: Commit**

---

## Fase 5 — ADR e Documentacao

### Task 5.1: ADR-043 Observabilidade

**Files:**
- Create: `docs/adr/ADR-043-observabilidade.md`

- [ ] **Step 1: Criar ADR documentando:**

```markdown
# ADR-043: Stack de Observabilidade

**Decisao:** Pino (logging) + Sentry (errors) + OTel (tracing) + Grafana Alerting

**Logger:** pino, JSON, requestId via ALS
**Error tracking:** @sentry/react, ErrorBoundary root
**Tracing:** OpenTelemetry SDK, Express + amqplib, export OTLP
**Alertas:** Grafana Alerting provisionado como codigo em infra/grafana/alerting/
```

- [ ] **Step 2: Atualizar CLAUDE.md com novos servicos**

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-043-observabilidade.md
git commit -m "docs(observability): ADR-043 + CLAUDE.md update"
```
