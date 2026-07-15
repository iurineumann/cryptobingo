# Plano de Hardening & Coerência de Infra (2026-07-13)

## Contexto
Após migrar a landing-api para o VPS (Docker + nginx) e sofrer ransomware no MongoDB (2026-07-12, root cause: Mongo exposto sem auth + firewall frouxo), vamos reconfigurar toda a infra seguindo boas práticas atuais (jul/2026), mantendo **custo ~$0** (VPS Contabo + Azure Container Apps free tier + Cloudflare free + R2 free).

Recursos VPS: 8GB RAM, 4 vCPU, 145GB (135GB livre). Sobra folga.

## Decisão 1 — Orquestração: MANTER Docker Compose (não k3s)
Fundamento (buscas 2026): k3s single-node é viável, mas para ~7 containers num único nó o Compose é mais simples, idempotente (`up -d`), zero overhead de control plane, e já é o padrão do projeto. k8s agregaria cert-manager/CNI/ingress/secrets sem ganho real num nó. **Recomendação: Compose + hardening de container.**
Upgrade futuro (se crescer): k3s ou trazer tudo para Container Apps.

## Decisão 2 — Isolamento de rede (CRÍTICO p/ não repetir ransomware)
- **DBs (postgres/mongo/redis) em rede Docker `internal: true`**: sem acesso à internet, só alcançáveis por containers na mesma rede Docker (landing-api/api-gateway/worker quando no VPS, e nginx). Não publicar portas 5432/27017/6379 no host.
- **Firewall host (chain INPUT) restritiva**: policy DROP permitindo só 22 (SSH), 80/443 (web/nginx), 587 (SMTP submission). Estabelecidos + loopback liberados. (Hoje a INPUT é policy ACCEPT — lacuna.)
- **DOCKER-USER**: manter restrição atual (só redes privadas + Azure WestUS para 5432/27017/6379). Se trazer api-gateway/worker pro VPS, essa regra Azure pode ser relaxada/removida.
- **Cloudflare**: proxy ON em todos os subdomínios (ja é). Sem expor IP do VPS direto.

## Decisão 3 — Postgres (já tem scram-sha-256 ✅)
- Habilitar **SSL/TLS** (cert interno do VPS ou Let's Encrypt para `*.cryptobingo.bet` já emitido — reusar). `pg_hba.conf`: `hostssl` + `scram-sha-256` para todas as conexões remotas; `host` local para o container.
- **Roles least-privilege**: separar `cryptobingo` (app) de `postgres` (admin). `cryptobingo` só acesso ao banco `cryptobingo` (não superuser).
- **pgBouncer** (pool de conexões) em frente ao PG — melhora desempenho/escalabilidade e evita esgotar conexões (Container Apps abrem várias). Container `pgbouncer` na rede interna; apps conectam no pgbouncer:6432.
- Senha forte (32+ chars, sem `#`/`$`/`%`/`/`/`@`/`:` para evitar problemas de parser de URL).

## Decisão 4 — Mongo (SCRAM-SHA-256 + senha forte)
- Hoje: `--auth` ativo, user `appuser` com senha da remediação (não documentada no RAG/VPS → não dá para `changeUserPassword` sem saber a atual).
- **Recomendação**: recriar o container Mongo com `appuser` + **nova senha forte** (SCRAM-SHA-256) + restore do backup R2 (`mongo-20260712-165525.archive.gz` ou mais recente). Dados críticos (jogos/tickets/prêmios) estão on-chain WAX; metadados off-chain são restaurados do R2. Worker repovoa caches.
- Rede interna (sem expor 27017).
- (Alternativa: manter senha atual do Mongo e não torná-lo "coerente" — evita restore, mas fica fora do padrão.)

## Decisão 5 — Redis (ACL no lugar de só requirepass)
- Criar **usuário ACL dedicado** (`appuser` com senha forte, permissões apenas aos padrões usados) em vez de `requirepass` global.
- Rede interna. TLS opcional (interno) — para testnet, ACL + rede interna basta.
- Senha forte.

## Decisão 6 — Gestão de segredos
- **Prática ideal (2026)**: Azure Key Vault + managed identity no Container Apps. Custo ~irrisório (Key Vault ~$0.03/10k transações; segredos próprios baratos). Porém adiciona complexidade de setup.
- **Recomendação testnet**: manter secrets nos Container Apps (já criptografados em repouso) + versionar no RAG local (já fazemos, por sua regra). ANOTAR Key Vault como upgrade futuro quando sair de testnet.
- **Nunca** commitar segredos no git (`.env` já gitignored). Landing-api usa env do compose (não versionado);

## Decisão 7 — Container hardening (todos os containers)
- `read_only: true` rootfs + `tmpfs` para os poucos paths graváveis (ex: `/tmp`).
- `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`.
- `user: 1000` (non-root) quando a imagem suportar; senão `root` só dentro do container com as restrições acima.
- `healthcheck` em cada serviço.
- `deploy.resources.limits` (CPU/RAM) para isolamento/controle.
- `restart: unless-stopped`.

## Decisão 8 — Idempotência & backups
- Scripts de setup DB: `CREATE USER IF NOT EXISTS`, `ALTER USER ... PASSWORD` (idempotente).
- `docker-compose up -d` já é idempotente.
- Backup R2 já existe (`/opt/cryptobingo-backup/backup.sh`, cron 0 3 * * *, rclone→R2 free). Validar que roda e inclui os novos containers.
- Documentar em ADR.

## Decisão 9 — Escalabilidade
- Vertical (VPS 8GB) basta para testnet.
- Compose permite `replicas:` se necessário.
- Se tráfego crescer: Container Apps (já auto-scale) ou k3s no VPS.

## Decisão 10 — Azure (api-gateway / worker)
- Hoje na Azure Container Apps (free tier: 180k vCPU-s, 2M req/mês).
- **Opção A**: manter na Azure (free tier) — menor risco, mas a superfície Azure→VPS (DBs) é o vetor de ataque do ransomware (IPs Azure atacaram o Mongo).
- **Opção B**: trazer api-gateway/worker para o VPS Docker — elimina Azure, unifica infra, remove a regra Azure do firewall; mas exige estabilidade do VPS e mais containers.
- **Recomendação**: manter na Azure por ora (foco agora é hardening do VPS + coerência de senhas); trazer depois se quiser zero-Azure.

## Ordem de execução (idempotente, validável)
1. Gerar 3 senhas fortes (PG app, Mongo appuser, Redis ACL) — registrar no RAG.
2. Atualizar `docker-compose` do VPS (rede interna + hardening) e subir DBs + pgbouncer.
3. Aplicar senhas (ALTER USER PG; recriar Mongo+restore R2; ACL Redis).
4. Atualizar landing-api compose (senha PG + hardening) e subir.
5. Atualizar secrets do api-gateway/worker no Azure (PG/Mongo/Redis) + restart.
6. Restringir firewall INPUT do host.
7. Validar: landing-api HTTPS, api-gateway endpoints, Mongo/Redis auth, backup R2.
8. ADR documentando.

## Riscos
- Recriar Mongo zera dados atuais → mitigado por restore R2 + on-chain.
- Alterar senhas de PG/Redis pode quebrar api-gateway/worker se secrets não atualizados em sincronia → mitigado fazendo em transação (alterar + atualizar secret + restart juntos).
- Firewall INPUT restritivo pode trancar SSH se errar → mitigado testando regra antes de persistir / manter 22 liberado.
