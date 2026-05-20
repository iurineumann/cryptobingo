# Product Brief: Bingo GameFi Platform

## 1. Visão Executiva (Elevator Pitch)
A plataforma é um DApp (Decentralized Application) de Bingo de quota fixa na rede Antelope (WAX). O objetivo é revolucionar o mercado tradicional de apostas entregando uma experiência de usuário (UX) de Web2 — com animações fluidas em tempo real no celular — garantida por uma arquitetura Web3 *Provably Fair*, transparente e com liquidação financeira instantânea. 

A plataforma atuará em duas frentes de monetização:
1. **B2C (Business-to-Consumer):** Venda direta de cartelas e retenção de GGR (House Edge).
2. **B2B (Business-to-Business):** Motor de campanhas patrocinadas, oferecendo a projetos parceiros (Sponsors) uma ferramenta de gamificação para distribuir seus tokens.

---

## 2. O Problema vs. A Nossa Solução

| O Problema do Mercado Atual | A Nossa Solução Arquitetural |
| :--- | :--- |
| **Caixa Preta:** Jogadores desconfiam que o cassino manipula o sorteio para não pagar prêmios acumulados. | **Provably Fair:** Entropia gerada via oráculo on-chain (`orng.wax`), impossível de ser fraudada pela casa. |
| **Fricção Web3:** Usuários de celular odeiam assinar dezenas de transações pop-ups para jogar. | **Reatividade Off-Chain:** O checkout ocorre em lote e a renderização do jogo acontece via WebSockets sem exigir assinaturas contínuas. |
| **Risco de Calote:** Plataformas centralizadas seguram o dinheiro em caso de falha do sistema. | **Fail-Safes On-Chain:** Se a rodada abortar, o estorno O(1) via smart contract devolve os tokens automaticamente à wallet do jogador. |
| **Isolamento de Liquidez:** Jogos suportam apenas a própria moeda. | **Multidrop Sponsorship:** O jogador pode comprar a cartela em WAX e ganhar 3 tokens diferentes de patrocinadores na mesma rodada. |

---

## 3. Casos de Uso Core (User Stories)

*   **O Jogador Casual (Mobile):** "Quero comprar 20 cartelas de uma vez para o sorteio de sexta-feira, fechar o aplicativo e, se eu ganhar, quero que o dinheiro já esteja na minha wallet quando eu abrir o celular de novo."
*   **O Patrocinador B2B:** "Quero depositar 10.000 tokens do meu projeto na plataforma de vocês de forma *trustless* para que sejam distribuídos em 50 rodadas, gerando visibilidade e volume para a minha moeda."
*   **O Auditor/Regulador:** "Preciso cruzar as vendas de cartelas com os hashes do sorteio para garantir que a plataforma reteve apenas os 15% de GGR estipulados pela Lei 14.790/2023."

---

## 4. Indicadores Chave de Sucesso (KPIs)

Para avaliarmos a saúde do desenvolvimento e do lançamento, a plataforma será medida por:
1.  **Latência do Broadcaster (Tech KPI):** O tempo entre a revelação da bola no WebSocket e a atualização da UI no celular deve ser inferior a 200ms para garantir o efeito de "Slow Reveal".
2.  **Densidade de Usuários (Scale KPI):** O HPA (Kubernetes) deve suportar o scale-up elástico de 1.000 para 50.000 conexões simultâneas no Socket.io sem perda de pacotes (`Packet Loss`).
3.  **Volume B2B (Business KPI):** Manter no mínimo 3 campanhas patrocinadas ativas (`campaigns`) girando simultaneamente para diluir o custo operacional da alocação de RAM do contrato.

---

## 5. Limitações de Escopo (Out of Scope - v1.0)
O que **NÃO** faremos no lançamento inicial para manter o cronograma enxuto:
*   Integração com PIX fiduciário on-chain (exigiria licenças bancárias complexas; na v1.0 operamos estritamente crypto-to-crypto via WAX).
*   Chat ao vivo entre jogadores nas salas (consumiria processamento desnecessário do Redis na primeira fase).