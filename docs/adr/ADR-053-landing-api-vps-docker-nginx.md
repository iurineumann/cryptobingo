# ADR 053: landing-api self-hosted no VPS (Docker + nginx, saída do Azure Functions)

## Status
Aceito

## Contexto
A landing-api (`apps/landing-page/api`) rodava como Azure Function App (Consumption, Node 22) + Aiven PostgreSQL (ADR-039). Em 2026-07-13 a Storage Account de backend do Function App (`cryptobingolandapi`) foi deletada por engano (Frente A de migração de custo), tornando o deploy do Functions impossível (status 3). Além disso, o VPS Contabo já hospeda Postgres/Mongo/Redis e o e-mail (Postfix), e o dono decidiu unificar a infra no VPS para eliminar custos Azure (Function App, Storage, Aiven) e reduzir latência (DB local em vez de Aiven/Frankfurt).

## Decisão
Migrar a landing-api de Azure Functions para **container Docker no VPS**, atrás de **nginx** (TLS Let's Encrypt já emitido para `cryptobingo.bet`). Os handlers existentes (`app.http` do `@azure/functions`) são reaproveitados via um **shim** (`azure-functions-shim.ts`) que emula a API com Express; em runtime o `require('@azure/functions')` é resolvido para o shim via `module-alias` (sem reescrever a lógica de negócio). Banco = Postgres do VPS (rede Docker `cryptobingo`, `postgres:5432/cryptobingo`), migrado de Aiven via `pg_dump|pg_restore`. SMTP = Postfix VPS (já migrado em ADR-052). DNS `landing-api.cryptobingo.bet` → VPS 13.140.172.222.

Decisão de proxy: **nginx** (e não Caddy, apesar de cogitado) porque o VPS já tinha nginx configurado com cert `cryptobingo.bet` e conf pronta para `landing-api.cryptobingo.bet`; reaproveitar evita retrabalho e conflito de porta 443.

## Consequências
- **Positivas**: elimina Function App + Storage Azure + Aiven (custo Azure só Container Apps core); latência de DB local (sub-ms vs Frankfurt); infra unificada no VPS; deploy manual via `docker compose` no VPS.
- **Negativas**: landing-api agora depende do VPS estar up (mesma dependência do PG/Mongo/Redis já no VPS); deploy não é mais Azure (sem GitHub Actions — deploy manual documentado em `deploy/README.md`).
- **Riscos**: se o VPS cair, landing-api + DB caem juntos (já era o caso do PG); mitigado por backup R2.

## Validação
- `npx tsc --noEmit` limpo (OpenCode).
- Container sobe (`landing-api listening on :8080`); `/api/stats` retorna JSON; `POST /api/subscribe` persiste + envia e-mail SMTP VPS.
- Teste externo `https://13.140.172.222/api/stats` (Host header) → HTTP 200 (firewall Contabo 443 OK).
- Migração de dados Aiven→VPS confirmada (1 subscriber, 0 ideas/votes — Aiven estava vazio de conteúdo).

## Deploy manual (VPS)
Ver `apps/landing-page/api/deploy/README.md`. Resumo: rsync código → VPS, `docker compose -f deploy/docker-compose.yml up -d` (services `landing-api` + `nginx`).
