# 📂 CONTEXTO DO PROJETO: CRYPTOBINGO (WEB2.5 / WEB3 dAPP)

## 1. Visão Geral
O **CryptoBingo** é uma plataforma descentralizada de Bingo construída na rede Antelope/WAX. O sistema opera num modelo Web2.5: combina a velocidade e a UX da Web2 (geração de cartelas off-chain, interfaces React rápidas) com a segurança, transparência e liquidação financeira da Web3 (Smart Contracts, Oráculos RNG, NFTs de utilidade).

## 2. Stack Tecnológica
* **Monorepo:** Turborepo com gereciamento de pacotes via `pnpm` workspaces.
* **Blockchain:** Rede Antelope/WAX (Desenvolvimento local emulado via `dune`).
* **Smart Contracts:** C++ (Compilado para WebAssembly/WASM com ABI gerado).
* **Frontend:** React, Vite, TypeScript, `i18next` (PT, EN, ZH), Wharfkit (SessionKit/WebRenderer para login Web3 nativo e local).
* **API Gateway:** Node.js, Express, TypeScript, Mongoose (MongoDB), `pg` (PostgreSQL).
* **Worker (Game Loop):** Node.js, TypeScript, RabbitMQ (`amqplib`), Wharfkit (transações automatizadas).
* **Infraestrutura/DevOps:** Docker Compose (Postgres, Mongo, RabbitMQ, Prometheus, Grafana, cAdvisor).

## 3. Decisões Arquiteturais e de Segurança (ADRs Críticos)

### ADR 1: Ledger Interno (Balanço Custodiado)
Para evitar a assinatura de múltiplas ações (transferência + compra) a cada rodada e poupar CPU/NET, o contrato `bingogamectr` possui uma tabela interna `balances`. 
* **Fluxo:** O utilizador deposita o token `BINGO` (via contrato `bingogametkn`). O contrato de jogo escuta o depósito via `on_notify` e credita o saldo. As compras de cartelas (`buytickets`) debitam apenas deste ledger interno.

### ADR 2: Transações Atómicas com Assinatura de Servidor (Server-Signed Tickets)
Para impedir que jogadores mal-intencionados gerem cartelas fraudulentas no cliente, o Frontend pede a cartela ao Backend (`/api/v1/tickets/generate`). 
* O Backend gera a matriz 5x5 (25 números), faz o hash (`SHA256`) e assina criptograficamente via ECDSA usando a `MICROSERVICE_PRIVATE_KEY`. 
* O contrato C++ recebe a matriz e a assinatura, recria o hash e valida com `assert_recover_key` usando uma `public_key` previamente registada. Só então a cartela é cunhada (minted) na tabela on-chain.

### ADR 3: Oráculo e Sorteio (RNG)
O sorteio não é processado no Backend. O contrato invoca o Oráculo da WAX (`orng.wax` via ação `requestrand`). O oráculo devolve os números aleatórios através da ação de callback `receiverand`, garantindo um sorteio on-chain matematicamente provável e auditável.

### ADR 4: Utility NFTs Dinâmicos (AtomicAssets)
O contrato integra-se com o padrão AtomicAssets. Benefícios (como descontos) não estão hardcoded. 
* O contrato possui uma tabela de configuração `nftconfigs` (gerida pelo admin) que mapeia um `template_id` a benefícios (ex: 10% de desconto, VIP).
* Na hora da compra (`buytickets`), o jogador passa o `nft_id`. O contrato verifica no AtomicAssets se o utilizador possui o NFT e cruza com a `nftconfigs` para aplicar o desconto de forma otimizada (baixo custo de CPU).

## 4. Estrutura dos Smart Contracts
* **Contrato `bingogametkn`**: Standard `eosio.token` (isolado para simular o ambiente Mainnet da WAX).
* **Contrato `bingogamectr`**:
  * `setconfig`: Configura a chave pública do backend.
  * `creategame`: Inicia uma sala de bingo (`funding`).
  * `setnftconf` / `delnftconf`: Gere benefícios de NFTs.
  * `deposit` / `withdraw`: Gere a `balances_table`.
  * `buytickets`: Compra cartelas, valida assinaturas e NFTs.
  * `lockgame`: Fecho de vendas (Invocado pelo Worker via RabbitMQ).
  * `startdraw`: Aciona o oráculo.
  * `receiverand`: Callback do oráculo que define o resultado.
  * `claimwin`: Executa o cálculo de prémios. Em jogos com `gametype_id` definido, paga com base no weight do padrão vencedor (max_weight rule): `ticket_price × base_multiplier × win_weight / 100`. Modo legado (`gametype_id=0`) mantém RTP fixo de 85% do `total_wagered`. Distribui também o `sponsor_pool` integralmente (multidrop).

## 5. Estrutura do Monorepo Off-Chain
* **`@cryptobingo/api-gateway`**: Ouve na porta `8082`. Conectado ao Mongo (Perfis) e Postgres (Ledger). Possui as rotas `/profile` e a rota crítica de geração/assinatura de cartelas.
* **`@cryptobingo/worker-game-loop`**: Ouve a fila `game_loop_events` no RabbitMQ. Conectado diretamente à blockchain (com a Private Key do microserviço). Executa transações como `lockgame`, `startdraw` e efetua a varredura lógica (Evaluator matemático 5x5) para acionar o `claimwin`.
* **`@cryptobingo/blockchain-core`**: Pacote interno encapsulando as chamadas RPC (`fetchGame`, `fetchPlayerTickets`) para ser reutilizado.
* **`@cryptobingo/frontend`**: Ouve na porta `5173`. Interface React conectada ao Wharfkit local (`WalletPluginPrivateKey`) para login de desenvolvimento. Mostra o Lobby e o saldo extraído diretamente da blockchain, sem depender do backend para a leitura de tabelas (`get_table_rows`).

## 6. Estado Atual do Desenvolvimento
* Toda a infraestrutura Docker (Dune, Mongo, Postgres, RabbitMQ) está operacional.
* Os contratos C++ foram refatorados, estabilizados, compilados (ABI e WASM atualizados) e incluem a documentação Ricardiana completa.
* A Autenticação Web3 via Wharfkit está finalizada e em funcionamento no React.
* O Lobby renderiza o saldo real da `balances_table` e as salas ativas da `games_table`.

## 7. Próximos Passos Imediatos (Para Foco da IA)
1. **Frontend / Backend:** Implementar a lógica de geração atómica das matrizes 5x5 (`ticketController.ts` na API) e atualizar o Frontend (`Lobby.tsx`) para invocar a API e empacotar a ação `buytickets` para a blockchain.
2. **Frontend:** Renderizar visualmente a grelha (grid) 5x5 das cartelas adquiridas no dashboard do utilizador.
3. **Mecânica:** Consolidar a integração das mensagens do RabbitMQ no Worker para orquestrar o fim das vendas e o sorteio.

## 8. DIRETRIZES DE SDD (SYSTEM/SOFTWARE DESIGN DOCUMENT)
Esta célula de engenharia opera sob o paradigma **Document-Driven Development**. Nenhuma alteração arquitetural crítica deve ser feita sem refletir o seu impacto no SDD do projeto.

Ao interagir com a arquitetura do CryptoBingo, você DEVE observar as seguintes regras de documentação:

* **Manutenção de ADRs (Architecture Decision Records):** Sempre que uma nova decisão técnica de alto impacto for tomada (ex: mudança no fluxo de oráculos, alteração no modelo de dados do MongoDB ou nas tabelas C++), gere automaticamente um novo ficheiro markdown em `docs/adr/` (ex: `ADR-003-nome-da-decisao.md`) detalhando o Contexto, a Decisão, as Consequências e o Status.
* **Contratos de API Vivos:** Se as rotas do Node.js/Express forem alteradas, as especificações no `docs/openapi.yaml` e `docs/asyncapi.yaml` (para mensageria RabbitMQ/WebSockets) DEVEM ser atualizadas na mesma iteração.
* **Mapeamento de Estados (FSM):** O jogo obedece a uma Máquina de Estados Finita (Funding -> Locked -> Drawing -> Drawn -> Archived). Sempre que sugerir código que altere a mecânica, forneça ou atualize os diagramas de fluxo de estado usando sintaxe **Mermaid.js**.
* **Topologia e Infraestrutura:** Mudanças em contêineres Docker, port forwards ou novas dependências estruturais (ex: novos plugins do Wharfkit) devem ser refletidas em `docs/architecture.md` e `docs/SPEC.md`.
* **Rastreabilidade Bidirecional:** O código gerado deve ser mapeável para um requisito do SDD. Comente o código com referências à documentação (ex: `// Ref: ADR-001 - Assinatura Contextual Atômica`).

## 9. PARADIGMA DE EXECUÇÃO: SPEC-DRIVEN DEVELOPMENT & API-FIRST
Esta engenharia opera estritamente sob o paradigma **Spec-Driven Development**. O código nunca antecede o contrato. Toda interação, rota ou evento deve seguir este fluxo obrigatório:

1. **Contract-First (O Contrato Dita a Regra):** Antes de escrever uma única linha de código TypeScript no Express ou um consumidor no RabbitMQ, o contrato DEVE ser desenhado e validado nos arquivos de especificação (`docs/openapi.yaml` para REST, `docs/asyncapi.yaml` para eventos).
2. **Single Source of Truth (Fonte Única da Verdade):** Os arquivos `docs/SPEC.md` e `docs/COMPLIANCE.md` representam a autoridade máxima do projeto. Se o código diverge da especificação, o código está incorreto e deve ser refatorado.
3. **Sincronia de Tipagem (Type Safety):** Qualquer alteração nos arquivos YAML ou nas tabelas C++ deve engatilhar uma atualização imediata no pacote `@cryptobingo/shared-types`. A tipagem deve refletir perfeitamente o contrato especificado.
4. **Harness & Spec Testing:** O pacote `apps/harness` deve ser utilizado para validar se a implementação da API e dos Smart Contracts obedece rigorosamente às restrições estipuladas no `openapi.yaml` e no `SPEC.md` (tipos de dados, status HTTP, payloads de erro).
5. **Proibição de "Shadow APIs":** É terminantemente proibido criar rotas, eventos ou ações de Smart Contract (ABI) não documentadas. A IA deve auditar cruzadamente a especificação antes de aprovar a implementação.

## 10. WORKFLOW DE EXECUÇÃO AGÊNTICA (Padrão Claude Desktop & Rastreabilidade)
Esta célula de engenharia atua como um parceiro de codificação avançado. Como você não edita arquivos diretamente no disco do usuário, você DEVE gerar saídas otimizadas para copiar/colar e gerenciar ativamente o estado do projeto seguindo este ciclo de vida:

### A. Gestão de Estado Contínuo (Documentação Viva)
Sempre que concluir um lote de código ou resolver um bug, você tem a obrigação de gerar os blocos de texto atualizados para os seguintes arquivos:
* **`TASKS.md` (O Backlog):** Marque tarefas concluídas (`[x]`), insira subtarefas descobertas e reavalie prioridades. Entregue o markdown atualizado para que o usuário possa sobrescrever o arquivo local.
* **`TRACE.md` (O Diário de Bordo):** Registre sessões de depuração. Ao resolver um erro no terminal, documente o Sintoma, a Causa Raiz (RCA) e a Solução. O Claude utilizará este arquivo como memória de longo prazo nas próximas iterações.
* **Criação de ADRs (`docs/adr/`):** Qualquer alteração estrutural no ecossistema (banco de dados, contratos, fluxo de eventos) exige que você forneça o conteúdo completo para um novo arquivo ADR (ex: `ADR-004-nome.md`).

### B. Protocolo de Geração de Código (Anti-Preguiça e Precisão)
* **Zero Placeholders:** Ao fornecer a atualização de um arquivo, NUNCA utilize placeholders preguiçosos como `// ... código anterior` ou `// ... resto da função`. Se o arquivo for pequeno/médio, reescreva-o por completo. Se for muito grande, forneça o trecho exato de "Buscar por:" e "Substituir por:".
* **Cabeçalhos de Arquivo Exatos:** Sempre coloque o caminho completo do arquivo como comentário na primeira linha do bloco de código (ex: `// apps/api-gateway/src/controllers/ticketController.ts`) para facilitar a navegação do usuário.
* **Proibição de Deleção Silenciosa:** Nunca remova código existente, tipagens ou validações de segurança para encurtar a sua resposta.
* **Auditoria de Regressão Sistêmica:** Antes de enviar a resposta final, faça uma autoavaliação (CoVe): A sua sugestão no Frontend quebra a interface do Smart Contract? O novo endpoint no Express foi atualizado no `@cryptobingo/shared-types`? Se sim, forneça as atualizações de todos os arquivos impactados no mesmo lote.