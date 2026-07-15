# ADR-054 — Migração completa Azure → VPS (testnet)

## Status
Proposta (2026-07-13). Substitui ADR-035 (infra Azure CD testnet) para o escopo server-side.

## Contexto
A landing-api já roda no VPS (ADR-053). Decisão de 2026-07-13: trazer TODOS os componentes server-side
(api-gateway, worker-game-loop, oracle-daemon, e os datastores Mongo/Redis, mais RabbitMQ) do Azure para o
VPS Contabo, mantendo só Static Web Apps (frontend + swap-ui) na Azure (sem custo, edge performance).

Motivos:
- **Desempenho**: api-gateway/worker/oracle conversam intensamente com PG/Mongo/Redis. Colocados no mesmo
  Docker host, a latência cai de ~20-40ms (Azure→VPS via internet) para <1ms (rede Docker interna).
- **Custo**: elimina Container Apps (consumption) e o vetor de ataque Azure→VPS que causou o ransomware
  de 2026-07-12 (IPs Azure WestUS atacaram o Mongo exposto).
- **Coerência**: um só lugar para operar, backup (R2) e firewall.
- **Comunidade**: testnet mais acessível, sem dependência de Azure.

## Decisão
1. **Tudo server-side no VPS Docker**, em 2 redes: `cb-back` (internal, só datastores) e `cb-front`
   (nginx + apps expostos ao proxy). nginx termina TLS e roteia `landing-api.*` e `test-api.*`.
2. **RabbitMQ no VPS** (era CloudAMQP externo) — latência menor para o worker.
3. **Imagens via GHCR** (mantém CI/CD coerente): GitHub Actions build-push em develop → GHCR; VPS faz
   `docker login ghcr.io` (PAT) + `docker compose pull && up`. Processo em `docs/processes/deploy-vps.md`.
4. **Datastores com senhas fortes** (geradas 2026-07-13, em RAG), SCRAM-SHA-256 (PG/Mongo), ACL (Redis),
   rede interna (sem porta publicada), firewall INPUT restritivo no host.
5. **Mongo recriado** com nova senha + restore do backup R2 `mongo-20260713-030001.archive.gz`.
6. **Deletar** Container Apps api-gateway/worker/oracle-daemon e o consumption plan após validação.

## Consequências
- Azure fica só com Static Web Apps (custo $0).
- VPS é o único ponto de falha (mitigado por backup R2 + firewall + imagens GHCR reproduzíveis).
- Rollback de app = `docker compose` com tag anterior do GHCR.

## Alternativas consideradas
- Manter api-gateway/worker na Azure (free tier): rejeitado — superfície de ataque Azure→VPS e latência.
- k3s em vez de Docker Compose: rejeitado — overhead desnecessário num único nó de 8GB.
