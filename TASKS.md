# Roadmap de Engenharia - CryptoBingo

## 🟢 Fase 1: Core Financeiro On-Chain (Concluído)
- [x] Criação das estruturas de estado (games, balances, tickets)
- [x] Lógica C++ de assinaturas criptográficas
- [x] Ajuste do ABIGEN e fixação estática do `bingo.abi`
- [x] Integração do Oráculo WAX RNG (Assíncrono)
- [x] 100% de cobertura no `fsm.test.ts` (Harness)

## 🟡 Fase 2: Infraestrutura Off-Chain e Banco de Dados (Em Andamento)
- [ ] Configurar os containers Docker base (`docker-compose.yml` para dev local).
  - Incluir PostgreSQL, MongoDB e RabbitMQ.
- [ ] Desenvolver o "Blockchain Indexer" para escutar o contrato `bingo.game` e espelhar os saldos e histórico no PostgreSQL.
- [ ] Criar o microsserviço "Game Loop Worker" (Consumidor da fila RabbitMQ para disparar `lockgame` e `startdraw`).
- [ ] Modelar banco de dados (MER) para LGPD e logs da Lei 14.790/2023.

## 🔴 Fase 3: Economia de Tokens e NFTs (AtomicAssets)
- [ ] Realizar o deploy do contrato customizado `eosio.token` para o token nativo `$BINGO`.
- [ ] Configurar a Coleção Oficial do CryptoBingo no padrão AtomicAssets.
- [ ] Criar os *Schemas* para os "Credit Packs" (NFTs) e ativar a função de Lastro (Backed Tokens).

## 🔴 Fase 4: Frontend (Wharfkit & UI) e Microsserviços Auxiliares
- [ ] Integrar a Anchor / WAX Cloud Wallet via Wharfkit.
- [ ] Desenvolver API de Chat (WebSockets/MongoDB).
- [ ]  Inicializar framework de i18n e definir os arquivos de mapeamento JSON estruturais (en, pt, es).
- [ ] Desenvolver os componentes da UI com foco em responsividade total para celular.
- [ ] Implementar rotinas de detecção automática de fuso horário e moeda/idioma no primeiro acesso.
- [ ] Validar navegação por teclado e contraste de cores nas salas de sorteio.
- [ ] Dashboard do jogador (Saldos lidos via RPC, inventário de NFTs lido via AtomicHub API).
- [ ] Desenvolver mecânica de *burn* do NFT no frontend para resgate do `$BINGO`.