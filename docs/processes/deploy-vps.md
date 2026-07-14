# Processo de Deploy — CryptoBingo Testnet (VPS via GHCR)

Este documento é a fonte única de verdade para publicar e implantar as imagens de testnet.
Segue o padrão do repo: `feature/*` → PR → merge develop → CI publica GHCR → VPS faz pull/up.

## 0. Pré-requisitos (ambiente do operador)
- WSL com `gh` autenticado (`gh auth status` → logado como iurineumann; PAT com `read:packages`+`repo`).
- Acesso SSH ao VPS (`ssh vps`).
- Token GHCR registrado no RAG (`agent://infra/credentials/ghcr-github-pat`).
- VPS com Docker + rede `cb-back`(internal) + `cb-front` + nginx já configurados.

## 1. Fluxo de código (GitHub)
1. Criar branch: `git checkout -b feature/<escopo>`.
2. Implementar e commitar (mensagens em pt-BR, imperativo).
3. `git push -u origin feature/<escopo>`.
4. Abrir PR para `develop` (base). Título e descrição claros; referenciar issue se houver.
5. PR review (pelo menos 1 aprovação / ou dono). Merge **squash** para `develop`.
6. **NÃO** fazer merge direto em `develop` sem PR.

## 2. CI — Publicar imagens no GHCR (automático em push em develop)
O `.github/workflows/build-push.yml` (ou equivalente) executa em `push` para `develop`:
- `resolve-env`: mapeia branch → ambiente (`develop` → `testnet`).
- `build`: para CADA app (landing-api, api-gateway, worker-game-loop, oracle-daemon):
    - `docker build -f apps/<app>/Dockerfile -t ghcr.io/iurineumann/cryptobingo-<app>:testnet .`
    - `docker tag ...:testnet ...:<sha>` (tag imutável por commit)
    - `docker push` das duas tags.
- As 4 imagens ficam em `ghcr.io/iurineumann/cryptobingo-{landing-api,api-gateway,worker-game-loop,oracle-daemon}`.
- Tag `testnet` = "última de develop" (rolling). Tag `<sha>` = reprodutível/rollback.

## 3. CD — Implantar no VPS (manual, após merge)
No VPS (via `ssh vps`):
```bash
# 3.1 Autenticar no GHCR (usa o PAT do gh; refresca se expirado)
echo "$(gh auth token)" | docker login ghcr.io -u iurineumann --password-stdin

# 3.2 Ir ao diretório de deploy
cd /opt/cryptobingo

# 3.3 Puxar imagens novas (rolling tag testnet)
docker compose pull landing-api api-gateway worker-game-loop oracle-daemon

# 3.4 Recriar só os serviços alterados (zero-downtime se healthcheck ok)
docker compose up -d landing-api api-gateway worker-game-loop oracle-daemon

# 3.5 Validar health de cada um
docker compose ps
curl -fsS https://landing-api.cryptobingo.bet/api/health || echo "landing KO"
curl -fsS https://test-api.cryptobingo.bet/api/v1/health || echo "api-gw KO"
```
O `docker-compose.yml` do VPS já tem `restart: unless-stopped`, `healthcheck`, redes `cb-back`/`cb-front`,
e senhas dos datastores via env (nunca hardcoded no repo).

## 4. Rollback
- App específico: `docker compose up -d <app> --scale <app>=0` e subir tag `<sha>` anterior:
  `docker compose up -d <app>` apontando para `ghcr.io/.../<app>:<sha-anterior>`.
- Ou `docker tag <sha-anterior> ...:testnet && docker compose up -d <app>`.

## 5. Datastores (não vêm do GHCR)
- postgres/mongo/redis/rabbitmq: imagens oficiais, senhas em RAG, volumes persistentes.
- Alteração de schema/seed: script idempotente em `/opt/cryptobingo/db/`, versionado no repo.
- Backup: `rclone` → R2 (`/opt/cryptobingo-backup/backup.sh`, cron 0 3 * * *). Validar mensalmente.

## 6. Validação pós-deploy (smoke test obrigatório)
- [ ] `docker compose ps` → todos "healthy"/"Up".
- [ ] landing-api HTTPS 200 (`/api/health`, `/api/stats`).
- [ ] api-gateway HTTPS 200 (`/api/v1/health`, `/api/v1/rooms`).
- [ ] worker log sem crash; RabbitMQ fila consumindo.
- [ ] oracle-daemon log sem erro; ORNG respondendo.
- [ ] Sem erro CORS no console do navegador (frontend SWA → test-api VPS).
- [ ] Firewall: portas 5432/27017/6379/5672 NÃO expostas à internet (só rede interna).

## 7. Deleção de recursos Azure (após validação total no VPS)
- `az containerapp delete -n api-gateway -g cryptobingo-testnet`
- `az containerapp delete -n worker-game-loop -g cryptobingo-testnet`
- `az containerapp delete -n oracle-daemon -g cryptobingo-testnet`
- `az containerapp env delete -n cryptobingo-env -g cryptobingo-testnet` (se não usado por SWA)
- Manter Static Web Apps (frontend, swap-ui) e o Resource Group se necessário.

## 8. RAG (registrar sempre)
- Token GHCR, senhas de datastore, IPs, DNS, decisões de arquitetura → RAG local.
- Todo ajuste de senha/token atualiza o RAG (regra do dono: "não ter mais problemas de interpretação").

## 9. Deploy do Landing-Page (Static Web App — blog, separado dos containers)
O landing-page (blog) é Azure Static Web Apps, NÃO container Docker. Build é SSG
(`ssr:false` + prerender) e depende do **submodule `content/`** (cryptobingo-tina.git),
que tem o `content/slugs.json` (slugs dinâmicos ADR-040).

### 9.1 Pré-requisitos
- GitHub Actions BLOQUEADAS em free tier → deploy é **MANUAL** (o `.github/workflows/deploy-landing.yml`
  NÃO roda; serve só de configuração para quando habilitarem Actions).
- `swa` CLI instalado; Azure CLI logado; token em `SWA_DEPLOY_TOKEN_LANDING`.

### 9.2 Passo obrigatório: submodule
Sem o submodule, o build FALHA (RRv7.18.1): `content/slugs.json` ausente →
`loadSlugsIndex()` lança erro claro (`[react-router.config] content/slugs.json AUSENTE …
git submodule update --init --recursive`). O `react-router.config.ts` tem esse guard
desde fix/300 (PR #307).

### 9.3 Comando (script manual)
```bash
bash scripts/deploy-landing.sh
```
O script faz: `git submodule update --init` (obrigatório) → `pnpm build` (gera HTML
estático + `build/client/sitemap.xml` com slugs traduzidos do slugs.json) → `swa deploy`.

### 9.4 Validação pós-deploy
- [ ] `/blog` e uma postagem individual (`/en/blog/<slug-traduzido>`) retornam HTML pré-renderizado.
- [ ] `sitemap.xml` lista slugs traduzidos (ex: `/en/blog/crypto-wallets`), não canônicos.
- [ ] `scripts/validate-vps-health.sh` sem erro (rotas da landing-api no VPS).

### 9.5 Notas de arquitetura (ADR-040 / A1-ssg-routing)
- Slugs de blog/tutorial/page vêm do `content/slugs.json` (`{type:{canonicalId:{locale:slug}}}`),
  NÃO dos nomes dos arquivos `.md`. O sitemap (`generate-sitemap.mjs`, fix/304 PR #305)
  e o prerender (`react-router.config.ts`) leem a MESMA fonte → URLs alinhadas.
- `zh` mantém slug canônico (URL zh usa slug pt); `en` traduzido.
