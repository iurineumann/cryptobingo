# ADR 050: Deploy do Oracle Daemon via GHCR + Azure Container Apps

## Status
Aceito

## Contexto
O ADR-049 parametrizou o contrato para usar uma conta de oráculo configurável (`setoracle`) e preparou o daemon `orng-oracle.ts` para operar a conta `bingogamerng` na testnet. Ficou pendente a ETAPA 6: hospedar o daemon de forma operacional (sempre ativo, observável, com telemetry App Insights).

A ETAPA 6 foi inicialmente planejada como **VM B1s** (Azure, free tier). Porém, ao consultar o RAG (ADR-035, discovery 2026-07-09) e o estado atual do RG `cryptobingo-testnet`, descobriu-se que:
1. O projeto **já usa Azure Container Apps** (`cryptobingo-env`, westus) para `api-gateway` e `worker-game-loop` — o padrão de orquestração do repo.
2. O registry de imagens do repo é o **GHCR** (`ghcr.io/iurineumann/cryptobingo-<app>`), via `.github/workflows/build-push.yml` (GitHub Actions, não ACR pago).
3. A tentativa de criar a VM B1s falhou por um bug de transporte da Azure CLI no ambiente (WSL/proxy), confirmando que VM não é o caminho do repo.

Além disso, o repo é **privado** no GitHub → imagem GHCR também privada → o Container App consome via registry credential (padrão ADR-035: `az containerapp registry set --server ghcr.io --username iurineumann --password <pat>`).

## Decisão
1. **Container App, não VM:** o daemon `oracle-daemon` roda como Azure Container App no `cryptobingo-env` (westus), no consumption plan (free tier efetivo). Recursos: 0.25 vCPU / 0.5Gi, 1 réplica.
2. **GHCR como registry:** imagem `ghcr.io/iurineumann/cryptobingo-oracle-daemon:testnet`, buildada localmente e pushada via `docker login ghcr.io` com o token do `gh` (scope `write:packages`). CI (build-push.yml) replica o build/push no merge em `develop`.
3. **Dockerfile isolado:** `apps/oracle-daemon/Dockerfile` (Node 20-slim) compila o `scripts/orng-oracle.ts` para `dist/` no build (`tsc`) e roda com `node dist/orng-oracle.js` — sem ts-node em runtime (evita problemas de tsconfig/moduleResolution em runtime).
4. **Secrets via Container App:** `ORNG_WAX_KEY` (bingogamerng) e `ORNG_RSA_PRIVATE_KEY` (PEM dev inline) são secrets do Container App, referenciados como `secretref:` nas env vars. Não bakeados na imagem.
5. **App Insights:** `cryptobingo-oracle` (eastus, free tier 5GB) recebe telemetria via `APPLICATIONINSIGHTS_CONNECTION_STRING`.
6. **CI integrado:** `build-push.yml` inclui `oracle-daemon` na matrix de build/push e no job `deploy-testnet` (com `secretref` para as chaves sensíveis).

## Consequências

### Positivas
* **Padrão do repo:** alinhado a `api-gateway`/`worker-game-loop` (Container Apps + GHCR + App Insights).
* **Free tier:** sem VM dedicada nem ACR pago; consumption plan cobra só o uso.
* **Observabilidade:** logs + métricas no App Insights `cryptobingo-oracle`.
* **CI/CD:** merge em `develop` rebuilda e redeploya o daemon automaticamente.
* **Segurança:** chaves sensíveis como secrets do Container App, não na imagem.

### Negativas / Trade-offs
* **Imagem privada:** depende de registry credential GHCR (PAT). Se o PAT expirar/rotacionar, o Container App para de puxar a imagem — exige renovação do secret `ghcrio-iurineumann`.
* **Imagem buildada localmente (não via Actions):** o deploy inicial foi manual (Actions desligado no repo). O `build-push.yml` cobre o caminho de CI, mas o estado atual da imagem no GHCR veio de build local.
* **Req artificial na tabela `reqs`:** um row de teste (`id=3`, `assoc_id=999`) ficou na tabela do `bingogamerng` e causa loop de erro "Game not found" nos logs. Inofensivo (o daemon descarta e segue), mas polui logs até ser limpo (requer jogo real ou ação de limpeza no contrato `orng`).

## Validação
* `docker run` local com env vars de testnet: daemon conecta, pollba `reqs`, assina RSA-PKCS1v15-SHA256, chama `setrand` (erro "Game not found" confirmou que a assinatura RSA passou a validação do contrato).
* Container App `oracle-daemon` provisionado (Succeeded) e processando `reqs` em produção.
* Tag de imagem atual: `testnet-1783701349` (digest `faf5a528...`).
