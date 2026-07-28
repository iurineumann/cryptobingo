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
- `az containerapp delete -n api-gateway -g cryptobingo-testnet` (já migrado p/ VPS)
- `az containerapp delete -n worker-game-loop -g cryptobingo-testnet` (já migrado p/ VPS)
- `az containerapp delete -n oracle-daemon -g cryptobingo-testnet` (já migrado p/ VPS)
- `az containerapp env delete -n cryptobingo-env -g cryptobingo-testnet`
- **Frontend/landing/swap-ui migrados de SWA → static no nginx VPS (ADR-060).** Após validar
  origem VPS (§9.6), deletar as 3 Static Web Apps:
  - `az staticwebapp delete -n cryptobingo-frontend -g cryptobingo-testnet`
  - `az staticwebapp delete -n cryptobingo-landing -g cryptobingo-testnet`
  - `az staticwebapp delete -n cryptobingo-swap-ui -g cryptobingo-testnet`
- Azure ZERADO para o projeto cryptobingo após isso.

## 8. RAG (registrar sempre)
- Token GHCR, senhas de datastore, IPs, DNS, decisões de arquitetura → RAG local.
- Todo ajuste de senha/token atualiza o RAG (regra do dono: "não ter mais problemas de interpretação").

## 9. Deploy dos 3 Frontends (Static no nginx VPS — ADR-060)
landing-page (SSG), frontend (SPA) e swap-ui (SPA) são servidos como **arquivos estáticos**
pelo `cryptobingo-nginx` (rede `cb-front`), montando o volume
`/opt/cryptobingo/static:/usr/share/nginx/static:ro`. CSP transposta de
`staticwebapp.config.json` para `add_header` em `infra/nginx/apps.conf`.

### 9.1 Pré-requisitos
- GitHub Actions BLOQUEADAS → build é **MANUAL** em worktree `/tmp` limpo (skill build-test).
- `ssh vps` configurado; nginx com volume static montado (apps-compose.yml VPS).
- landing-page SSG depende do **submodule `content/`** (cryptobingo-tina.git, `slugs.json`).

### 9.2 Comando (script manual unificado)
```bash
bash scripts/deploy-static-vps.sh <landing|frontend|swap-ui> [--no-build]
```
O script faz: `git submodule update --init` (landing) → `pnpm build` → gate CSP
(`validate-csp.sh`, frontend/swap-ui/landing) → rsync build → `/opt/cryptobingo/static/<app>`
→ `docker exec cryptobingo-nginx nginx -s reload`.

### 9.3.1 Gate de CSP pós-deploy (`pnpm run validate:csp`)
`scripts/validate-csp.sh` valida que o **header CSP SERVIDO EM PRODUÇÃO** está
conforme o esperado (SWA parity + ajustes: clarity/bing/unsplash/google-analytics).
Ele faz `nginx -t` no container VPS e checa `img-src`/`script-src`/`connect-src`
contra uma lista de domínios esperados. Falha o deploy se faltar domínio.
Uso: `pnpm run validate:csp` (ou `CSP_URL=https://test.cryptobingo.bet pnpm run validate:csp`).
Sem acesso ao VPS/SSH, use `SKIP_NGINX_T=1` para validar só o header.

### 9.3.2 Caveat: bind mount obsoleto do nginx
Se após `rsync` + `nginx -s reload` o header CSP servido continuar ANTIGO, o
container `cryptobingo-nginx` pode estar servindo um `apps.conf` obsoleto (o bind
mount nem sempre reflete a substituição do inode pelo rsync). Sintoma: `grep` no
host mostra o novo domínio, mas `docker exec ... grep` no container não. Correção:
recriar o container para remontar o volume:
```bash
ssh vps "docker stop cryptobingo-nginx && docker rm cryptobingo-nginx && \
docker run -d --name cryptobingo-nginx --network cryptobingo_cb-front \
  -p 80:80 -p 443:443 \
  -v /opt/cryptobingo/nginx/apps.conf:/etc/nginx/conf.d/apps.conf:ro \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  -v /opt/cryptobingo/static:/usr/share/nginx/static:ro \
  nginx:1.31-alpine"
```
Depois: `pnpm run validate:csp` para confirmar.

### 9.3 Build dir por app
- landing → `apps/landing-page/build/client`
- frontend → `apps/frontend/dist`
- swap-ui → `apps/swap-ui/dist`

### 9.4 Validação pós-deploy (por app)
- [ ] `curl -sI https://<domain> | grep -i content-security-policy` → header presente.
- [ ] `curl -s https://<domain>/ | grep -i "localhost"` → vazio (sem VITE_* dev).
- [ ] landing: `curl -sI https://cryptobingo.bet/ | grep -i location` → `301 → /en/`.
- [ ] frontend: WebSocket `wss://test.cryptobingo.bet` conecta; 4 presets RPC no `connect-src`.
- [ ] swap-ui: swap funciona no browser.

### 9.5 Notas de arquitetura (ADR-040 / ADR-060)
- Slugs de blog/tutorial vêm do `content/slugs.json` (submodule). Sitemap + prerender leem a mesma fonte.
- `zh` mantém slug canônico; `en` traduzido.
- CSP do swap-ui herda baseline do frontend (swap-ui não tem `staticwebapp.config.json` próprio).

### 9.6 Cutover DNS (Cloudflare)
Origem SWA → origem VPS: o domínio já aponta `*.cryptobingo.bet` (Cloudflare proxy ON).
Como o nginx VPS já responde pelos 3 domínios (cert wildcard), o cutover é transparente —
basta confirmar a origem servindo (curl com Host header) antes de confiar. SWA mantido como
fallback até validar; depois deletar (§7).
