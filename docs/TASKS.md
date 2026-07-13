# TASKS

## Épico 9: Migração Azure → VPS/Contabo + R2 (custo < $0.30/mês) — Sessão 2026-07-13

### Frente A — Storage → R2
- [x] Deletar Storage Account `landapi` (containers vazios, 0 dados app)

### Frente B — E-mail VPS (Postfix)
- [x] Reescrever `apps/landing-page/api/_lib/email.ts` (ACS → nodemailer/SMTP)
- [x] Atualizar `package.json` (nodemailer add, azure remove) + `pnpm-lock.yaml`
- [x] Provisionar Postfix + OpenDKIM + Dovecot SASL + Let's Encrypt no VPS
- [x] DNS Cloudflare: `mail.cryptobingo.bet` (A/AAAA, proxy OFF), TXT DKIM, SPF, DMARC
- [x] Configurar env vars SMTP no Function App `cryptobingo-landing-api`
- [x] Teste de envio autenticado 587 → Gmail aceitou (DKIM+SPF OK)
- [x] Remover CNAMEs Azure ACS DKIM do Cloudflare

### Frente C — Zerar logs (LA/AI)
- [x] `az containerapp env update --logs-destination azure-monitor` (sem ingestão de console no LA)
- [x] App Insights dos Container Apps desconectado (null)
- [x] Deletar Log Analytics (`cryptobingo-logs`, `crypto-testnet-ai-law`, `managed-cryptobingo-oracle-ws` + RG)
- [x] Deletar App Insights (`cryptobingo-testnet-ai`, `cryptobingo-oracle`)
- [x] Deletar action group órfão `Application Insights Smart Detection`

### Frente D — Remover mortos
- [x] Deletar Communication Services `cryptobingo-email` + domínios (via `az rest` DELETE)
- [x] Remover `ACS_*` env vars do Function App

### Segurança (bônus)
- [x] Mitigar incidente MongoDB: `DOCKER-USER` restringe 27017/5432/6379 a `@azure_westus` + privadas
- [x] Persistência via systemd drop-in (`/opt/cryptobingo/docker-user-persist.sh`)
- [x] SSH hardening: `PermitRootLogin prohibit-password` + `PasswordAuthentication no`

### Documentação / RAG
- [x] ADR-052 (migração e-mail ACS → Postfix VPS)
- [x] RAG: credentials SMTP, firewall/topologia, conectividade Azure→VPS, correção DB, inventário final
- [x] TASKS.md / TRACE.md

### Manual (pós-merge)
- [ ] Deploy manual `cryptobingo-landing-api` (replicar `deploy-landing-api.yml`)
