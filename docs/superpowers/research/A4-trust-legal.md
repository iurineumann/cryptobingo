# A4 — Trust + Legal Research (Jul 2026)
**Persona:** Compliance Officer
**Fontes:** Bets.io, Stake.com, Crypto.Games, Webopedia, Chainlink, HackenProof, Immunefi, KPMG, Sumsub, FinCEN, ANPD, AEPD, Chambers & Partners, WAX Docs

---

## 1. Páginas Legais — Conteúdo Mínimo por Tipo

### Terms of Service (ToS)
**Obrigatório em:** Bets.io, Stake, Crypto.Games, 21Bets, BetPanda, Bethog
**Tópicos obrigatórios:**
- Identificação do operador (nome legal, registro, jurisdição)
- Elegibilidade: idade mínima (18+/21+), jurisdições proibidas (US, UK, etc.)
- Conta do jogador: registro, segurança, um por pessoa, KYC (se aplicável)
- Regras financeiras: depósitos, saques, taxas, moedas aceitas, prazos
- Bônus e promoções: wagering requirements, expiry, abuso de bônus
- Regras de cada jogo (ou link para regras específicas)
- Propriedade intelectual, licenciamento de software
- Limitação de responsabilidade, indenização
- Rescisão: pela casa (violação de ToS) e pelo jogador (self-exclusion)
- Lei aplicável e foro (Curaçao, Costa Rica, Anjouan)
- Alterações dos termos (aviso prévio 14-30 dias)
- Canal de notificações (email)
- Acceptable Use Policy: abuso, bot, VPN, bonus hunting
- Força maior, falhas técnicas, rollback de resultados

### Privacy Policy
**Obrigatório em:** Todas as plataformas licenciadas, LGPD Art. 9, GDPR Art. 13-14
**Tópicos obrigatórios (LGPD + GDPR):**
- Controlador e DPO (nome, email, jurisdição)
- Dados coletados: nome, email, CPF (se KYC), IP, device fingerprint, cookies, transações
- Finalidades: operação, compliance AML, marketing (com consentimento)
- Bases legais (LGPD Art. 7, GDPR Art. 6): consentimento, obrigação legal, legítimo interesse
- Compartilhamento: provedores KYC, analytics (GA4), blockchain pública
- Direitos do titular (LGPD Art. 18, GDPR Art. 15-22): acesso, correção, exclusão, portabilidade
- Transferência internacional (GDPR Art. 44-49)
- Retenção e exclusão: política de prazos
- Cookies: consentimento prévio com granularidade (CookieConsent v3)
- LGPD-specific: DPO nomeado, registro de tratamento, DPIA se alto risco
- Blockchain disclaimer: dados on-chain são pseudônimos e imutáveis

### Risk Disclaimer
**Presente em:** Stake, Crypto.Games (como seção do ToS)
**Tópicos:**
- Gambling envolve risco financeiro — perdas possíveis
- Jogar com dinheiro que pode perder
- Crypto volatility pode afetar valor de depósitos e prêmios
- Resultados passados não garantem resultados futuros
- Smart contracts podem ter bugs (apesar de auditoria)
- Conexão internet, latência blockchain, falhas de rede
- Isenção: plataforma não responsável por perdas por jogo compulsivo
- Não considere gambling como investimento ou fonte de renda
- Dever do jogador de verificar legalidade na sua jurisdição

### Responsible Gaming Policy
**Presente em:** Stake, Crypto.Games, Bets.io, GamCare, BeGambleAware
**Tópicos obrigatórios (Lei 14.790/2023, Art. 33-34):**
- Ferramentas: deposit limits (diário/semanal/mensal), loss limits, session timers, reality checks
- Time-out (cooling-off): 1-30 dias, irreversível durante período
- Self-exclusion: 1 ano, 3 anos, 5 anos (Crypto.Games), com withdrawal obrigatório antes
- Sinais de alerta: aumentar apostas, esconder gastos, problemas financeiros
- Auto-avaliação: questionário de risco
- Links para help: GamCare (UK), Gamblers Anonymous, BeGambleAware, Jogadores Anônimos (BR)
- Menores de idade: proibição, verificação parental (LGPD Art. 14)
- Treinamento de equipe para identificar problem gambling
- Política de jogo por menores: zero tolerância, refund of deposits

### AML/CTF Policy
**Obrigatório em:** FinCEN (EUA), COAF (BR), FATF Recommendations
**Tópicos (Sumsub, KPMG, CheckFile, FinCEN 2026):**
- Registration as MSB (FinCEN) / SPSAV (BCB Brasil)
- Nomeação de Compliance Officer / COAF reporting
- Risk Assessment: produto, cliente, geográfico, canal
- KYC/CDD: identity verification, PEP screening, sanctions lists (OFAC, UN, EU)
- KYT (Know Your Transaction): blockchain analytics, chain-hopping detection
- Transaction Monitoring: thresholds, suspicious patterns, structuring
- SAR (Suspicious Activity Report) filing to FinCEN/COAF
- CTR (Currency Transaction Report): $10,000+ threshold
- Record-keeping: 5 anos (FATF), 10 anos (Brasil)
- Treinamento anual de equipe
- Independent audit function
- Crypto-specific: mixer/tumbler detection, privacy coin flags, DeFi routing
- Travel Rule (FATF Recommendation 16): VASP-to-VASP data sharing

### Dispute Resolution / Complaints Policy
**Presente em:** Stake, Bets.io, 21Bets
**Tópicos:**
- Canais: email support, ticket system, live chat
- SLA: 24h acknowledgement, 7-14 dias resolution
- Escalação: supervisor → compliance → ouvidoria → mediação externa
- Jurisdição: Curaçao eGaming / Anjouan / Costa Rica (conforme licença)
- Arbitragem online (ex: AAA, JAMS, CAM-CCBC)
- Período de contestação de resultados: 3-7 dias pós-jogo
- Rollback policy: erro técnico, fork de rede, ataque
- Chargeback/dispute: política anti-fraude
- Idioma: priority language (inglês, português)

---

## 2. LGPD + GDPR em Contexto Blockchain

### Desafio Central: Imutabilidade vs Direito à Exclusão
- GDPR Art. 17 e LGPD Art. 18, VI: titular pode exigir exclusão de dados pessoais
- Blockchain pública: dados escritos são imutáveis por design
- WAX não tem `delete` de transaction history — apenas `deferred` RAM pode ser liberada

### Solução de Arquitetura (já implementada no CryptoBingo)
**Data Minimization On-Chain:**
- Nenhum PII on-chain: apenas `account_name` (WAX pseudônimo), `asset_id`, `game_id`
- `account_name` é pseudônimo (irreversível sem correlação off-chain)
- Correlação PII ↔ pseudônimo apenas em PostgreSQL/Redis (deletável)

**Base Legal Aplicável:**
- Cumprimento de obrigação legal (LGPD Art. 7, II / GDPR Art. 6(1)(c)): AML record-keeping
- Legítimo interesse (LGPD Art. 7, IX / GDPR Art. 6(1)(f)): prevenção à fraude
- Hash de PII não é anonimização (AEPD: hash é pseudonimização)

**GDPR Art. 17(3)(e):** "Exercise or defence of legal claims" — blockchain records for AML/fraud prevention
**LGPD Art. 11, II, "a":** Dados sensíveis para cumprimento de obrigação legal

### Recomendações Legais (Chambers & Partners 2026, Chainlink, AEPD):
1. **Off-chain storage** com referência on-chain (hashes de prova, não dados brutos)
2. **Pseudonymisation** como mitigação de risco (não isenção total)
3. **Key destruction** como "functional erasure" — destruir chave que descriptografa dados on-chain
4. **DPIA** obrigatório antes do deploy (GDPR Art. 35)
5. **DPO** nomeado e acessível publicamente
6. **Registro de tratamento** (LGPD Art. 37)
7. Mecanismo claro para exercício de direitos: formulário web → verificação → exclusão off-chain + declaração de impossibilidade on-chain

---

## 3. Bug Bounty Program — Estrutura de Mercado

### Referências de Mercado (Jul 2026)
- **Immunefi:** 234 programas ativos, $3M max bounty (Ethena), triagem em horas
- **HackenProof:** 22 programas, $100K max (Dexalot)
- **Plataformas gerais:** HackerOne (2K+ programas), Bugcrowd (500K researchers)

### Severidade × NFT Rewards (Proposto para CryptoBingo)

| Severidade | Descrição | NFT Rarity | Max Supply | Reward |
|---|---|---|---|---|
| **Critical** | Perda de funds, bypass total de auth, RNG manipulation | Legendary 1/1 | 1 | NFT única, $5K-$10K |
| **High** | Comprometimento de sessão admin, escalação de privilégio | Epic | 5 | NFT, $1K-$5K |
| **Medium** | Vazamento de dados não-críticos, DoS parcial | Rare | 25 | NFT, $250-$1K |
| **Low** | UI/UX manipulation, info disclosure menor | Uncommon | 100 | NFT, $50-$250 |
| **Note** | Best practice, hardening, documentação | Common | ∞ | Reconhecimento público |

### Disclosure Flow (Padrão Immunefi/HackerOne)
1. **Report:** Email criptografado (pgp@cryptobingo.bet) ou formulário em landing page
2. **Acknowledgement:** < 24h (automated + humano)
3. **Triage:** 48h — classificação por severity
4. **Vulnerability fix:** Critical: 24h, High: 72h, Medium: 7d, Low: 14d
5. **Disclosure público:** 90 dias pós-fix (coordinated disclosure)
6. **Reward:** Entrega NFT na wallet indicada + opção de stablecoin (USDT on BSC/TRX)

### Hall of Fame
- Página pública na landing page /hall-of-fame
- Pesquisador Nome/Handle + Severidade + NFT recebida + data
- Top researcher anual ganha NFT especial + bônus

### Scope (Proposto)
- **In scope:** smart contract (WASM), API endpoints (api-gateway), worker-game-loop, frontend auth
- **Out of scope:** social engineering, DoS, self-XSS, already-known bugs, 3rd party infra

---

## 4. Proof of Fairness — O que Documentar

### Referências de Mercado
- **Stake.com:** /provably-fair — overview, implementation, verification, game events, seed management
- **Crypto.Games:** provably fair page com step-by-step verification + 3rd party tools
- **Chainlink:** verifiable random function (VRF) + commit-reveal scheme docs

### Documentação Recomendada (CryptoBingo)

#### 4.1 Visão Geral
- O que é Provably Fair no CryptoBingo
- RNG ocorre on-chain via oráculo `orng.wax` (RSA-SHA256 assinado por Block Producers)
- Diferença entre RNG tradicional vs nosso modelo oráculo

#### 4.2 Fluxo Técnico (do ADR-003)
1. Worker chama `startdraw(game_id)` → contrato pede aleatoriedade ao `orng.wax`
2. Oráculo gera seed RSA e assina → callback `receiverand` com bytes aleatórios
3. Contrato deriva 75 bolas do seed (algoritmo determinístico)
4. Qualquer um verifica: `orng.wax` → `receiverand` → `games.drawn_balls`

#### 4.3 Como Verificar (Passo a Passo)
- **Via block explorer:** WAX block explorer → `orng.wax` → find `game_id`
- **Via script:** código Python/JS para verificar seed → 75 balls
- **Via ferramenta online:** link para verifier (similar a provablyfair.me)

#### 4.4 Seeds
- **Client seed:** contributed pela wallet do player via signed transaction (`assoc_id`)
- **Server seed:** gerado pelo oracle, committed via hash SHA-256 antes da revelação
- **Nonce:** `game_id` (timestamp ms) — garante unicidade
- Fórmula: `outcome = SHA256(server_seed + client_seed + nonce) % 75 + 1`

#### 4.5 Decompilação WASM
- WASM do contrato disponível em GitHub (/contracts/bingo/bingo.wasm)
- Qualquer auditor pode decompilar com `wasm2wat` e verificar lógica
- Build reproduzível via Docker (`bingo_waxdev`)

#### 4.6 Limitações
- Oráculo WAX é oficial da rede (trust model: confiança na rede, não no operador)
- Código do contrato é fechado (wasm público, fonte fechada) — mitigado por decompilação e ABI público
- Documentação de terceiros pode estar desatualizada

---

## 5. Whitepaper — Estrutura Recomendada

### Base: PRD.md + PRODUCT.md + SPEC.md + COMPLIANCE.md + ADRs

1. **Executive Summary** — O que é o CryptoBingo, modelo RTP 85%/GGR 15%, WAX blockchain
2. **Market Analysis** — BINGO GameFi, mercado Brasil + global, concorrência
3. **Technology Stack** — WAX/Antelope, contratos C++ (cdt-cpp), off-chain RabbitMQ+Redis+PG
4. **Provably Fair System** — Oráculo `orng.wax`, commit-reveal, verificação (ADR-003)
5. **Game Mechanism** — Bitmask 5×5, FREE SPACE, patterns, combos, stages, draw modes (ADR-012/013/016)
6. **Economia** — RTP 85% / GGR 15%, max_weight pricing, treasury, GGR sweep (ADR-005/010)
7. **Tokenomics** — BINGO token, BINGOSWAP, liquidity, multicurrency (ADR-018/021)
8. **NFT Mechanics** — Utility NFTs, templates, rules engine (ADR-028)
9. **Prize Pipeline** — WS events 3-stage, MongoDB persistence, API (ADR-038)
10. **Security** — Permission model (ADR-026), bug bounty, audits, fail-safe (ABORTED state)
11. **Regulatory Compliance** — Lei 14.790/2023, LGPD, GDPR, AML, Responsible Gaming
12. **Roadmap** — Current state, próximas fases, governance
13. **Team** — Bio, background, legal entity
14. **Appendices** — ABI completo, contract actions, addresses

### Formato
- PDF + HTML page on landing (/whitepaper)
- PT/EN/ZH (i18n)

---

## 6. Recomendações para CryptoBingo

### Prioridade de Conteúdo (ordenado)

| Prioridade | Página | Por quê | Observação |
|---|---|---|---|
| P0 | **Terms of Service** | Obrigatório legal, links no Footer apontam `#` | Urgente: href vazio |
| P0 | **Privacy Policy** | Obrigatório LGPD+GDPR, multas até 4% receita | Urgente: href vazio |
| P0 | **Risk Disclaimer** | Proteção legal, boa prática mercado | Pode ser seção do ToS |
| P1 | **Responsible Gaming** | Obrigatório Lei 14.790/2023 | Ferramentas + links help |
| P1 | **AML Policy** | Obrigatório FinCEN/COAF, license application | KYC/CDD/SAR framework |
| P1 | **Dispute Resolution** | LGPD Art. 18 §2 + boa prática | SLA + escalação |
| P2 | **Proof of Fairness** | Trust + diferencial competitivo | Documento técnico + verifier |
| P2 | **Bug Bounty** | Segurança + comunidade | Página + NFT rewards + HOF |
| P2 | **Whitepaper** | Investidores, parceiros, listing CEX | Compilado de docs existentes |
| P3 | **Cookie Policy** | LGPD + GDPR | Já tem CookieConsent v3 |

### Ações Imediatas
1. Substituir `href="#"` no Footer.tsx por URLs reais (/terms, /privacy, /responsible-gaming)
2. Criar páginas estáticas ou via Content System (ADR-037)
3. Traduzir PT/EN/ZH (3 línguas)
4. Adicionar DPO email dpo@cryptobingo.bet na Privacy Policy

### NFT Bug Bounty — Viabilidade
- Já existe: `nft_config` table, `confignft`/`delnftconf` actions, template, collection
- Precisa: schema específico no AtomicAssets (raridade, severity), collection "cryptobingobounty"
- Worker já integra AtomicAssets API (ADR-028)
- **Estimativa de implementação:** 3-5 dias (template + collection + worker + página)

---

## 7. Referências

### Legislação
- Lei 14.790/2023 (Apostas de Quota Fixa — Brasil)
- Lei 13.709/2018 (LGPD — Brasil)
- GDPR Regulation (EU) 2016/679
- FinCEN BSA/AML Guidelines 2026
- FATF Recommendation 15-16 (Virtual Assets)
- BCB Resolution 519/520/521 (2026 — SPSAV)

### Plataformas de Referência
- Stake.com — Terms, Privacy, AML, Provably Fair, Responsible Gaming
- Crypto.Games — Responsible Gaming (best in class — multi-language, tools, SLA)
- Bets.io — Terms completos, multi-jurisdição
- 21Bets — Kahnawake license, Exchange terms

### Bug Bounty
- Immunefi — Web3 bug bounty standard (scope, severity, disclosure)
- HackenProof — Crypto-native bounty platform
- HackerOne — General purpose bounty

### LGPD/GDPR + Blockchain
- AEPD — Blockchain and Personal Data (Spain)
- Chambers & Partners 2026 — Blockchain & Crypto Assets Guide (Italy GDPR)
- Chainlink — Blockchain GDPR Compliance Guide 2026
- EDPB Guidelines 05/2020 — consent

### WAX/AtomicAssets
- WAX AtomicAssets Docs — templates, minting, schemas, collection creation
- AtomicHub — marketplace reference
