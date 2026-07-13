# Plano de Observabilidade — Stack CryptoBingo

**Data:** 2026-07-04
**Persona:** Site Reliability Engineer (SRE)
**Objetivo:** Implementar observabilidade (logging estruturado, tracing, error tracking, alertas) em toda a stack para garantir SLIs/SLOs, reduzir MTTR e detectar anomalias precocemente.

---

## 1. Diagnostico Atual

### Funciona
- ✅ Prometheus + Grafana (docker-compose, 6 dashboards provisionados)
- ✅ Worker: 30+ metricas prom-client (eventos, jogos, premios, XP, achievements)
- ✅ API Gateway: 10+ metricas prom-client (HTTP, Socket.IO)
- ✅ Health checks: Worker (`/health`, `/readyz`), API Gateway (`/health/live`, `/health/ready`)
- ✅ CI smoke test apos deploy (k6 health check no API Gateway)

### Gaps Criticos (ordenados por impacto)

#### 🔴 GAP-1: Logger estruturado ausente
~350 `console.*` sem estrutura (API ~100, Worker ~155, frontend ~40, swap-ui ~30, landing ~25). Sem niveis, sem JSON, sem correlacao (requestId), sem searchability.

#### 🔴 GAP-2: Zero error tracking no frontend
Erros React sao `console.error` apenas. 100% invisivel em producao. Usuario ve tela branca sem alerta.

#### 🔴 GAP-3: Zero tracing distribuido
Requisicao frontend → API Gateway → Worker (RabbitMQ) → Blockchain nao pode ser rastreada ponta-a-ponta.

#### 🟡 GAP-4: Zero alertas Grafana
Dashboards existem mas sem alertas. Ninguem e notificado se DLQ acumular, RTP sair do range, ou worker parar.

#### 🟡 GAP-5: Landing Page sem observabilidade
Azure Functions tem App Insights embutido, mas codigo nao emite logs estruturados nem metricas custom.

#### 🟡 GAP-6: Swap UI sem observabilidade
Zero metricas, zero logging, zero health check.

#### 🟡 GAP-7: Worker health check incompleto
Verifica Redis + RabbitMQ, mas nao verifica MongoDB, PostgreSQL, ou conectividade blockchain.

#### 🟢 GAP-8: Sem agregacao centralizada de logs
Logs morrem dentro do container. Sem Loki/ELK/CloudWatch. Promtail esta EOL desde Mar 2026 — usar Grafana Alloy como sucessor.

#### 🟢 GAP-9: Frontend sem Web Vitals / RUM
Sem coleta de LCP, FID, CLS, TTFB.

#### 🟢 GAP-10: Sem ADR de observabilidade
Decisoes nao documentadas.

---

## 2. Abordagens e Trade-offs

### Logger Estruturado

| Opcao | Pro | Contra | Recomendacao |
|---|---|---|---|
| **Pino** (recomendado) | ~3x mais rapido que Winston, JSON nativo, nivel por request, baixa sobrecarga | Menos ecossistema que Winston | ✅ **Fase 1** |
| Winston | Ecossistema maior, mais transports | Mais pesado, config verbosa | ❌ |
| Morgan + console | Ja conhecido, simples | Sem estrutura, sem niveis | ❌ |

### Error Tracking (Frontend)

| Opcao | Pro | Contra | Recomendacao |
|---|---|---|---|
| **Sentry** (recomendado) | Source maps, breadcrumbs, replay, React 19 compat | Custo em escala alta | ✅ **Fase 2** |
| Datadog RUM | Integrado se ja usa DD | Custo, setup complexo | ❌ |
| TrackJS | Simples, barato | Menos recursos | ❌ |

### Tracing

| Opcao | Pro | Contra | Recomendacao |
|---|---|---|---|
| **OpenTelemetry** (recomendado) | Vendor-neutral, instrumenta Express + amqplib, exporta Prometheus/Jaeger | Complexidade media de setup | ✅ **Fase 4** |
| Jaeger agent | Integracao OTel nativa | Mais um servico para rodar | ✅ (via OTel) |
| Zipkin | Similar ao Jaeger | Menos popular | ❌ |

### Alertas

| Opcao | Pro | Contra | Recomendacao |
|---|---|---|---|
| **Grafana Alerting** (recomendado) | Ja temos Grafana, provisionamento como codigo, multi-notifier | Curva de aprendizado medio | ✅ **Fase 3** |
| Prometheus Alertmanager | Maturidade, silences, inibicao | Setup adicional, sem UI integrada | ❌ (ja temos Grafana) |

---

## 3. Arquitetura Proposta

### Logging (Pino)

```
API Gateway / Worker
  → pino logger (JSON, niveis)
  → requestId via middleware (async_hooks/ALS)
  → stdout (capturado pelo Docker, enviado ao Loki futuramente)

Formato:
  {"level":30,"time":"...","pid":1,"host":"...","reqId":"xyz","msg":"...","err":{...}}
```

### Error Tracking (Sentry)

```
Frontend (React 19)
  → @sentry/react
  → ErrorBoundary no root
  → captureException() em catch blocks
  → Source maps upload no CI/CD build

Landing Page (React Router v7)
  → @sentry/react (basico, sem replay — SSG nao precisa)
```

### Tracing (OpenTelemetry)

```
API Gateway
  → OTel SDK + @opentelemetry/instrumentation-express
  → @opentelemetry/instrumentation-http
  → Propagacao contexto via headers HTTP/RabbitMQ
  → Export: OTLP (Jaeger/Grafana Tempo)

Worker
  → OTel SDK + @opentelemetry/instrumentation-amqplib
  → Continuacao span do API Gateway
```

### Alertas (Grafana)

```
infra/grafana/alerting/
  worker-critical.json     → worker parado, DLQ crescendo, RTP fora do range
  api-critical.json         → 5xx rate > 1%, latencia p99 > 5s, erro auth
  chain-critical.json       → block height travado, oracle parado
  infra-warning.json        → Redis/mongo connections altas, db response time
```

---

## 4. Plano de Implementacao

### Fase 1 — Logger Estruturado (~2 dias)

**Objetivo:** Substituir `console.*` por pino com requestId.

| # | Acao | Arquivos | Esforco |
|---|---|---|---|
| 1.1 | Adicionar `pino` + `pino-http` no API Gateway | `apps/api-gateway/package.json` | 15min |
| 1.2 | Criar logger + requestId middleware | `apps/api-gateway/src/middleware/logger.ts`, `apps/api-gateway/src/middleware/requestId.ts` | 1h |
| 1.3 | Substituir `console.*` nos controllers | ~15 controllers em `apps/api-gateway/src/controllers/` | 2h |
| 1.4 | Substituir `console.*` nos services | `apps/api-gateway/src/services/`, `apps/api-gateway/src/utils/` | 1h |
| 1.5 | Adicionar `pino` no Worker | `apps/worker-game-loop/src/services/logger.ts` | 1h |
| 1.6 | Substituir `console.*` no Worker | `apps/worker-game-loop/src/services/` (~30 ocorrencias) | 2h |
| 1.7 | Configurar `pino-pretty` em dev | `docker-compose.yml` / .env | 15min |

### Fase 2 — Error Tracking Frontend (~2 dias)

| # | Acao | Arquivos | Esforco |
|---|---|---|---|
| 2.1 | Adicionar `@sentry/react` no frontend | `apps/frontend/package.json` | 15min |
| 2.2 | Configurar Sentry.init + ErrorBoundary | `apps/frontend/src/main.tsx` | 1h |
| 2.3 | Adicionar Sentry no build CI (source maps) | `.github/workflows/build-push.yml` | 1h |
| 2.4 | Adicionar `captureException` em catch blocks criticos | hooks de auth, purchase, slow reveal | 1h |
| 2.5 | Sentry na Landing Page (minimo) | `apps/landing-page/app/root.tsx` | 30min |
| 2.6 | Verificar erros no Sentry dashboard | — | 15min |

### Fase 3 — Alertas Grafana (~1 semana)

| # | Acao | Arquivos | Esforco |
|---|---|---|---|
| 3.1 | Criar estrutura de alertas como codigo | `infra/grafana/alerting/` (novo) | 1h |
| 3.2 | Alertas Worker: parado, DLQ, RTP, oraculo | `infra/grafana/alerting/worker-critical.json` | 2h |
| 3.3 | Alertas API: 5xx > 1%, latencia p99 > 5s | `infra/grafana/alerting/api-critical.json` | 1h |
| 3.4 | Alertas Chain: block height, oracle timeout | `infra/grafana/alerting/chain-critical.json` | 1h |
| 3.5 | Notificadores: Slack + Email | `infra/grafana/alerting/notifiers.json` | 30min |
| 3.6 | Worker health check completo (+Mongo, +PG, +chain) | `apps/worker-game-loop/src/services/metrics.ts` | 1h |
| 3.7 | Testar alertas (matar servico, verificar disparo) | — | 1h |

### Fase 4 — OpenTelemetry Tracing (~1 semana)

| # | Acao | Arquivos | Esforco |
|---|---|---|---|
| 4.1 | Setup OTel SDK no API Gateway | `apps/api-gateway/src/services/tracing.ts` | 2h |
| 4.2 | Instrumentar Express + HTTP | `apps/api-gateway/src/middleware/tracing.ts` | 1h |
| 4.3 | Setup OTel SDK no Worker | `apps/worker-game-loop/src/services/tracing.ts` | 2h |
| 4.4 | Instrumentar amqplib (RabbitMQ) | integracao no worker | 2h |
| 4.5 | Configurar export OTLP (Jaeger/Grafana Tempo) | `docker-compose.yml` + config | 1h |
| 4.6 | Adicionar dashboard de tracing no Grafana | `infra/grafana/dashboards/tracing.json` | 1h |
| 4.7 | Testar tracing ponta-a-ponta (comprar cartela → worker → chain) | — | 1h |

### Fase 5 — Longo Prazo (2-4 semanas)

| # | Acao | Prioridade |
|---|---|---|
| 5.1 | Loki + Grafana Alloy (sucessor Promtail) para agregacao centralizada de logs | Media |
| 5.2 | Web Vitals / RUM no frontend (via GA4 ou Sentry) | Media |
| 5.3 | Observabilidade minima na Swap UI (health + logger) | Baixa |
| 5.4 | Landing Page: logs estruturados na API Functions | Baixa |
| 5.5 | ADR de Observabilidade documentando stack completa | Media |

---

## 5. Metricas de Sucesso (SLOs)

### SLIs Propostos

| SLO | Target | Metrica | Fase |
|---|---|---|---|
| Disparo de eventos do Worker | 99.9% | `worker_events_failed_total` == 0 | 1 |
| Erros HTTP API Gateway | <1% 5xx | `api_http_requests_total{status=~"5.."}` | 1 |
| Latencia P99 API Gateway | <3s | `api_http_request_duration_ms` | 1 |
| DLQ size | <10 acumulado no ultimo 5min | `worker_events_dead_lettered_total` | 3 |
| RTP | 80-90% no rolling 7d | `worker_prize_rtp_ratio` | 3 |
| Oracle ativo | last_response < 60s | polling oracle duration | 3 |
| Erros nao capturados (frontend) | 0 | Sentry `captureException` | 2 |
| Tracing coverage | >90% requests rastreaveis | OTel spans | 4 |

---

## 6. Custo Estimado (infra adicional)

| Componente | Tipo | Custo/mes |
|---|---|---|
| Sentry (Team plan) | SAAS | ~$26/mes |
| Grafana Tempo (cloud) ou Jaeger self-hosted | Self-hosted via Docker | $0 (existente) |

---

## 7. ADR (proposto)

Criar ADR-043 documentando a stack de observabilidade:
- Logger: pino (Node 22+ otimizado)
- Error tracking: Sentry (React 19 + SSG)
- Tracing: OpenTelemetry (Express + amqplib)
- Alertas: Grafana Alerting (provisionado como codigo)
- Logs centralizados: Loki (futuro)

---

## 8. Processos Obrigatorios

Toda implementacao segue os processos definidos em `CLAUDE.md` e `docs/MASTER-PROMPT.md`:

### TDD (RED→GREEN→refactor)
- Teste unitario primeiro para cada novo modulo (logger, tracing)
- Teste de integracao para health checks e alertas
- Implementacao minima para passar o teste

### SonarQube
- Rodar `sonarqube_analyze_code_snippet` em cada `.ts` modificado antes do commit
- Blocker/critical/major corrigidos antes do commit
- Minor aceitavel com justificativa

### Git Flow
- Cada fase em branch separada de `develop` (ex: `feature/observability-pino`, `feature/observability-sentry`)
- PR para `develop` com template `.github/PULL_REQUEST_TEMPLATE.md`
- Pre-PR: typecheck + testes verdes
- NUNCA commit direto em `develop`/`master`

### ADR
- `docs/adr/ADR-043-observabilidade.md` documentando stack (pino, Sentry, OTel, Grafana Alerting)
- Atualizar `CLAUDE.md` com novos servicos/configuracoes

### RAG e Contexto
- Usar `mcp-rag_search` para consultar metricas existentes, padroes de logging, health checks atuais
