# ADR-046 — Gestão de Segredos: remoção de credenciais de arquivos versionados e adoção de Key Vault

**Status:** Aceito
**Data:** 2026-07-09
**Aprovado por:** Célula de Engenharia CryptoBingo (usuário)
**Autores:** Hermes (orquestrador) + Célula de Engenharia CryptoBingo
**Contexto:** flag levantado na discovery 2026-07-09 (herança OpenCode → Hermes)

---

## Problema

O princípio do projeto ("segurança é bloqueante", CLAUDE.md) proíbe segredos em repo. Na prática,
evidências mostram exposição parcial de credenciais em arquivos versionados:

- `CLAUDE.md` (commitado) contém `APPLICATIONINSIGHTS_CONNECTION_STRING` com
  **InstrumentationKey real** (`aa4afc46-…-43d6`) e ApplicationId, além de hostnames/usuários
  completos de Cosmos DB (`cryptobingo-mongo.mongo.cosmos.azure.com`), PostgreSQL
  (`cryptobingo-pg.postgres.database.azure.com`) e RabbitMQ (`fly.rmq.cloudamqp.com`). Apenas a
  senha vem mascarada (`***`).
- `apps/*/.env.testnet` (presentes em disco, não versionados) trazem templates com secrets
  mascarados — OK, mas replicam o mesmo padrão de documentar conexões em plaintext no repo.

**Risco:** o InstrumentationKey + hostnames/usuários reais são sufficientes para:
1. Direcionar ataques de enumeração/abuso contra os recursos Azure específicos.
2. Ingestão de telemetria falsa ou exfiltração de traces se o key vazar para terceiros.
3. Fingerprinting do ambiente (RG `cryptobingo-testnet`, contas, topologia).

Mesmo sem a senha, a superfície de ataque é desnecessária e viola o próprio padrão do projeto.

## Decisão

1. **Rotacionar imediatamente** o `APPLICATIONINSIGHTS_CONNECTION_STRING` (regenerate key no
   Azure) e tratá-lo como comprometido por estar em histórico do git.
2. **Remover todos os valores de conexão de `CLAUDE.md`** — manter apenas nomes de recurso,
   região, tier e *formato* das variáveis (ex.: `APPLICATIONINSIGHTS_CONNECTION_STRING=<az
   containerapp update --set-env-vars>`), nunca a string completa nem o InstrumentationKey.
3. **Mascarar também o InstrumentationKey** nos docs (mostrar só prefixo `aa4a…` + `…43d6`).
4. **Centralizar segredos em Azure Key Vault** (ou equivalente): Container Apps e Function App
   leem via `az containerapp update --set-env-vars` / Key Vault reference, nunca de arquivo no repo.
5. **`.env*` e `.env.testnet` permanecem gitignored** (já estão), mas o repo NÃO deve conter
   nenhum secret real em nenhum arquivo tracked — incluir verificação em CI (secret-scan, ex.
   gitleaks) para impedir regressão.
6. **Adicionar secret-scan ao pipeline** (`.github/workflows/ci.yml` ou Semgrep) bloqueando
   commit/push de `InstrumentationKey=`, `mongodb://user:pass@`, `amqps://user:pass@`, etc.

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
|---|---|
| Manter como está (só senha mascarada) | Viola princípio "segurança bloqueante"; key + hostnames já expostos no git history |
| Criptografar o arquivo no repo | Complexidade + chave de descriptografia precisaria ir a outro lugar; Key Vault é o padrão Azure |
| Usar `.env` versionado com git-crypt | Mantém segredos no repo; Key Vault já disponível no Azure e é o alvo da infra atual |

## Consequências

- **Positivas:** elimina exposição de InstrumentationKey/hostnames; alinha repo ao princípio de
  segurança; CI impede regressão; rotação centralizada simplifica futuros deploys.
- **Negativas:** exige rotina de `az containerapp update` para setar env vars (já é o fluxo
  documentado em CLAUDE.md); docs perdem "copiar-colar" de connection strings (intencional).
- **Ação imediata (homem):** regenerar App Insights key + mover valores para Key Vault antes do
  próximo deploy de `cryptobingo-testnet`.

## GAPs de governança identificados na mesma discovery

- **ADR-044 duplicado:** `docs/adr/ADR-044-conteudo-workflow-personas-qa.md` E
  `docs/adr/ADR-044-cosmosdb-shared-throughput.md` usam o mesmo número. Reatribuir um deles
  para ADR-046+ (após este) ou ADR-040/041 (números pulados).
- **ADR-040 e ADR-041 pulados:** nenhum arquivo com esses números existe. Próxima ADR deve
  preencher a lacuna ou documentar deliberadamente o salto.

## Referências

- CLAUDE.md (seção Infraestrutura Testnet / App Insights — linhas com InstrumentationKey)
- ADR-043 (Observabilidade) — define App Insights, mas não trata armazenamento de segredos
- `az containerapp update -n <app> -g cryptobingo-testnet --set-env-vars "KEY=value"`
