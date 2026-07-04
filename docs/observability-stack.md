# Observabilidade Stack — Guia de Configuração

## Visão Geral

| Camada | Ferramenta | Serviços |
|--------|------------|----------|
| Logging | Pino | API Gateway, Worker |
| Error Tracking | Sentry | Frontend, Landing Page |
| Alertas | Grafana Alerting | Infra (provisionado) |
| Tracing | OpenTelemetry | API Gateway, Worker |

Ver ADR-043 para contexto e decisões.

## Configuração

### Pino (API Gateway + Worker)

```
LOG_LEVEL=info|debug|warn|error (default: info)
```

Ativado por padrão. Em dev, usa pino-pretty (formatação legível).
Em produção, JSON puro → stdout.

### Sentry (Frontend + Landing)

```
VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxxxxx
```

Sample rates:
- Frontend prod: 0.1 (10% das transações)
- Frontend dev/test: 0
- Landing: 0 (apenas erro, sem tracing)

### Grafana Alertas

Arquivos em `infra/grafana/alerting/` — provisionamento via API.

Requer `SLACK_WEBHOOK_URL` para notificações.

| Alerta | Severidade | Condição | Janela |
|--------|------------|----------|--------|
| Worker stopped | critical | rate == 0 | 2m |
| DLQ growing | warning | rate > 5/min | 5m |
| RTP out of range | warning | RTP < 75% ou > 95% | 30m |
| API 5xx > 1% | critical | 5xx > 1% | 5m |
| Chain stalled | critical | last block > 120s | 1m |
| Tx fail > 20% | warning | fail rate > 20% | 10m |

### OpenTelemetry Tracing

```
OTEL_ENABLED=true|false (default: false)
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318
```

Desligado por padrão. Ligar apenas com collector OTLP disponível.

## Manutenção

### Adicionar novo serviço ao Pino

1. `pnpm add pino`
2. Criar `services/logger.ts` com config padrao
3. Substituir `console.*` nos services

### Adicionar nova regra de alerta

1. Escolher arquivo em `infra/grafana/alerting/`
2. Adicionar rule object seguindo padrão existente
3. Commit + sync via API
