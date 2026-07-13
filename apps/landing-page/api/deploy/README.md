# Deploy landing-api no VPS

## Pré-requisitos

- VPS Contabo (13.140.172.222) com Docker Compose
- Rede Docker `cryptobingo` já existente (compartilhada com postgres/mongo/redis)
- `SMTP_PASS` configurado no Postfix do VPS

## Deploy manual

```bash
# 1. No VPS, clonar ou copiar o diretório deploy/
cd /opt/cryptobingo/landing-api

# 2. Criar .env (copiar de .env.example e preencher SMTP_PASS)
cp .env.example .env

# 3. Build da imagem
docker compose build

# 4. Subir serviços
docker compose up -d

# 5. Verificar logs
docker compose logs -f
```

## Estrutura

| Serviço | Imagem | Portas | Rede |
|---------|--------|--------|------|
| landing-api | `cryptobingo-landing-api:latest` (build local) | — | cryptobingo (internal) |
| caddy | `caddy:2` | 80, 443 | cryptobingo |

## Env vars

| Var | Descrição |
|-----|-----------|
| `DATABASE_URL` | Postgres connection string (rede Docker interna, sem SSL) |
| `SMTP_HOST` | Servidor SMTP (mail.cryptobingo.bet) |
| `SMTP_PORT` | Porta SMTP (587) |
| `SMTP_USER` | Usuário SMTP (cryptobingo) |
| `SMTP_PASS` | Senha SMTP **(preencher no .env)** |
| `SMTP_SENDER` | Remetente (contact@cryptobingo.bet) |
| `ADMIN_EMAIL` | E-mail admin para login (admin@cryptobingo.bet) |
| `GATEWAY_URL` | API gateway para stats de jogos |
| `PORT` | Porta interna (8080) |

## Health check

```bash
curl https://landing-api.cryptobingo.bet/api/health
# → {"status":"ok"}
```

## Domínio

`landing-api.cryptobingo.bet` — Cloudflare proxy (SSL automático). Caddy gerencia certificado Let's Encrypt.
