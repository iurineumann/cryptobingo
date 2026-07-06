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
