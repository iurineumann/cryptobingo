# ADR 002: Arquitetura Off-Chain, Persistência Poliglota e Tokenomics via INO

**Data:** Maio de 2026
**Status:** Aceito
**Contexto:**
O contrato inteligente on-chain está homologado. Precisamos definir a arquitetura de suporte off-chain para gerir sessões de jogos, interface do usuário (UI), chat, perfis e a economia de entrada na plataforma sem sobrecarregar a blockchain principal.

**Decisões Técnicas:**
1.  **Orquestração e Containers:** Todos os microsserviços serão conteinerizados via Docker e orquestrados em Kubernetes. Isso garante que *Workers* de fila (Game Loop) escalem de forma independente da API de Chat.
2.  **Mensageria (RabbitMQ):** Adotado para evitar perda de transações de fechamento de Lobbies por lentidão ou rejeição temporária do nó RPC da blockchain.
3.  **Bancos Híbridos:** PostgreSQL adotado para integridade transacional e adequação contábil (LGPD / Lei 14.790/2023). MongoDB adotado para velocidade em dados não-estruturados (chat, cache de frontend).
4.  **Tokenomics (INO + Backed Tokens):** A plataforma terá o token `$BINGO`. Para o *Cold Start* financeiro, adotamos o modelo INO com *AtomicAssets Backed Tokens*. Jogadores compram NFTs com lastro garantido em `$BINGO` e executam o *burn* para receber liquidez.

**Consequências:**
* *Positivas:* Alta atração de capital inicial de investidores na WAX (por causa do lastro em NFTs). Separação estrita entre dados auditáveis (Postgres) e dados efêmeros (Mongo).
* *Negativas/Riscos:* Aumento da complexidade de DevOps. Requer infraestrutura robusta para manter RabbitMQ e dois bancos de dados altamente disponíveis.