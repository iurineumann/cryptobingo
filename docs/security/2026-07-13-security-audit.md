# Auditoria de Segurança — Infraestrutura 100% VPS (2026-07-13)

Data: 2026-07-13 | Escopo: stack cryptobingo no VPS Contabo (13.140.172.222 / 2a02:c207:2343:3243::1)
Base de conhecimento: OWASP Top 10:2025, CVEs NVD/fornecedores (jul/2026), Docker/Redis/RabbitMQ/nginx/PostgreSQL/MongoDB advisories.

## 1. Inventário de versões (exato, coletado no VPS)

| Componente | Versão | Fonte |
|---|---|---|
| OS | Ubuntu 24.04.4 LTS | /etc/os-release |
| Kernel | 6.8.0-134-generic | uname |
| Docker Engine | 29.6.1 | docker version |
| nginx (container) | 1.27.5 | nginx -v |
| PostgreSQL | 18.4 (Debian pgdg) | postgres --version |
| MongoDB | 8.0.26 | mongosh db.version() |
| Redis | 7.4.9 | redis-cli INFO |
| RabbitMQ | 3.13.7 | rabbitmqctl version |
| Node.js (apps) | 22.23.1 | node -v |
| Certbot | 2.9.0 | certbot --version |
| OpenSSL | 3.0.13 | openssl version |

## 2. CVEs relevantes (jul/2026) vs nossas versões

### 2.1 CRÍTICOS / ALTOS que AFETAM nossas versões
- **PostgreSQL 18.4** — CVE-2026-6473 (integer wraparound, CVSS 8.8, "undersizes allocations", afeta 14–18). Fix: 18.4 já é o patch? O advisory PostgreSQL 18.4/17.10/etc. de 2026 lista CVE-2026-6473 como corrigido NA 18.4. ✅ Se estivermos em 18.4 exato, OK. Confirmar `SELECT version();`.
- **Redis 7.4.9** — CVE-2026-23479 (RESTORE mem access / RCE autenticado, desde 7.2.0), CVE-2026-23631 (Lua UAF / RCE autenticado), CVE-2026-25243 (RESTORE invalid memory). Afetam 7.4.x. ⚠️ Mitigado por ACL+senha+rede interna, mas vale atualizar para 7.4.x mais recente ou 8.x.
- **RabbitMQ 3.13.7** — CVE-2026-57219 (fix 3.13.15), CVE-2026-44839 (afeta 3.7.0–4.1.1). ⚠️ Vulnerável. Atualizar para ≥3.13.15 (ou 4.x).
- **nginx 1.27.5** — CVE-2026-42945 (ngx_http_rewrite_module heap overflow, "NGINX Rift"), CVE-2026-42530 (HTTP/3 use-after-free, 1.31.0–1.31.1; 1.27 NÃO afetado por 42530 mas 42945 SIM). ⚠️ Atualizar nginx para ≥1.27.6 / 1.31.2+ ou aplicar mitigação (desabilitar HTTP/3 se não usar).
- **Node.js 22.23.1** — Jun/2026 security release afeta Node 22 (CVE-2026-21714/21715 <22.22.3 em alguns builds; releases de jun/2026 cobrem 22.x). ⚠️ 22.23.1 é recente; confirmar se inclui o patch de jun/2026. Se não, rebuild das imagens com Node 22.x mais novo.
- **Docker 29.6.1** — CVE-2026-34040 (auth bypass via oversized HTTP requests, fix 29.3.1). 29.6.1 > 29.3.1 ⇒ ✅ não vulnerável. (CVE-2026-28400 é Docker Desktop/Model Runner, não Engine ⇒ N/A.)

### 2.2 BAIXO / MITIGADO por arquitetura
- MongoDB 8.0.26 — CVE-2026-11933 (fix 8.0.26 ✅), CVE-2026-8053 (time-series, autenticado, write priv), CVE-2026-25611 (Cato CTRL). Temos 8.0.26 ⇒ CVE-2026-11933 OK. Demais exigem auth+write ⇒ mitigado por rede interna + appuser.
- Todos os datastores: acesso externo BLOQUEADO por nftables DOCKER-USER (drop 5432/6379/27017/5672) + firewall Contabo (regras DB removidas por usuário).

## 3. OWASP Top 10:2025 — mapeamento à arquitetura

| OWASP 2025 | Status em nosso sistema | Observação |
|---|---|---|
| A01 Broken Access Control | 🟡 Parcial | APIs têm rate-limit; rever authz em rotas do api-gateway (ex: /api/v1/rooms/* sem auth?) |
| A02 Cryptographic Failures | 🟢 OK | TLS 1.2/1.3, HSTS, cert wildcard Let's Encrypt; dados em trânsito cifrados |
| A03 Injection | 🟡 Parcial | PG/Mongo parametrizados (verificar no código); revisar inputs do worker (WAX tx) |
| A04 Insecure Design | 🟢 OK | Arquitetura em camadas, redes isoladas |
| A05 Security Misconfiguration | 🟡 Melhorar | Headers presentes (nosniff, frame-options); falta CSP estrito e X-Content-Type em alguns; detalhe abaixo |
| A06 Vulnerable & Outdated Components | 🔴 AÇÃO | Redis/RabbitMQ/nginx/Node com CVEs (Seção 2) |
| A07 Identification & Auth Failures | 🟢 OK | JWT, senhas fortes, ACLs; admin_email não-pessoal |
| A08 Software & Data Integrity | 🟡 Parcial | Imagens GHCR pinadas em :testnet (não digest); assinar imagens (cosign) |
| A09 Security Logging & Monitoring | 🟡 Parcial | Logs app (pino) presentes; falta alerta/centralização (Cloudflare/audit) |
| A10 SSRF | 🟢 OK | Worker só chama RPC WAX allowlist + RabbitMQ interno |

## 4. Recomendações priorizadas

### P0 (esta semana)
1. **Atualizar Redis** → 7.4.x latest ou 8.0 (CVE-2026-23479/23631). Mantenha ACL+senha.
2. **Atualizar RabbitMQ** → ≥3.13.15 (CVE-2026-57219/44839).
3. **Atualizar nginx** → ≥1.27.6 ou 1.31.2 (CVE-2026-42945); se não usar HTTP/3, adicionar `quic` removal como mitigação temporária.
4. **Rebuild das imagens de app** com Node 22.x contendo o patch de jun/2026 (confirmar versão exata no build).

### P1 (mês)
5. **CSP estrito** no nginx (Content-Security-Policy) para landing-api/test-api.
6. **Pin de imagens por digest** + assinatura cosign no GHCR.
7. **WAF/rate-limit na borda** (Cloudflare já faz; revisar regras WAF).
8. **Centralizar logs** (ex: observability mínima ou rotação + retenção).

### P2 (melhoria contínua)
9. **Vulnerability scanning** no CI (Trivy/Grype) contra imagens.
10. **Backup de segredo** + rotação de senhas (já no RAG local).
11. **Pen-test leve** nas APIs (autorização em /rooms/*).

## 5. Estado atual de mitigação (positivo)
- Datastores 100% em rede Docker interna (`cb-back`, internal:true) — sem exposição ao host.
- nftables DOCKER-USER dropa 5432/6379/27017/5672 externos (ip + ip6), persistido em /etc/nftables.conf.
- Firewall Contabo ajustado pelo usuário (removidas regras DB/DNS Any).
- Redis com ACL (default disabled, appuser+senha, pubsub).
- MongoDB com auth (appuser, authSource=admin).
- RabbitMQ com user dedicado cbworker + vhost, sem tag admin.
- TLS automático (certbot), HSTS, CORS configurado (preflight 204).

## 6. Ações de verificação pendentes
- [ ] Confirmar `SELECT version();` do PG mostra 18.4 com CVE-2026-6473 resolvido.
- [ ] Confirmar se Node 22.23.1 inclui patch jun/2026 (ou rebuild).
- [ ] Testar atualização Redis/RabbitMQ/nginx em staging antes de produção.
- [ ] Adicionar CSP no nginx apps.conf.
