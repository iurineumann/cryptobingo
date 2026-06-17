# CryptoBingo — Visão Geral do Produto

## 1. Visão Geral

O CryptoBingo é uma plataforma descentralizada de bingo construída na blockchain WAX (Antelope). Combina a experiência de usuário fluida da Web2 com a transparência e segurança da Web3 — provadamente justo, auditável e com liquidação financeira instantânea.

**Modelo de negócio:** RTP 85% / GGR 15%. Receita do operador provém da margem entre aposta total e prêmios pagos.

**Duas frentes de atuação:**
- **B2C:** Venda direta de cartelas para jogadores.
- **B2B:** Motor de campanhas patrocinadas — projetos parceiros distribuem seus tokens como prêmios adicionais.

---

## 2. Para Jogadores

### Como funciona

1. O jogador deposita tokens (WAX, BINGO) em sua carteira interna na plataforma.
2. Escolhe uma sala ativa, compra cartelas 5×5 com um ou mais números.
3. Ao fim do período de vendas, o sorteio é acionado on-chain via oráculo WAX — matematicamente impossível de fraudar.
4. As bolas são reveladas uma a uma em tempo real (Slow Reveal). Quando uma cartela completa um padrão vencedor, o prêmio é creditado automaticamente.
5. O jogador pode sacar seus ganhos a qualquer momento.

### Por que jogar no CryptoBingo

- **Provably Fair:** O sorteio acontece na blockchain, não no servidor da plataforma.
- **Sem fricção:** Checkout em lote — compre dezenas de cartelas em uma única transação.
- **Multidrop:** Um mesmo jogo pode pagar prêmios em múltiplos tokens (WAX, BINGO, tokens de parceiros).
- **Fail-safe:** Se algo der errado, o contrato devolve os tokens automaticamente.

### Jornada do jogador

```
Descobrir → Depositar → Escolher sala → Comprar cartelas → Assistir sorteio ao vivo → Receber prêmios → Sacar
```

---

## 3. Para Sponsors (Parceiros B2B)

Projetos podem patrocinar salas de bingo para distribuir seus tokens como prêmio. O sponsor deposita tokens no contrato (trustless — plataforma não tem custódia), aloca por partida, e o contrato distribui automaticamente aos vencedores.

### Benefícios

- **Visibilidade:** Token aparece como prêmio em salas ativas.
- **Volume:** Cada partida patrocinada gera circulação do token.
- **Trustless:** Sponsor mantém controle sobre o depósito — pode reaver saldo não alocado.

### Como funciona

1. Sponsor deposita tokens no contrato.
2. Cria uma campanha com orçamento total e valor por partida.
3. Vincula a campanha a uma ou mais salas.
4. A cada partida, o contrato distribui o valor patrocinado ao vencedor — junto com o prêmio principal.

---

## 4. Para Admins

A plataforma oferece painel administrativo para:

- Gerenciar salas (criar, ativar, pausar, fechar).
- Configurar tipos de jogo (gametypes), padrões vencedores e pesos.
- Calibrar pesos via simulação Monte Carlo para atingir RTP 85%.
- Gerenciar NFTs de utilidade (descontos, acesso VIP).
- Acompanhar métricas de GGR, RTP e volume.

---

## 5. Roadmap (Alto Nível)

| Fase | Funcionalidade | Status |
|---|---|---|
| **Core v1** | Ciclo completo de jogo, cartelas, payout básico | ✅ |
| **Salas** | Salas persistentes com auto-scheduling | 🚧 |
| **Draw Modes** | Golden Ball, Multi-match, First Full | 🚧 |
| **Drop Vault** | Distribuição de tokens/NFTs por patrocinadores | 🚧 |
| **NFTs** | Utilitários (desconto, VIP), NFTs de uso único | 🚧 |
| **Swap B2B** | Troca BINGO ↔ tokens parceiros | 🔮 |
| **Rankings** | Sistema de classificação e conteúdo dinâmico | 🔮 |

---

## 6. KPIs de Negócio

- **RTP:** 85% (calibrado por Monte Carlo).
- **Volume B2B:** Mínimo 3 campanhas patrocinadas ativas simultaneamente.
- **Conexões simultâneas:** Suporte a 50.000 conexões WebSocket sem perda de pacotes.
- **Latência do broadcaster:** < 200ms entre revelação da bola e UI do jogador.
