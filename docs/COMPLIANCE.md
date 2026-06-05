# COMPLIANCE.md: Diretrizes de Conformidade, Ética e Regulação

**Domínio:** Plataforma Descentralizada de Bingo GameFi
**Jurisdição Base de Análise:** Brasil (Lei 14.790/2023 e Lei 13.709/2018)
**Padrão de Auditoria:** Provably Fair Algorithmic Design

---

## 1. Integridade Criptográfica (Provably Fair)

Para que um sistema de sorteio seja classificado como *Provably Fair* (Comprovadamente Justo), deve ser matematicamente impossível para o Operador (Casa) e para o Jogador manipularem ou preverem o resultado. O sistema atinge este grau através de responsabilidades segregadas.

### 1.1. Injeção de Entropia (O Sorteio)

A geração das dezenas não ocorre no Microsserviço (Backend), eliminando o risco de a Casa forjar números para evitar o pagamento de prêmios (Jackpots).

* A entropia é fornecida pelo oráculo nativo da rede Antelope (`orng.wax`).
* O oráculo assina a *seed* externamente usando criptografia RSA.
* O Smart Contract verifica a assinatura nativamente no protocolo antes de aplicar o algoritmo determinístico que deriva as 75 dezenas, garantindo que os *Block Producers* da rede não manipularam o timestamp do bloco para influenciar o jogo.

### 1.2. Prevenção de Injeção de Estado (Cartelas)

Para impedir que jogadores forjem cartelas perfeitas:

* O Microsserviço atua como Autoridade Certificadora (CA). Ele emite a matriz e aplica uma assinatura ECDSA sobre o *hash* dos dados.
* O Smart Contract exige a apresentação desta assinatura no ato da action `buytickets()`, aplicando a função `recover_key`. O fluxo garante que a cartela vendida foi gerada sob a entropia limpa da plataforma e não adulterada no cliente.

---

## 2. Adequação à Lei 14.790/2023 (Apostas de Quota Fixa)

O marco regulatório brasileiro para apostas exige transparência financeira absoluta e segregação de patrimônio. A arquitetura on-chain atende a esses requisitos de forma nativa e imutável.

### 2.1. Segregação Patrimonial

A lei exige que o dinheiro dos apostadores não se misture com o caixa operacional da empresa.

* **Aplicação Técnica:** O contrato inteligente utiliza tabelas de memória (`tables`) distintas. A tabela `balances` age como uma *escrow* (conta de garantia) inviolável. O saldo ali presente é de propriedade criptográfica exclusiva do `account_name` do jogador. O código C++ impede, via `assert`, que a chave administrativa da plataforma execute saques na tabela `balances` dos usuários.

### 2.2. Transparência de RTP e GGR

A plataforma deve deixar claro qual é a taxa de retorno ao jogador ($RTP$) e a receita bruta do jogo ($GGR$).

* **Aplicação Técnica:** A matemática do prêmio é resolvida atomicamente na action `claimwin()`. A divisão do `total_wagered` é hardcoded no contrato.

$$GGR = \lfloor total\_wagered \times 0.15 \rfloor$$


$$RTP = total\_wagered - GGR$$



Esta fórmula garante que não haja perdas fracionárias (*Precision Loss*) e que as porcentagens exatas constem no Action Log público da blockchain para auditoria em tempo real.

### 2.3. Distribuição Automatizada

A lei veda que a operadora atrase propositalmente os pagamentos.

* **Aplicação Técnica:** A arquitetura descentralizada elimina o "fator humano" da tesouraria. No exato bloco de rede em que a resolução matemática via Bitmasking confirma o vencedor, a action `claimwin()` credita o saldo líquido (RTP e Tokens Patrocinados) de forma instantânea e atômica.

---

## 3. Conformidade com a LGPD (Lei 13.709/2018)

A natureza imutável das blockchains entra em atrito com a Lei Geral de Proteção de Dados (especificamente o Art. 18, Direito à Eliminação de Dados). O design contorna isso através do princípio da Minimização e Pseudo-anonimização.

### 3.1. Ausência de PII (Personally Identifiable Information) On-Chain

* O Smart Contract e a rede WAX **não armazenam** nomes reais, CPFs, e-mails ou endereços IP.
* A chave primária identificadora do sistema é o `account_name` (ex: `jogador.wax`), que atua como um pseudônimo. A correlação entre o pseudônimo e a identidade real do usuário (se necessário para processos de KYC e saque em moeda fiduciária) ocorre **exclusivamente off-chain** em bancos de dados tradicionais (PostgreSQL/Redis), permitindo a exclusão sumária (Hard Delete) caso o usuário exerça seu direito de exclusão.

### 3.2. Gerenciamento de Sessão Transiente

* O Frontend não mantém logs persistentes de comportamento associados ao dispositivo físico. O estado do `WharfKit SessionKit` é armazenado localmente no navegador (`localStorage`) e pode ser limpo pelo próprio usuário sem deixar rastros centralizados na infraestrutura da plataforma.

### 3.3. Retenção de Dados por Cumprimento de Obrigação Legal (Art. 7º, II)

* A exclusão de cartelas (`cleargame`) da RAM após a Quarentena de 24h atende à minimização de recursos, mas o Log Histórico de transações permanece imutável na blockchain. Isso é juridicamente amparado pela LGPD sob a base legal de Cumprimento de Obrigação Legal, uma vez que a retenção do recibo da aposta é obrigatória para prevenção à fraude e lavagem de dinheiro (AML).

---

## 4. Política de Contingência e Fail-Safes

A plataforma possui gatilhos de segurança para garantir a não-lesão ao consumidor em caso de falhas catastróficas de infraestrutura:

* **Fail-Safe de Estorno ($O(1)$ Refund):** O estado `ABORTED` da FSM assegura que atrasos do Oráculo superiores ao limite estabelecido acionem o protocolo de reembolso integral, livre de taxas, diretamente para a wallet interna do usuário, eliminando a retenção indevida de fundos.
