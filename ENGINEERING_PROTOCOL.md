# Protocolo de Operação do Agente de Engenharia

Sempre que uma tarefa for solicitada, o Agente DEVE seguir esta ordem estrita de execução:

1. **Leitura de Contexto:** Antes de qualquer alteração, leia `docs/SPEC.md`, `docs/architecture.md`, `docs/COMPLIANCE.md` e o `TODO.md` atual.
2. **Verificação de ADR:** Verifique em `docs/adr/` se existe alguma decisão prévia que invalide a tarefa atual.
3. **Execução:** Prossiga com a implementação/análise solicitada.
4. **Atualização de Documentação:**
   - **TODO.md:** Atualize o status da tarefa para `[DONE]`.
   - **TRACE.md:** Registre um log curto da ação executada (Data, Tarefa, ADRs consultados, Arquivos alterados).
5. **Auto-Crítica:** Se a tarefa implicar em mudança de arquitetura, o Agente deve sugerir a criação de um novo ADR.

# GOVERNANÇA DE MULTI-AGENTES:

Antes de iniciar qualquer tarefa, o agente DEVE checar o `TASKS.md`.

Se a tarefa depender de outra (coluna 'Dependência'), o agente deve verificar se o status da tarefa anterior é [DONE].

Ao finalizar, o agente DEVE atualizar o `TASKS.md` e o `TRACE.md` antes de sinalizar conclusão.

# Antes de escrever código C++, o Agente deve:

- Listar as bibliotecas necessárias.
- Explicar como a serialização será feita para o buffer.
- Comparar a lógica com a estrutura do .hpp aberto.
- SOMENTE após validar os pontos acima, escrever o código.