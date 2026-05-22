<h1 class="contract">setconfig</h1>

---
spec_version: "0.2.0"
title: Configurar Autoridade do Oráculo
summary: 'Define a chave pública para validação de assinaturas no contrato.'
---

Ao executar esta ação, a administração do protocolo CryptoBingo estabelece a chave pública `{{signer_key}}` como a autoridade criptográfica. Esta chave será estritamente utilizada para validar a autenticidade, segurança e imutabilidade das cartelas compradas pelos participantes.

<h1 class="contract">creategame</h1>

---
spec_version: "0.2.0"
title: Inicializar Novo Evento de Bingo
summary: 'Abre o jogo #{{game_id}} com preço de entrada fixado em {{ticket_price}}.'
---

O contrato inicializa um novo evento de bingo identificado pelo ID numérico `{{game_id}}`.
O valor (Ticket Price) para a participação neste evento é fixado em `{{ticket_price}}`. A governança e a custódia do fundo de prêmios (`prize_pool`) gerado pelas entradas serão mantidas de forma autônoma por este contrato, visando alinhamento aos parâmetros de conformidade, auditoria técnica e melhores práticas da Lei 14.790/2023 aplicáveis a ecossistemas descentralizados.

<h1 class="contract">buytickets</h1>

---
spec_version: "0.2.0"
title: Aquisição de Cartelas
summary: 'O participante {{owner}} adquire cartelas para o jogo #{{game_id}}.'
---

O participante identificado pela conta `{{owner}}` formaliza a compra de cartelas para o jogo `{{game_id}}`.
Ao assinar esta transação, o participante autoriza o protocolo a deduzir o valor exato correspondente ao número de cartelas diretamente de seu saldo interno sob custódia. O participante declara ciência de que os dados das matrizes (`{{matrices}}`) tornam-se inalteráveis na blockchain após esta execução.

<h1 class="contract">lockgame</h1>

---
spec_version: "0.2.0"
title: Bloqueio de Entrada do Jogo
summary: 'Trava permanentemente a adesão de novos participantes no jogo #{{game_id}}.'
---

O sistema autorizado invoca o bloqueio do jogo `{{game_id}}`. A partir deste marco de transição de estado, nenhuma nova cartela poderá ser comercializada. Esta ação assegura a estabilidade e o selamento financeiro do `prize_pool` imediatamente antes da fase de extração das bolas.

<h1 class="contract">startdraw</h1>

---
spec_version: "0.2.0"
title: Início da Fase de Sorteio
summary: 'Muda o estado do jogo #{{game_id}} para sorteio.'
---

O jogo `{{game_id}}` inicia oficialmente o processo de extração e registro de bolas. O contrato atesta o congelamento total dos parâmetros do jogo para liquidação.

<h1 class="contract">claimwin</h1>

---
spec_version: "0.2.0"
title: Liquidação de Prêmio (RTP)
summary: 'Distribui os ganhos da cartela #{{ticket_id}} no jogo #{{game_id}}.'
---

O sistema descentralizado audita e confirma que a cartela com o ID `{{ticket_id}}` cumpriu o padrão de vitória estipulado pela máscara `{{win_pattern_mask}}` em um total de `{{ball_count}}` bolas sorteadas. 
O contrato executará a liquidação exata dos fundos: 85% do fundo de prêmios retido será transferido ao dono da cartela vencedora (Retorno ao Jogador), enquanto o saldo operacional remanescente será provisionado nos pools de patrocínio ou reservas do protocolo.

<h1 class="contract">withdraw</h1>

---
spec_version: "0.2.0"
title: Saque de Fundos da Custódia
summary: '{{owner}} solicita o saque de {{amount}} da carteira interna.'
---

O titular da conta `{{owner}}` comanda a retirada voluntária do montante de `{{amount}}` disponível em seu saldo interno. Em resposta imediata, a máquina de estados deste contrato executará, de forma autônoma, uma transação eletrônica devolvendo o valor especificado para a carteira de origem na blockchain, sem a necessidade de intermediários humanos.