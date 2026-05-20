# Documentação de Arquitetura e Fluxos do Sistema

**Domínio:** Plataforma Descentralizada de Bingo GameFi
**Padrão de Diagramação:** Mermaid.js (Diagrams-as-Code)

Este documento centraliza a representação visual dos fluxos de dados, da infraestrutura de implantação e da máquina de estados do Smart Contract. Ele serve como mapa de navegação primário para novos desenvolvedores entenderem a fronteira entre On-chain (Antelope/WAX) e Off-chain (Node.js/React).

---

## 1. Topologia Macro e Infraestrutura Híbrida (CQRS)

O sistema utiliza o padrão Command Query Responsibility Segregation (CQRS). Operações de alta segurança e movimentação financeira ocorrem on-chain (Command), enquanto a leitura, resolução algébrica e transmissão de eventos em tempo real ocorrem off-chain (Query/Stream).

```mermaid
graph TD
    %% Atores e Clientes
    Player[📱 Celular do Jogador]
    CloudWallet[☁️ WAX Cloud Wallet]

    %% Camada de Backend (Kubernetes)
    subgraph "Cluster Kubernetes (Microsserviço Node.js)"
        Ingress[🌐 NGINX Ingress]
        Broadcaster[📡 Broadcaster Workers\n(WebSocket / Alto RAM)]
        Resolution[⚙️ Resolution Engine\n(Bitmasking / Alta CPU)]
        Redis[(🗄️ Cluster Redis\nÍndice Invertido & Pub/Sub)]
    end

    %% Camada Blockchain (Antelope/WAX)
    subgraph "Blockchain WAX (Imutável)"
        Contract[📜 Smart Contract\n(bingo.cpp)]
        Oracle[🎲 orng.wax\n(Oráculo de Entropia)]
        EosioToken[🪙 eosio.token\n(Contrato Base)]
    end

    %% Conexões Frontend
    Player <-->|1. Autenticação & Assinatura| CloudWallet
    Player <-->|2. Eventos Socket.io (Slow Reveal)| Ingress
    Player -->|3. RPC API (Checkout/Saques)| Contract
    
    %% Conexões Backend Internas
    Ingress <--> Broadcaster
    Broadcaster <-->|Subscribe| Redis
    Resolution <-->|Atualiza Índices/Bitmask| Redis

    %% Conexões Backend <-> Blockchain
    Resolution -->|4. Indexa State Stream| Contract
    Resolution -->|5. Assina claimwin() O_1| Contract
    Oracle -->|6. Callback RNG| Contract
    Contract <-->|7. Multidrop Payout| EosioToken

```

---

## 2. Máquina de Estados Finita (FSM) do Smart Contract

A FSM do contrato C++ é estritamente linear e bloqueante. Validações de estado (`eosio::check` ou `assert`) impedem que ações sejam chamadas fora de ordem temporal, protegendo a economia do DApp.

```mermaid
stateDiagram-v2
    [*] --> CREATED: creategame()\n[Admin]
    
    CREATED --> FUNDING: Transition Trigger\n[Backend / Cron]
    note right of FUNDING
        buytickets() liberado.
        Cartelas são alocadas na RAM em lote.
    end note

    FUNDING --> LOCKED: lockgame()\n[Backend]
    note left of LOCKED
        Vendas encerradas.
        Backend monta Índice Invertido no Redis.
    end note

    LOCKED --> DRAWING: receiverand()\n[orng.wax Oracle]
    note right of DRAWING
        Entropia recebida determinística.
        Array de 75 dezenas preenchido.
    end note

    DRAWING --> ARCHIVED: claimwin()\n[Backend]
    note right of ARCHIVED
        Payout Multidrop executado O(1).
        Início da Quarentena (24h).
    end note

    LOCKED --> ABORTED: abortgame() / Oráculo Timeout
    DRAWING --> ABORTED: abortgame() / Erro de Quórum
    note left of ABORTED
        Fail-Safe ativado.
        refundticket() liberado O(1) para saques estornados.
    end note

    ARCHIVED --> [*]: cleargame() / Erase RAM
    ABORTED --> [*]: cleargame() / Erase RAM

```

---

## 3. Diagrama de Sequência: Do Patrocínio ao "Winner Found"

Este fluxo detalha a linha do tempo (Timeline) que sustenta o motor de patrocínio B2B (Trustless Sponsorship) e o desacoplamento visual via WebSockets (Slow Reveal).

```mermaid
sequenceDiagram
    autonumber
    actor Sponsor as 👽 Alien Worlds (B2B)
    actor Player as 📱 Frontend (Celular do Jogador)
    participant Backend as ⚙️ Node.js Engine
    participant Redis as 🗄️ Redis (Pub/Sub)
    participant Contract as 📜 Smart Contract
    participant Oracle as 🎲 WAX Oracle

    %% Setup do Patrocínio
    Note over Sponsor, Contract: Fase 1: Injeção de Liquidez Trustless
    Sponsor->>Contract: eosio.token::transfer (1000 TLM, memo: "campaign_1")
    Contract-->>Contract: Atualiza tabela `campaigns` (total_budget: 1000 TLM)
    Backend->>Contract: linkgame(game_id: 105, campaign_id: 1)
    Contract-->>Contract: Injeta 50 TLM no `sponsor_pool` do Jogo 105

    %% Compra de Cartelas
    Note over Player, Backend: Fase 2: Geração de Cartelas e Checkout
    Player->>Backend: GET /api/v1/games/105/tickets/generate?count=3
    Backend-->>Player: Retorna Array com Matrizes + Signature ECDSA
    Player->>Contract: buytickets(matrices, signature)
    Contract-->>Contract: recover_key() -> Assinatura da Casa Válida! Debita Wallet Interna.

    %% Sorteio e Resolução O(1)
    Note over Backend, Oracle: Fase 3: Fechamento e Entropia On-chain
    Backend->>Contract: lockgame()
    Backend->>Redis: Lê RAM On-chain e Constrói Índice Invertido
    Contract->>Oracle: request_random()
    Oracle-->>Contract: receiverand(75_dezenas_hash)
    
    %% O Slow Reveal e Payout
    Note over Player, Backend: Fase 4: Slow Reveal Visual e Payout Multidrop
    Backend->>Redis: Inicia Bitmasking Algebraico O(1)
    loop A cada 3 segundos
        Backend->>Redis: PUBLISH `ball_drawn`
        Redis-->>Player: WebSocket Event (Bola Cai na Tela)
    end
    Backend-->>Backend: Bitmask match! Winner Found (Ticket 88)
    Backend->>Contract: claimwin(ticket_88, ball_count, win_pattern)
    Contract-->>Contract: Transfere WAX (RTP) + TLM (Sponsor) para Vencedor O(1)
    Backend->>Redis: PUBLISH `winner_found`
    Redis-->>Player: WebSocket Event (Animação de BINGO! Saldo Atualizado)

```

