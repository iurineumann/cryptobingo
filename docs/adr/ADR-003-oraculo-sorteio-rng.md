# ADR 003: Oráculo de Sorteio e Geração de Números Aleatórios (RNG)

## Status
Aceito

## Contexto
O CryptoBingo é um dApp estruturado num modelo Web2.5. Embora a geração e a gestão visual das cartelas ocorram de forma otimizada via Backend (assinadas criptograficamente), o processo de **Sorteio das Bolas** representa o maior vetor de risco reputacional e de segurança do cassino. 

Se o sorteio for computado num servidor centralizado (Backend/Node.js) e depois injetado na blockchain, a plataforma estará vulnerável a acusações de manipulação de resultados (insider threat) e falhará no escrutínio de qualquer auditoria de Smart Contracts, uma vez que a aleatoriedade não poderá ser verificada de forma independente. O cálculo do prêmio exige entropia on-chain pura e matematicamente inquestionável.

## Decisão
1. **Descentralização do Sorteio (On-Chain RNG):** A geração dos números sorteados será delegada exclusivamente a um serviço de Oráculo de Aleatoriedade nativo da rede Antelope/WAX.
2. **Integração com `orng.wax`:** O contrato oficial do jogo (`bingogamectr`) interage com o contrato de sistema `orng.wax` para solicitar entropia criptográfica.
3. **Fluxo Assíncrono de Sorteio (State Machine):**
   - O Worker (via RabbitMQ) aciona a ação `startdraw(game_id)`.
   - O contrato do jogo invoca uma ação *inline* `requestrand` apontando para o oráculo, utilizando o `game_id` como `assoc_id` (identificador de associação).
   - O estado do jogo transita para `drawing` (sorteando), impedindo imediatamente quaisquer manipulações de estado.
4. **Callback de Recebimento (`receiverand`):** O Oráculo responde assincronamente acionando a ação de callback `receiverand` no nosso contrato, injetando um vetor seguro de bytes aleatórios (`std::vector<char> random_bytes`).
5. **Gravação e Transição de Estado:** O contrato grava as bolas na tabela `games` e altera o status para `drawn`, engatilhando o gatilho para o Evaluator (Worker) processar o `claimwin`.

## Consequências

### Positivas
* **Provably Fair (Auditabilidade Criptográfica):** Qualquer jogador ou auditor externo pode verificar no explorador de blocos a semente de entropia gerada pelo Oráculo, atestando que a casa de apostas não interferiu no resultado.
* **Segurança Criptográfica (Hardening):** Elimina o vetor de ataque de *front-running* ou predição de semente de blocos locais (ataque clássico de timestamp/tapos_block).
* **Consistência Contratual:** O fluxo obriga a uma máquina de estados finita rigorosa (`locked` -> `drawing` -> `drawn`), protegendo o *pool* de liquidez.

### Negativas / Trade-offs
* **Latência Assíncrona:** A resposta do Oráculo não é imediata e dura normalmente de 1 a 3 blocos (0.5 a 1.5 segundos). O Frontend precisa gerir esta latência através de WebSockets (via RabbitMQ) para exibir a animação do sorteio de forma fluida ao utilizador sem mostrar a tela de "Loading" bruto.
* **Dependência Externa:** Existe um acoplamento (embora oficial da rede) com o estado do contrato `orng.wax`. Em caso de paralisação do Oráculo (extremamente raro na Mainnet), a sala ficará "presa" no status `drawing` até a resolução da rede.

## Referências
* WAX RNG Oracle Documentation (`orng.wax`).
* Paradigmas de Segurança e Entropia em Smart Contracts C++ Antelope.
* ADR-002: Arquitetura Offchain e Tokenomics (Interação do Worker/RabbitMQ com a mudança de estado).