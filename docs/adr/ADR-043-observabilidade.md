# ADR-043: Stack de Observabilidade

**Status:** Aceito (2026-07-04)
**Data:** 2026-07-04

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

### Tracing — OpenTelemetry

- NodeSDK + auto-instrumentations no API Gateway (Express, HTTP, PG)
- AmqplibInstrumentation no Worker (mensageria RabbitMQ)
- Export OTLP via `OTEL_EXPORTER_OTLP_ENDPOINT`
- Gateado por `OTEL_ENABLED=true` (desligado por padrão)

## Consequências

Positivas:
- Debugging produtivo: logs JSON filtráveis por nível/requestId/tag
- Frontend errors capturados automaticamente com stack trace + breadcrumbs
- Alertas proativos: downtime detectado em <2 min
- Tracing ponta-a-ponta: chamada API → processamento worker → tx blockchain

Negativas:
- Overhead de dependências (~3 pacotes OTel por serviço)
- Sentry source maps requerem CI config
- Alertas requerem `SLACK_WEBHOOK_URL` configurado

Neutras:
- `LOG_LEVEL` e `OTEL_ENABLED` elevam complexidade de config (env vars)
- Grafana alertas precisam ser sincronizados via API ou provisionamento
