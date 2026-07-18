# Deploy — Pinax Firehose no Worker (VPS)

Este documento descreve como habilitar o **Pinax Firehose** (fonte de eventos
on-chain em tempo real do engine event-driven, Fase B/B0) no `worker-game-loop`
rodando na **VPS Contabo**. O worker NÃO roda em Azure — só o SWA (frontend) usa
Azure. Toda a stack de backend está na VPS via Docker Compose.

> Pré-requisito: worker já deployado na VPS. Veja `docs/processes/deploy-vps.md`.

## 1. Obter a API Key (Pinax)

A credencial está registrada no RAG interno (não expor publicamente):

```
RAG: agent://secrets/pinax-credentials-cryptobingo
  Projeto: cryptobingo
  API Key: <PINAX_KEY>  (header X-Api-Key no gRPC Firehose)
  Endpoint testnet: waxtest.firehose.pinax.network:443
  Endpoint mainnet: wax.firehose.pinax.network:443
```

Free tier generoso para testnet (tail em tempo real ~poucos blocos/s).

## 2. Configurar o `.env` na VPS

O `docker-compose.yml` injeta `env_file: apps/worker-game-loop/.env` no container
do worker. Edite o arquivo **real** na VPS (não commitado):

```bash
# na VPS, dentro de /opt/cryptobingo (ou onde o compose roda)
nano apps/worker-game-loop/.env
```

Adicione:

```dotenv
# Firehose gRPC (event-driven)
PINAX_KEY=<cole-a-key-do-RAG-aqui>

# Opcional — tem default na testnet
# HYPERION_URL=https://testnet.waxsweden.org
```

`HYPERION_URL` é o fallback REST e já tem default (`https://testnet.waxsweden.org`);
só defina se precisar de outro endpoint.

## 3. Reiniciar o worker

Opção A — só restart do container (key já está na imagem atual):

```bash
cd /opt/cryptobingo
docker compose up -d worker-game-loop
```

Opção B — nova imagem GHCR (se o `contractEventClient` mudou):

```bash
cd /opt/cryptobingo
docker compose pull worker-game-loop
docker compose up -d worker-game-loop
```

## 4. Verificar

```bash
docker compose logs -f worker-game-loop
```

- Com `PINAX_KEY` válida: logs de conexão/stream do Firehose (eventos `bingogamectr`).
- Sem key / key inválida: `PINAX_KEY não configurada — usando Hyperion fallback.`
  (warn, não erro fatal — o worker continua via Hyperion).

## 5. Observabilidade

O dashboard **"Engine Event-Driven"** (criado em A0, em
`infra/grafana/dashboards/engine-event-driven.json`) mostra
`worker_queue_published_total` / `worker_events_processed_total` alimentados
pelo State Watcher (B1) consumindo este cliente.

## 6. Rotação de Key

1. Gere/substitua a key no painel Pinax.
2. Atualize `apps/worker-game-loop/.env` na VPS com a nova `PINAX_KEY`.
3. `docker compose up -d worker-game-loop`.

O RAG `agent://secrets/pinax-credentials-cryptobingo` também possui o JWT de API
REST (válido até ~2036) — usar apenas se necessário para a API REST do Pinax,
não para o Firehose gRPC (que usa só a API Key).
