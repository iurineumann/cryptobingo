# ADR-060 — Migrar 3 Static Web Apps (SWA) da Azure para static no nginx da VPS

## Status
Proposta (2026-07-27). Errata/extensão da ADR-054 (Migração completa Azure → VPS, 2026-07-13).

## Contexto
A ADR-054 trouxe tudo que era server-side para a VPS Contabo, mas **manteve propositalmente**
os 3 Static Web Apps na Azure: `cryptobingo-frontend`, `cryptobingo-landing`, `cryptobingo-swap-ui`
(razão original: "$0, edge performance"). Na prática:

- O Azure SWA free tier é $0 e **não consome hardware nosso** — migrar NÃO recupera recurso de
  máquina. O benefício é operacional, não de capacidade.
- A VPS hoje (evidência viva 2026-07-27): 7.8 GiB RAM, **~1.7 GiB em uso** (21 containers),
  **5.2 GiB livre**, load 0.3, 114 GB disco livre. Absorve os 3 static com folga
  (~50-100 MB via volume nginx, sem processo Node extra — landing é SSG, frontend/swap-ui são
  SPA servidos como arquivos estáticos).
- O `cryptobingo-nginx` já escuta 80/443, já tem Let's Encrypt wildcard `*.cryptobingo.bet`
  (SAN confirma: `DNS:*.cryptobingo.bet DNS:cryptobingo.bet`), já proxya landing-api/test-api/metrics.

O que muda ao trazer os SWA para a VPS:
- **Fim da dependência Azure** (painel, token `SWA_DEPLOY_TOKEN_*`, Azure CLI, `swa` CLI).
- **Deploy unificado**: `pnpm build` em worktree `/tmp` limpo → `rsync` do `dist/`/`build/client`
  para `/opt/cryptobingo/static/<app>` (volume host montado no nginx) → pronto. Sem credencial Azure.
- **Tudo num só lugar** (build, deploy, backup R2, firewall). Coerência com a ADR-054.
- **Edge CDN mantido**: Cloudflare já faz proxy na frente de `*.cryptobingo.bet` (proxy ON). Não
  perde cache de borda — só troca a origem SWA por origem nginx-VPS.

## Decisão
1. Servir os 3 frontends como **arquivos estáticos no `cryptobingo-nginx` existente** (Opção 1 da
   discussão), via volume host `/opt/cryptobingo/static/{frontend,landing,swap-ui}`. NÃO criar
   container extra, NÃO rebuildar imagem nginx a cada deploy (deploy = rsync do worktree → volume).
2. **Manter o modelo de render de cada app** (sem re-arquitetura):
   - `landing-page` = **SSG** (Astro prerender + React Router islands). `build/client/` estático.
     `301 /` → `/en/`, `navigationFallback` → `/en/index.html`, `Cache-Control` por tipo.
   - `frontend` = **SPA** (Vite). `dist/` + `try_files $uri /index.html` + WebSocket upgrade
     (map já existe no nginx). CSP vem de `staticwebapp.config.json` → headers nginx.
   - `swap-ui` = **SPA** (Vite). Igual frontend. (Não tem `staticwebapp.config.json` próprio hoje →
     herdará a CSP do frontend como baseline, já validada por `scripts/validate-csp.sh`.)
3. **CSP transposta** para o nginx (não perdida): copiar o `Content-Security-Policy` + headers
   (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`)
   dos `staticwebapp.config.json` dos apps para `add_header` nos server blocks. Manter os **4 presets
   RPC** no `connect-src` do frontend (`waxtestnet.greymass.com`, `wax-testnet.eosphere.io`,
   `testnet.waxsweden.org`, `testnet.wax.eosusa.io`) — validado por `scripts/validate-csp.sh`.
4. **Ordem de cutover (risco crescente)**: landing-page → frontend → swap-ui. Cada um com janela de
   validação própria; rollback = apontar DNS/CNAME de volta ao SWA (ou manter SWA como fallback até
   confirmar).
5. **Remover os scripts `swa deploy`** (`scripts/deploy-frontend.sh`, `scripts/deploy-landing.sh`) ou
   substituí-los por `scripts/deploy-static-vps.sh` (build + rsync + `nginx -s reload`). Manter o
   gate `validate-csp.sh` no novo fluxo.

## Consequências
- Azure fica **zerada** para o projeto cryptobingo (sem SWA, sem Container Apps, sem Functions).
- Deploy de frontend/landing/swap-ui passa a exigir acesso SSH à VPS (`rsync` + `nginx -s reload`),
  não mais Azure CLI. GitHub Actions já está desligado — build é local (WSL) em worktree `/tmp`.
- Rollback por DNS (re-CNAME para SWA) ou por `rsync` do `dist/` anterior (versionar o diretório
  estático com timestamp/symlink).
- Nenhum ganho de RAM/CPU na Azure (já era $0); ganho é operacional + eliminação de segredo Azure.
- landing-page SSG exige submodule `content` inicializado no worktree de build
  (`git submodule update --init`) — ver pitfall do skill de build/test.

## Alternativas consideradas
- **Manter SWA (ADR-054 original)**: rejeitado agora — a dependência Azure + token de deploy pesa
  mais que o "edge" (Cloudflare já é a borda). SWA free tier não dá vantagem real sobre nginx+VPS.
- **Imagem Docker por app (multi-stage)**: rejeitado — rebuild de imagem a cada deploy de conteúdo
  estático é overhead; volume host + rsync é mais simples e idempotente.
- **SSR para landing/frontend**: rejeitado — landing é conteúdo raro (SSG ótimo); frontend/swap-ui
  são SPA ao vivo (SSR só agregaria runtime custo + complexidade, zero benefício de UX).

## Referências
- ADR-054 (migração server-side Azure→VPS)
- ADR-053 (landing-api VPS Docker+nginx)
- Plano de implantação: `.hermes/plans/2026-07-27_191420-swa-to-vps-static.md`
- Skill `cryptobingo-infra-ops` (topologia VPS, firewall, nginx)
- Skill `cryptobingo-build-test-validation` (build em worktree `/tmp` limpo, pitfall submodule)
- Evidência VPS: `free -h` (1.7/7.8 GiB), `docker stats`, cert SAN `*.cryptobingo.bet`
