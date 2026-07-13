# Análise Forense — Ransomware MongoDB (VPS Cryptobingo) — 2026-07-12

## Resumo Executivo
O MongoDB do VPS (13.140.172.222) foi comprometido por uma campanha automatizada de
ransomware ("MongoDB Ransomware" / variante Mecha). O banco `cryptobingo` foi esvaziado
e substituído por um DB `READ_ME_TO_RECOVER_YOUR_DATA` com exigência de 0.0077 BTC.
Causa raiz: **MongoDB exposto em 0.0.0.0:27017 sem autenticação** + **ufw inativo**
(o Docker contorna o ufw via `docker-proxy`). Dados críticos (jogos, tickets, prêmios)
permanecem seguros on-chain (WAX); apenas metadados off-chain foram perdidos e já
restaurados a partir do backup R2. **Não foi pago resgate.**

---

## 1. LINHA DO TEMPO (forense)
| Horário (UTC) | Evento | Fonte |
|---|---|---|
| 16:55 | Último backup válido do Mongo (R2: `mongo-20260712-165525.archive.gz`) | rclone/R2 |
| 21:25:29 | 1ª conexão do atacante `13.91.98.58` ao Mongo (sem auth) | mongo logs |
| 21:29:59–21:30:00 | Rajada de ~12 conexões de `13.91.44.183` (varredura + drop) | mongo logs |
| 21:30–21:4x | DB `cryptobingo` apagado; `READ_ME_TO_RECOVER_YOUR_DATA` criado | mongo inspect |
| ~21:5x | Você notou cartela paga só por ROW_1 (combo sumiu) | relato |
| 21:4x–22:1x | Contenção: DOCKER-USER bloqueia 27017/5432/6379 da internet | iptables |
| 22:0x | Mongo recriado com `--auth`; Azure apps atualizados | docker/az |
| 22:1x | Cache Redis limpo; API retorna 4 combos do gametype 1 | curl |

## 2. PERSONA: Threat Intelligence Analyst
- **TTPs**: varredura massiva de Shodan/Censys por `27017` aberto → conexão anônima →
  `dropDatabase`/`deleteMany` de todas as collections → insert do DB de resgate.
- **Infra do atacante**: IPs `13.91.44.183` e `13.91.98.58` pertencem a **faixas Azure
  West US** (datacenters de botnet alugados). O `user-agent` falsificado
  (`nodejs|Mongoose 7.2.0`) mascara a ferramenta de limpeza.
- **Motivação**: financeira oportunista (ransom baixo, 0.0077 BTC ≈ baixo risco p/ vítima).
- **Ameaça persistente**: este bot varre continuamente a internet. Sem auth, **será
  atacado de novo em horas**. O auth aplicado elimina a vulnerabilidade.

## 3. PERSONA: Digital Forensics & Incident Response (DFIR)
- **Âmbito**: apenas `cryptobingo` (Mongo). PG (scram-sha-256) e Redis (senha AUTH)
  resistiram — não houve exfiltração/lixo neles.
- **Indicadores (IoCs)**:
  - IPs: `13.91.98.58`, `13.91.44.183`
  - BTC: `bc1qa83x6l2dlgkx7cc9rmrymscp5sa3ljepu42w2r` | DATAID `16TRJ1`
  - DB-flag: `READ_ME_TO_RECOVER_YOUR_DATA.README`
- **Evidência preservada**: dump pós-ataque em `r2:cryptobingo/forensics/mongo-POSTATTACK-*.archive.gz`
  e nota em `r2:cryptobingo/forensics/ransom_note_*.json`.
- **Integridade**: dados on-chain (WAX) são fonte de verdade p/ prêmios; metadados
  restaurados do backup pré-ataque são íntegros (hash não verificável mas consistentes).

## 4. PERSONA: Application Security / Cloud Architect
- **Vetor raiz**: `docker run -p 27017:27017` sem `--auth` + container sem
  `MONGO_INITDB_ROOT_*` + host sem firewall. Erro clássico de "databases expostos".
- **Arquitetura frágil**: apps Azure acessam Mongo/PG/Redis **pelo IP público do VPS**
  (sem VNet/túnel privado). Isso obriga a expor as portas — mitigável só por auth.
- **Segredos**: `REDIS_URL` e `POSTGRES_URL` contêm credenciais em plaintext nos env do
  Container App (aceitável p/ Azure Secret, mas o Mongo antes NÃO tinha credencial nenhuma).
- **Recomendação estrutural**: VNet peering ou Azure Private Link / WireGuard tunnel
  entre VPS e Container Apps, eliminando exposição de banco à internet.

## 5. PERSONA: Security Operations / Compliance
- **Contenção (feita)**: DOCKER-USER bloqueia bancos; Mongo com `--auth`; secrets
  rotacionados (appuser criado); cache invalidado; backup restaurado.
- **Gap de processo**: não havia monitoramento de integridade de DB nem alerta de
  "collection vazia". O ataque passou despercebido por horas até sintoma de negócio.
- **LGPD**: dados de perfil de usuário (userprofiles) NÃO foram expostos (estavam
  íntegros e protegidos por auth após a correção). Sem evidência de exfiltração.

---

## PLANO DE HARDENING (para "nunca mais")
1. ✅ Mongo com `--auth` (root + appuser readWrite). Persistir credencial em Secret Azure.
2. ✅ DOCKER-USER + netfilter-persistent (sobrevive reboot).
3. ⏳ **VNet/Private Link** entre Azure e VPS (elimina exposição de 27017/5432/6379).
4. ⏳ **Backups automáticos + verificação** (o R2 já roda; adicionar alerta se coleta vazia).
5. ⏳ **Monitoring**: alerta se `gametypemetadatas.countDocuments()==0` ou se Mongo recebe
   conexão de IP não-Azure.
6. ⏳ **Rotação de segredos**: trocar senha do Redis e do Postgres (estavam expostos no
   passado, mesmo com auth — boa prática pós-incidente).
7. ⏳ **Documentar runbook** de recuperação (já validado hoje: R2 → mongorestore → limpar cache).

## Lições
- "Funcionou sem senha" ≠ "seguro". Banco sem auth + porta aberta = comprometido em minutos.
- Docker publica portas que furam o ufw → controle de borda deve ser via DOCKER-USER.
- Backup é a única salvação real; o R2 impediu perda definitiva de metadados.
