# STORIES.md — Histórias de Usuário

> Organizadas por épico. Formato: "Como **ator**, quero **ação** para **benefício**."
> Prioridade: 🔥 Crítica | ⚡ Alta | 📌 Média | 🧊 Baixa

---

## Épico 1: Core Blockchain & Tokenomics

### S1.1 — Criação de Jogos 🔥
Como **administrador**, quero criar jogos com preço de cartela configurável para definir a economia de cada rodada.

### S1.2 — Depósito Multimoeda 🔥
Como **jogador**, quero depositar múltiplos tokens (WAX, BINGO, TLM) em uma wallet interna para não pagar taxa de transação a cada compra.

### S1.3 — Compra de Cartela com Desconto NFT 🔥
Como **jogador**, quero usar meus NFTs utilitários para receber desconto na compra de cartelas.

### S1.4 — Saque a Qualquer Momento 🔥
Como **jogador**, quero sacar meus fundos da wallet interna a qualquer momento sem burocracia.

### S1.5 — Padrões de Vitória Customizáveis ⚡
Como **administrador**, quero criar novos padrões de vitória (ex: "Letra G", "X", "Cartela Cheia") sem redeploy do contrato para lançar promoções sazonais.

### S1.6 — Modos de Jogo com Multiplicadores ⚡
Como **administrador**, quero configurar tipos de jogo com multiplicadores de prêmio por padrão para oferecer variedade de risco/recompensa.

### S1.7 — Estorno Automático em Falha 🔥
Como **jogador**, quero receber reembolso integral se o sorteio falhar para não perder dinheiro por problemas técnicos.

---

## Épico 2: API Gateway & Serviços Off-Chain

### S2.1 — Login com Carteira 🔥
Como **jogador**, quero fazer login assinando um desafio com minha carteira WAX para não precisar criar senha.

### S2.2 — Perfil com Preferências 🔥
Como **jogador**, quero salvar meu idioma e preferências no servidor para ter uma experiência consistente entre dispositivos.

### S2.3 — Geração de Cartelas Assinadas 🔥
Como **sistema**, quero gerar cartelas criptograficamente assinadas para impedir que jogadores fraudem as matrizes.

### S2.4 — Gerenciamento de Padrões via API ⚡
Como **administrador**, quero criar, listar, atualizar e deletar padrões de vitória via API REST para automatizar campanhas.

### S2.5 — Simulação de Pesos com Monte Carlo ⚡
Como **administrador**, quero simular pesos de padrões contra o RTP alvo para garantir a sustentabilidade econômica antes de ativar um modo de jogo.

### S2.6 — Histórico de Transações 📌
Como **jogador**, quero consultar meu histórico de depósitos, compras e prêmios para controle financeiro pessoal.

---

## Épico 3: Game Loop Worker & Motor de Resolução

### S3.1 — Travamento Automático 🔥
Como **sistema**, quero travar as vendas de um jogo quando o tempo expirar para iniciar o sorteio pontualmente.

### S3.2 — Sorteio com Oráculo 🔥
Como **sistema**, quero solicitar entropia ao oráculo WAX para garantir que o resultado é imparcial e auditável.

### S3.3 — Detecção de Vencedores 🔥
Como **sistema**, quero varrer todas as cartelas de um jogo e detectar vencedores usando bitmasking para executar o pagamento em O(1).

### S3.4 — Pagamento Automático Multidrop 🔥
Como **sistema**, quero creditar o prêmio RTP (85%) + tokens de patrocinadores automaticamente na wallet do vencedor para cumprir a Lei 14.790/2023.

### S3.5 — Slow Reveal com WebSocket ⚡
Como **jogador**, quero ver as bolas sendo reveladas uma a cada 3 segundos para ter uma experiência dramática e imersiva.

### S3.6 — Resiliência a Falhas 🔥
Como **sistema**, quero reprocessar mensagens da fila em caso de falha transitória do nó RPC para não perder eventos de jogo.

---

## Épico 4: Frontend & Experiência Web3

### S4.1 — Login com Anchor/Cloud Wallet 🔥
Como **jogador**, quero conectar minha Anchor Wallet ou WAX Cloud Wallet com um clique para começar a jogar rapidamente.

### S4.2 — Lobby com Jogos Ativos 🔥
Como **jogador**, quero ver os jogos disponíveis, preços das cartelas e meu saldo diretamente no lobby para decidir onde jogar.

### S4.3 — Compra de Múltiplas Cartelas 🔥
Como **jogador**, quero comprar várias cartelas de uma vez para aumentar minhas chances sem repetir o processo.

### S4.4 — Dashboard com Cartelas 5x5 ⚡
Como **jogador**, quero ver minhas cartelas em grid 5x5 com os números marcados automaticamente durante o sorteio para acompanhar meu progresso.

### S4.5 — Painel Administrativo Visual 🧊
Como **administrador**, quero criar padrões de vitória clicando em uma grade 5x5 visual para não precisar calcular bitmasks manualmente.

### S4.6 — Notificação de Vitória em Tempo Real ⚡
Como **jogador**, quero receber uma notificação animada quando ganhar para celebrar o momento.

### S4.7 — Múltiplos Idiomas 🔥
Como **jogador** chinês/brasileiro/americano, quero usar a plataforma no meu idioma nativo para me sentir confortável.

---

## Épico 5: Infraestrutura, Compliance & Produção

### S5.1 — Ambiente Local Reproduzível 🔥
Como **desenvolvedor**, quero subir todo o ambiente com `docker compose up` para desenvolver sem depender de rede externa.

### S5.2 — Métricas e Dashboards 🔥
Como **operador**, quero ver métricas de performance, filas e blockchain em um dashboard Grafana para monitorar a saúde do sistema.

### S5.3 — Deploy Automatizado ⚡
Como **devops**, quero que cada push na main dispare CI/CD com testes, build e deploy para garantir qualidade.

### S5.4 — Conformidade com Lei 14.790 🔥
Como **auditor**, quero verificar que o RTP de 85% está hardcoded no contrato e visível no action log para certificar a conformidade regulatória.

### S5.5 — Privacidade LGPD 🔥
Como **usuário**, quero que meus dados pessoais nunca sejam armazenados na blockchain para exercer meu direito de exclusão.

### S5.6 — Recuperação de Desastres ⚡
Como **operador**, quero um playbook de DR para restaurar o serviço em menos de 1 hora em caso de falha catastrófica.
