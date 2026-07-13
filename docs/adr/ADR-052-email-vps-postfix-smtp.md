# ADR 052: Migração de E-mail — Azure Communication Services → Postfix próprio (VPS Contabo)

## Status
Aceito

## Contexto
A sessão 2026-07-13 executou a migração de custo da Azure para o VPS Contabo + R2 (Frentes A/B/C/D),
com teto duro de < $0.30/mês na Azure. O envio de e-mail do `cryptobingo-landing-api` (Azure Function,
West US 2) usava **Azure Communication Services (ACS)** via `@azure/communication-email`, cujo recurso
`cryptobingo-email` (EmailServices + domínios `AzureManagedDomain` e `cryptobingo.bet`) foi **deletado**
(Frente D). O código em `apps/landing-page/api/_lib/email.ts` precisava parar de depender do ACS.

Restrições do projeto:
- **Custo:** manter Azure no free tier (Function Y1, Container Apps idle) — ACS era pago e saiu.
- **Segurança:** após o incidente MongoDB anterior (bind 0.0.0.0 sem firewall), o e-mail próprio
  exige isolamento e autenticação. Decisão do usuário: remetente `contact@cryptobingo.bet`,
  cópia/backup `ineudomains@gmail.com`, subdomínio dedicado `mail.cryptobingo.bet`.
- **Deploy:** GitHub Actions DESATIVADO no repo (documentado) → todo deploy é manual, inclusive o
  landing-api (replica `deploy-landing-api.yml` via `az webapp deployment source config-zip`).

## Decisão
1. **Servidor SMTP próprio no VPS** (Postfix + OpenDKIM + Dovecot SASL + Let's Encrypt DNS-01):
   - `mail.cryptobingo.bet` (A + AAAA, Cloudflare proxy OFF — SMTP não passa por proxy).
   - DKIM seletor `mail`, SPF `v=spf1 a:mail.cryptobingo.bet include:_spf.mx.cloudflare.net -all`,
     DMARC `p=quarantine`.
   - SASL auth na porta **587 (submission, STARTTLS)**; usuário `cryptobingo`, senha forte em
     `/root/.smtp_pass` + `/etc/dovecot/users` (NÃO commitada).
   - Cert Let's Encrypt via certbot DNS-01 (Cloudflare plugin), renovação automática.
2. **Código:** `email.ts` reescrito de `@azure/communication-email` para **nodemailer** (SMTP).
   Lê `SMTP_HOST/PORT/SECURE/USER/PASS/SENDER` (default `contact@cryptobingo.bet`). As 6 funções
   de envio (`sendWelcomeEmail`, `sendResetPassword`, `sendContactForm`, `sendAdminNotification`,
   `sendPayoutNotification`, `sendTicketReply`) mantidas com mesma assinatura — SEM breaking change.
3. **Env vars no Function App** `cryptobingo-landing-api` (via `az functionapp config appsettings set`):
   `SMTP_HOST=mail.cryptobingo.bet`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=cryptobingo`,
   `SMTP_PASS=[REDACTED]`, `SMTP_SENDER=contact@cryptobingo.bet`, `ADMIN_EMAIL=ineudomains@gmail.com`.
   Resíduos `ACS_CONNECTION_STRING`/`ACS_FROM` removidos.
4. **DNS Cloudflare:** CNAMEs Azure ACS DKIM (`selector1/2-azurecomm-prod-net._domainkey`) removidos;
   TXT `mail._domainkey` (DKIM VPS) adicionado.
5. **Firewall (segurança):** a chain `DOCKER-USER` do VPS restringe 27017/5432/6379 a
   `@azure_westus` + redes privadas (mitiga incidente MongoDB); persistência via systemd drop-in.
   SSH `PermitRootLogin prohibit-password` + `PasswordAuthentication no` (só chave).
6. **Deploy manual:** após merge em `develop`, o landing-api é deployado manualmente com o mesmo
   pacote que o workflow faria (`tsc` + zip + `az webapp deployment source config-zip`).

## Consequências

### Positivas
- **Custo zero de e-mail:** ACS (pago) eliminado; VPS já paga (hospeda Mongo/PG/Redis do app).
- **Controle total:** DKIM/SPF/DMARC próprios, remetente `contact@cryptobingo.bet` profissional.
- **Sem breaking change:** mesmas 6 funções de `email.ts`; chamadores não mudaram.
- **Entregabilidade validada:** teste de envio autenticado 587 → Gmail aceitou (250 OK, DKIM+SPF OK).

### Negativas / Trade-offs
- **Dependência do VPS:** se o VPS cair, o e-mail para (single point of failure). Mitigado por
  firewall/backup Contabo + R2 para dados.
- **Deploy manual:** sem CI, o landing-api exige passo manual pós-merge (replicar workflow).
- **Segredo SMTP:** `SMTP_PASS` no Function App (Azure) + VPS; não versionado. Rotação manual.
- **IP do VPS no SPF:** usa `a:mail.cryptobingo.bet` (não IP literal) para não expor o IP no TXT.

## Validação
- `npx tsc --noEmit` no `apps/landing-page/api`: passou.
- Teste de envio WSL → `mail.cryptobingo.bet:587` (SASL PLAIN + STARTTLS): `235 Authentication
  successful` + Gmail `250 Ok: queued` (DKIM-Signature presente, SPF pass).
- `az communication list`: vazio (ACS deletado).
- RAG: `agent://infra/email/smtp-vps-credentials`, `agent://infra/connectivity/azure-to-vps`,
  `agent://infra/vps/security-fix-db-exposure`, `agent://infra/azure/final-inventory-2026-07-13`.
