# ADR-035 — CD Pipeline + Smoke Tests para Testnet

**Status:** Proposto
**Data:** 2026-06-26

---

## Problema

Build e push de imagens para GHCR está automatizado (`.github/workflows/build-push.yml`),
mas deploy no ambiente testnet (vcluster.cloud) é **manual**:

1. `infra/scripts/vcluster-testnet.sh` requer kubeconfig + CLUSTER_HOST
2. Secrets criados manualmente via `kubectl create secret`
3. Nenhuma validação automatizada pós-deploy
4. Nenhuma notificação se deploy quebra

Time descobre problemas só ao acessar a URL do testnet — sem barreira de qualidade
antes do merge em `develop`.

## Decisão

Adicionar pipeline de CD (Continuous Deployment) que, após build/push bem-sucedido em
`develop`, executa:

1. **Deploy automático** no cluster testnet via `kubectl apply -k`
2. **Smoke tests** (health + k6) contra o testnet recém-deployado
3. **Notificação** no canal do time (Slack) com resultado

### Fora de escopo (agora)

- CD para produção (`master`): mantém gatilho manual (PR + approval)
- Harness E2E on-chain em CI: depende de nodeos + oracle no pipeline (alto custo)
- Database migrations automatizadas: requer ferramenta tipo Flyway/Liquibase

## Pipeline completo

```
push develop → build:4 apps → push GHCR
                              ↓
                          deploy:testnet (kubectl apply -k overlays/testnet)
                              ↓
                       smoke:health + k6
                              ↓
                        notify:Slack ✅/❌
```

### Segurança

Deploy usa token efêmero do GitHub Actions + kubeconfig armazenado como secret
(`KUBECONFIG_TESTNET`). O kubeconfig é um secret do GitHub, nunca exposto em logs
ou artefatos.

Blindagem:
- **Dry-run primeiro:** `kubectl apply --dry-run=client -k` valida o manifesto antes
  de aplicar. Se falhar, o job aborta sem tocar no cluster.
- **Rollback on fail:** se smoke tests falharem, o script reverte para a imagem
  `testnet` anterior (que já estava rodando). Se for o primeiro deploy, apenas
  marca o job como falha.

### Tags e rastreabilidade

- `testnet-{sha}`: imagem imutável deste commit
- `testnet`: tag móvel, atualizada a cada deploy bem-sucedido
- `testnet-previous`: guarda a tag anterior para rollback rápido

## Implementação

### Job `deploy-testnet` (GitHub Actions)

```yaml
deploy-testnet:
  needs: build
  if: github.ref_name == 'develop' && github.event_name == 'push'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Setup kubectl
      run: |
        mkdir -p $HOME/.kube
        echo "${{ secrets.KUBECONFIG_TESTNET }}" | base64 -d > $HOME/.kube/config
    - name: Dry-run validate
      run: kubectl apply --dry-run=client -k infra/k8s/overlays/testnet
    - name: Patch image tags (SHA)
      run: |
        SHA=$(echo "${{ github.sha }}" | cut -c1-7)
        cd infra/k8s/overlays/testnet
        kustomize edit set image \
          cryptobingo/api-gateway=ghcr.io/iurineumann/cryptobingo-api-gateway:testnet-${SHA} \
          cryptobingo/worker-game-loop=ghcr.io/iurineumann/cryptobingo-worker-game-loop:testnet-${SHA} \
          cryptobingo/frontend=ghcr.io/iurineumann/cryptobingo-frontend:testnet-${SHA} \
          cryptobingo/swap-ui=ghcr.io/iurineumann/cryptobingo-swap-ui:testnet-${SHA}
    - name: Deploy
      run: kubectl apply -k infra/k8s/overlays/testnet
    - name: Wait rollout
      run: |
        kubectl rollout status deployment/api-gateway -n cryptobingo --timeout=180s
        kubectl rollout status deployment/worker-game-loop -n cryptobingo --timeout=180s
        kubectl rollout status deployment/frontend -n cryptobingo --timeout=180s
    - name: Rollback on failure
      if: failure()
      run: |
        kubectl rollout undo deployment/api-gateway -n cryptobingo
        kubectl rollout undo deployment/worker-game-loop -n cryptobingo
        kubectl rollout undo deployment/frontend -n cryptobingo
```

### Job `smoke-test` (GitHub Actions)

```yaml
smoke-test:
  needs: deploy-testnet
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Health check (API)
      run: |
        for i in $(seq 1 12); do
          STATUS=$(curl -s -o /dev/null -w '%{http_code}' https://${CLUSTER_HOST}/api/v1/health || true)
          if [ "$STATUS" = "200" ]; then echo "API OK"; break; fi
          sleep 10
        done
        [ "$STATUS" = "200" ]
    - name: k6 smoke test
      uses: grafana/k6-action@v0.3.1
      with:
        filename: tests/k6/smoke.js
        flags: --env API_URL=https://${CLUSTER_HOST}
    - name: k6 load test
      uses: grafana/k6-action@v0.3.1
      with:
        filename: tests/k6/load.js
        flags: --env API_URL=https://${CLUSTER_HOST}
```

> Nota: k6 action executa em container separado. O binário k6 oficial roda em
> Alpine e não depende de Node.js.

### Notificação

Usar `action-slack` ou `discord-webhook` no final do workflow:

```yaml
- name: Notify Slack
  uses: slackapi/slack-github-action@v1.24
  with:
    payload: |
      {
        "text": "${{ job.status == 'success' && '✅' || '❌' }} CD testnet: ${{ github.sha }}"
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_CD_WEBHOOK }}
```

### Preparação do cluster

Antes de ativar o CD automático:

1. **Kubeconfig**: exportar kubeconfig do vcluster.cloud, codificar em base64,
   salvar como `KUBECONFIG_TESTNET` no GitHub Secrets
2. **Secrets da aplicação**: `cryptobingo-secrets` (JWT_SECRET,
   MICROSERVICE_PRIVATE_KEY, senhas de banco) criados manualmente no cluster
   (uma vez, fora do pipeline)
3. **CLUSTER_HOST**: adicionar como variável de ambiente do GitHub
   (`vars.TESTNET_CLUSTER_HOST`)
4. **Conta WAX testnet**: `bingogamesvc` criada na testnet, com tokens
   `WAX` da faucet testnet, oracle registrado
5. **Contrato deployado**: `bingogamectr` e `bingogameswp` deployados na WAX
   testnet com as mesmas actions/permissions do ambiente dev

### Rollback

Três níveis:

| Nível | Gatilho | Ação | Tempo |
|---|---|---|---|
| Automático | Smoke test falha | `rollout undo` para tag `testnet-previous` | ~3 min |
| Manual | Bug em produção | Flux CD ou `kubectl set image` manual | ~1 min |
| DR | Cluster corrompido | Recriar do backup + restore banco | ~30 min |

### Operações pós-deploy

Após deploy bem-sucedido, ainda precisa de configuração **fora do pipeline**:
- Gametypes on-chain (criar via admin UI — upsert sincroniza)
- Salas ativas (criar via admin UI)
- Oracle daemon rodando (processo separado no cluster ou VM)

Estas são feitas uma vez (setup do ambiente), não a cada deploy.

## Consequências

### Positivas

- Testnet sempre atualizado com `develop` — time testa funcionalidades reais
- Smoke tests capturam regressão antes de PR para `master`
- Rollback automático reduz downtime

### Negativas

- Cluster testnet precisa de kubeconfig exposto no GitHub Secrets
- Pipeline mais longo (~8 min build + ~3 min deploy + ~2 min smoke)
- Custo do cluster testnet (vcluster.cloud) mesmo sem uso

### Riscos

- Deploy automático quebra testnet durante horário de trabalho → rollback automático
  cobre, mas notificação pode chegar tarde se ninguém monitora Slack
- WAX testnet RPC pode estar instável → health check falso-negativo
- k6 smoke test escasso (só health) — cobertura real virá com harness E2E

## Open Questions

1. **vcluster.cloud ou cluster próprio?** vcluster.cloud é gratuito para dev,
   mas tem limite de recursos. Se testnet precisar rodar oracle + nodeos, talvez
   precise de cluster maior (digitalocean/hetzner).
2. **Frequência do smoke test?** A cada push em develop (a cada PR merged).
   Se for muito frequente, reduzir para hourly.
3. **Monitoração passiva?** Além do CD, ter um cron que faz health check no
   testnet a cada 5 min e alerta se cair.
