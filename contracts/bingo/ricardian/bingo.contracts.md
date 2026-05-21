# Contrato Ricardiano - CryptoBingo

O protocolo CryptoBingo é uma plataforma descentralizada de apostas baseada na blockchain Antelope. Ao interagir com este contrato, você concorda com os termos abaixo.

## Ações do Contrato

### creategame
Ao executar a ação `creategame`, o administrador do contrato formaliza a criação de um novo evento de Bingo, definindo o `game_id` único e o custo de entrada em TLM. Este evento torna-se elegível para a participação de jogadores.

### buytickets
Ao comprar uma cartela (`buytickets`), o jogador declara que possui os direitos sobre a assinatura enviada e concorda que o saldo correspondente ao `ticket_price` será deduzido de sua carteira interna no contrato. O jogador reconhece que a matriz da cartela é imutável após o registro na blockchain.

### lockgame
Esta ação bloqueia permanentemente o jogo para novas entradas, garantindo a integridade dos participantes antes do sorteio. Uma vez "locked", nenhuma nova cartela pode ser comprada para este `game_id`.

### startdraw
Transiciona o jogo para o estado `drawing`. A partir deste momento, o contrato está apto a processar a verificação de vencedores e a execução dos pagamentos de prêmios.

### claimwin
Esta ação liquida o prêmio para o vencedor. O contrato processa automaticamente o RTP (Retorno ao Jogador) definido de 85% do `prize_pool` para o `owner` da cartela vencedora, e distribui o restante para as contas de patrocínio (sponsor_pool). A decisão do contrato sobre o vencedor é final e baseada nos dados registrados na blockchain.

### deposit
Ao transferir tokens para `bingo.game`, o usuário entende que estes fundos estão sendo custodiados pelo contrato para fins de jogo. O contrato atualizará automaticamente o saldo interno (`balances`) do remetente.

### withdraw
O jogador pode solicitar o saque de seus fundos não utilizados a qualquer momento. O contrato, agindo como um custodiante autônomo, disparará uma transferência `inline` imediata do saldo solicitado de volta para a carteira de origem do usuário.

## Termos Gerais
1. **Auditoria**: Todas as transações são públicas e imutáveis na blockchain.
2. **Custódia**: Os fundos depositados no contrato `bingo.game` são geridos por lógica algorítmica e não podem ser acessados por terceiros.
3. **Limitação de Responsabilidade**: O usuário declara estar ciente dos riscos inerentes a protocolos DeFi e que a operação é regida estritamente pelos termos do código-fonte auditado.