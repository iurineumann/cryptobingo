# TRACE.md: Registro de Atividades

- **2026-05-20**: Inicialização do protocolo de engenharia.
- **2026-05-20**: Estrutura de diretórios e arquivos de especificação (SPEC, ADR, COMPLIANCE) criados.
- **2026-05-20**: Definição do ENGINEERING_PROTOCOL.md como regra global.
- **2026-05-20**: (T01) Implementação da action `buytickets` no `bingo.cpp`. Solução arquitetural aplicada para derivação determinística de `ticket_id` via cast de hash criptográfico e instanciação correta de tabelas (games, tickets, balances) seguindo limites de escopo do `SPEC.md`.
- **2026-05-20**: (T02) Implementação corrigida manualmente de `lockgame` e `claimwin` no `bingo.cpp` após falha mecânica do modelo. Declarada a interface ABI faltante no `bingo.hpp`. Aplicada lógica de Payout $O(1)$ prevendo *Precision Loss* para divisão RTP (85%) e iteração segura da distribuição B2B *Multidrop* da tabela `balances` por estrito `ticket_itr->owner`.