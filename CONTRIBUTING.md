# Contribuindo com o CryptoBingo

## Fluxo de trabalho

```
feature/<slug>  →  develop  →  master
```

1. Crie a branch a partir de `develop`:
   ```bash
   git checkout develop && git pull
   git checkout -b feature/<slug>
   ```

2. Desenvolva com commits pequenos e lógicos:
   ```
   tipo(escopo): descrição em PT-BR
   
   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   ```
   Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

3. Antes do PR — verifique:
   ```bash
   # Testes do(s) pacote(s) tocado(s)
   pnpm --filter @cryptobingo/<nome> test

   # Typecheck
   npx tsc --noEmit  # frontend / swap-ui
   npx tsc --project tsconfig.build.json --noEmit  # api / worker

   # Linting (se configurado)
   pnpm --filter @cryptobingo/<nome> lint
   ```

4. Abra PR para `develop` com corpo estruturado (Resumo + Plano de testes).

5. `develop → master` apenas quando estável.

---

## Estrutura de decisões (ADR-driven)

Toda mudança estrutural — nova feature, refactor de arquitetura, mudança de protocolo on-chain — deve ter um ADR em `docs/adr/`. Use o ADR anterior de número mais alto como referência de formato.

```bash
# Próximo número disponível
ls docs/adr/ | sort | tail -1
```

---

## Camadas e skills

Ao tocar uma camada, use a **skill** correspondente (procedimentos + gotchas) e delegue a revisão ao **agent revisor** antes do PR.

| Camada | Skill | Revisor |
|---|---|---|
| Contrato C++ | `wax-contract` | `cryptobingo-reviewer` |
| Worker / payouts | `worker-game-resolution` | `worker-reviewer` |
| API Gateway | `api-endpoint` | `api-reviewer` |
| Frontend | `frontend-feature` | `frontend-reviewer` |
| E2E UI (Cypress) | `e2e-ui-cypress` | `e2e-reviewer` |
| Harness / DevOps / Economia | `harness-e2e`, `weights-calibration` | `platform-reviewer` |

---

## Contrato C++ — ciclo obrigatório

O contrato exige um ciclo específico (não-óbvio). **Leia a skill `wax-contract` antes de qualquer edição.**

Resumo:
1. Editar `contracts/bingo/include/bingo.hpp` + `src/bingo.cpp`
2. Compilar no container `bingo_waxdev` (em `/tmp` — mount é read-only)
3. **Corrigir o ABI manualmente** em `contracts/bingo/bingo.abi` (fonte de verdade; nunca use o ABI gerado pelo CDT para deploy)
4. Deploy via `cleos set contract bingogamectr ...`
5. Validar com o harness E2E

---

## Ambiente local

```bash
# Primeira vez
./init_dev_env.sh

# Reset completo (zera chain + recria tudo)
./init_dev_env.sh --reset

# Oracle daemon (necessário para startdraw → drawn)
node_modules/.pnpm/node_modules/.bin/ts-node --transpile-only scripts/orng-oracle.ts
```

---

## Idioma e estilo

- Código, comentários, commits e docs: **português (PT-BR)**
- Comentários explicam o **porquê**, não o quê
- Sem comentários óbvios; sem docstrings multi-linha
- Sem features extras além do que a tarefa pede

---

## Invariantes que não podem ser violadas

- **RTP 85% / GGR 15%** — pesos calibrados via Monte Carlo; não altere pesos sem rodar simulação
- **`max_weight`** — prêmio usa sempre o maior peso entre padrões/combinações/stages (ADR-005)
- **`binary_extension`** em migração de tabela — nunca adicione campo a struct de tabela existente sem usar `binary_extension` + sufixo `$` no ABI (ADR-016)
- **ABI manual** — `bingo.abi` e `swap.abi` são mantidos à mão; o ABI gerado pelo CDT é incompleto
- **FREE SPACE** — bit 12 do bitmask 5×5 é sempre setado
- **Pesos em hundredths** — 100 = 1.00×, máx 25500 = 255×
