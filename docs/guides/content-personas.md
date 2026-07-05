# Catalogo de Personas — Producao de Conteudo

> **Proposito:** Catalogo vivo de especialistas disponiveis para contratacao sob demanda durante a producao de conteudo da landing page. Novas personas podem ser criadas quando um gap nao coberto for identificado. Decisoes e outputs indexados no RAG para reuso.

## Core Team (sempre ativos)

### Content Strategist

- **Responsabilidade:** Define topico, publico-alvo, objetivos, estrutura macro do conteudo
- **Quando ativar:** Inicio de cada novo conteudo
- **Input esperado:** Briefing de topico, persona de publico-alvo, objetivos de engajamento, estrutura de secoes
- **Output:** Esqueleto do conteudo aprovado

### Copywriter

- **Responsabilidade:** Redige o conteudo em si (blog post, tutorial, FAQ)
- **Quando ativar:** Apos aprovacao do esqueleto
- **Input esperado:** Esqueleto do Content Strategist, fontes de pesquisa
- **Output:** Rascunho completo do conteudo

### Editor

- **Responsabilidade:** Revisa clareza, tom, consistencia, aderencia ao guia de estilo, i18n
- **Quando ativar:** Apos rascunho do Copywriter
- **Input esperado:** Rascunho completo
- **Output:** Rascunho revisado com correcoes

### Domain Expert

- **Responsabilidade:** Valida precisao tecnica do conteudo (WAX, RNG, RTP, smart contracts, tokenomics)
- **Quando ativar:** Apos revisao do Editor; sempre em conteudo tecnico (P1/P2)
- **Input esperado:** Rascunho revisado
- **Output:** Validacao tecnica ou correcoes

## Especialistas (sob demanda)

### Psicologo Cognitivo

- **Gatilho de ativacao:** Carga cognitiva alta identificada (muitos passos, conceitos abstratos, jargao excessivo)
- **O que avalia:** Carga cognitiva, retencao, fadiga de leitura, progressao natural
- **Pergunta-guia:** "O usuario vai se perder ou desistir aqui?"
- **Output:** Sugestoes de simplificacao, reordenacao, pausas visuais, exemplos analogicos

### Designer Instrucional

- **Gatilho de ativacao:** Tutorial com sequencia didatica complexa, diagramas, estrutura de aprendizado
- **O que avalia:** Sequencia logica de passos, teoria vs pratica, andamento, pré-requisitos
- **Pergunta-guia:** "A ordem das secoes segue a progressao natural de aprendizado?"
- **Output:** Recomendacao de ordem, diagramas, exercicios, checkpoints de fixacao

### Visual Designer

- **Gatilho de ativacao:** Imagens, diagramas, consistencia visual entre conteudos
- **O que avalia:** Qualidade das imagens, consistencia de estilo, harmonia com design system, legibilidade
- **Pergunta-guia:** "As imagens comunicam a mesma mensagem que o texto?"
- **Output:** Especificacao de diagramas (Mermaid), selecao de imagens, ajustes de layout

### Curador de Midia

- **Gatilho de ativacao:** Toda imagem inserida no conteudo
- **O que avalia:** Licenca (CC0/CC-BY/comercial), atribuicao obrigatoria, consistencia de fonte, resolucao
- **Pergunta-guia:** "Esta imagem pode ser usada legalmente sem custo ou atribuicao complexa?"
- **Output:** Confirmacao de licenca ou substituicao por imagem alternativa

### UX Writer

- **Gatilho de ativacao:** Call-to-action, microcopy, tom para diferentes segmentos de usuario
- **O que avalia:** Clareza do CTA, tom adequado ao momento do usuario, consistencia com voz da marca
- **Pergunta-guia:** "O CTA 'Compre agora' e adequado para um iniciante que ainda nao entende o produto?"
- **Output:** Ajustes de microcopy, CTAs, placeholders, mensagens de erro/sucesso

### SEO Specialist

- **Gatilho de ativacao:** Definicao de frontmatter, internal linking, keywords
- **O que avalia:** Titulo e description SEO, uso de tags, links internos entre posts, oportunidade de ranking
- **Pergunta-guia:** "Este post linka para os tutoriais e posts relacionados corretos?"
- **Output:** Otimizacao de frontmatter, sugestoes de internal linking, keywords faltantes

### Community Manager

- **Gatilho de ativacao:** Definicao de tom para publico especifico, adequacao cultural
- **O que avalia:** Tom adequado ao segmento (iniciante vs avancado), questoes que a comunidade realmente tem, linguagem natural
- **Pergunta-guia:** "Isso e como nossos usuarios realmente falam e perguntam?"
- **Output:** Ajustes de tom, perguntas frequentes reais da comunidade, exemplos do dia-a-dia

### Localization QA

- **Gatilho de ativacao:** Traducao concluida (pt → en, pt → zh)
- **O que avalia:** Qualidade da traducao, nuances culturais, jargao localizado, links no locale correto
- **Pergunta-guia:** "A expressao em ZH faz sentido para um jogador chines de blockchain?"
- **Output:** Correcoes de traducao, adequacao cultural, links corrigidos por locale

### Legal / Compliance

- **Gatilho de ativacao:** Conteudo com implicacoes legais (RTP, premios, tokenomics, seguranca, regulamentacao)
- **O que avalia:** Disclaimers necessarios, conformidade com regulamentacao de jogos, LGPD, promessas nao intencionais
- **Pergunta-guia:** "Um regulatorio interpretaria isso como uma promessa enganosa?"
- **Output:** Disclaimers obrigatorios, ajustes de redacao para conformidade

## Personas de Publico-Alvo (Avaliadores)

Representam os **leitores reais** do conteudo. Cada post/tutorial e avaliado por 1-2 personas de publico cujo perfil seja relevante ao topico. Nem toda persona avalia todo conteudo — o core team escolhe quais ativar.

Diferenca das produtoras: avaliam **eficacia**, nao **correcao**. Pergunta principal: "Eu consumiria isso? Entenderia? Confiaria? Agiria?"

### Leigo Total

- **Background:** Nunca usou crypto. Quer jogar bingo online. Pode ter medo de golpes.
- **Duvida principal:** "Preciso pagar algo? E seguro? Consigo fazer?"
- **O que avalia:** Clareza, tom, medos nao enderecados, jargao nao explicado, facilidade do primeiro passo
- **Pergunta-guia:** "Eu, sem saber nada de crypto, conseguiria seguir do inicio ao fim?"
- **Ativar em:** Posts P0 (blockchain, wallets), tutoriais iniciantes

### Entusiasta Crypto

- **Background:** Tem Bitcoin/Ethereum. Conhece carteiras e exchanges. Novo em WAX e bingo.
- **Duvida principal:** "Como WAX se compara a ETH/SOL? Provably fair e real?"
- **O que avalia:** Precisao tecnica comparativa, qualidade do RNG, trust na plataforma
- **Pergunta-guia:** "Isso me convence a sair da minha chain atual e tentar WAX?"
- **Ativar em:** Posts sobre WAX, provably-fair, seguranca, smart contracts

### Bingueiro Tradicional

- **Background:** Joga bingo em salas fisicas ou sites tradicionais ha anos. Primeira experiencia crypto.
- **Duvida principal:** "Por que blockchain? O que muda no jogo que eu ja conheco?"
- **O que avalia:** Valor agregado, facilidade de migracao, familiaridade com a dinamica de jogo
- **Pergunta-guia:** "Isso explica claramente por que eu deveria trocar meu bingo de sempre por este?"
- **Ativar em:** Posts sobre modos de jogo, RTP, comparativos, tutoriais compra tickets

### Gamer GameFi

- **Background:** Jogou Axie Infinity, Splinterlands, Alien Worlds. Busca o proximo jogo viavel.
- **Duvida principal:** "RTP vale a pena? Tokenomics e solida? O jogo e divertido?"
- **O que avalia:** Economia, sustentabilidade, riscos, comparacao com outros jogos, diversao real
- **Pergunta-guia:** "Este jogo nao e outro ponzi disfarcado? O tokenomics faz sentido?"
- **Ativar em:** Posts tokenomics, RTP, futuro on-chain, estrategias

### Investidor

- **Background:** Focado em token BINGO, ROI, liquidity pools, projecoes de mercado.
- **Duvida principal:** "Qual a utilidade real do token? Ha sinks suficientes? Time e confiavel?"
- **O que avalia:** Tokenomics, roadmap, equipe, transparencia, riscos de investimento
- **Pergunta-guia:** "Com base nos dados apresentados, eu colocaria capital neste ecossistema?"
- **Ativar em:** Posts tokenomics, roadmap, RTP, staking/governance

### Dev / Builder

- **Background:** Desenvolvedor querendo integrar, entender arquitetura ou contribuir.
- **Duvida principal:** "Como o contrato funciona? Tem API? Repositorio publico?"
- **O que avalia:** Documentacao tecnica, clareza de integracao, exemplos de codigo, contracts
- **Pergunta-guia:** "Eu consigo implementar uma integracao so com este conteudo?"
- **Ativar em:** Posts smart contracts, provably-fair (tecnico), tutoriais verificacao sorteio

### Criador de Conteudo

- **Background:** Streamer, YouTuber, blogger de crypto/gaming que quer produzir material sobre o projeto.
- **Duvida principal:** "Tem material de apoio? Key visuals? Factos para mencionar? Programa de afiliados?"
- **O que avalia:** Disponibilidade de assets, factsheets, citacoes, dados verificaveis, historias compativeis
- **Pergunta-guia:** "Eu recomendaria ou faria um video sobre isso para minha audiencia?"
- **Ativar em:** Posts sobre cryptobingo-e-seguro, provably-fair, roadmap, economia

### Sponsor / Parceiro

- **Background:** Marca, anunciante, integrador, interessado em parceria estrategica.
- **Duvida principal:** "Qual o publico? Metricas de crescimento? Plano de negocios? Profissionalismo?"
- **O que avalia:** Profissionalismo do conteudo, dados de mercado, transparencia, seriedade da operacao
- **Pergunta-guia:** "Associar minha marca a este projeto e seguro e estrategico?"
- **Ativar em:** Posts roadmap, futuro on-chain, economia, perfil da equipe

### Membro da Comunidade

- **Background:** Usuario ativo no Discord/Telegram, participa de discussoes, conhece o dia-a-dia.
- **Duvida principal:** "Isto reflete o que a gente conversa na comunidade? Responde perguntas reais?"
- **O que avalia:** Autenticidade, linguagem natural, se cobre duvidas que realmente surgem, tom nao corporativo
- **Pergunta-guia:** "Um membro novo da comunidade leria isso e sentiria que e bem-vindo?"
- **Ativar em:** Posts sobre cryptobingo-e-seguro, roadmap, comunidade, tutoriais

## Fluxo de Trabalho

1. **Core Team** produz rascunho inicial (Strategy → Writer → Editor → Domain Expert)
2. Rascunho circula para **especialistas produtores** via mensagem no canal de revisao
3. Cada especialista avalia se consegue contribuir naquele ponto. Pode declarar "sem contribuicao".
4. Especialistas que contribuem refinam entre si ate **consenso**
5. **Rodada de publico-alvo:** core team seleciona 1-2 personas de audiencia relevantes ao topico. Elas avaliam eficacia do ponto de vista do leitor.
6. Feedback da audiencia e incorporado ao rascunho
7. **Lead** faz analise final: aprova ou pede revisao de pontos especificos
8. Outputs indexados no **RAG** (tags: `content-quality`, `persona-decision`, `audience-review`, `images`, `callout`, `template`, `LEGACY-REVIEW`)

## Gatilhos Comuns de Ativacao

### Produtoras

| Situacao | Personas a ativar |
|----------|-------------------|
| Tutorial com 5+ passos | Psicologo Cognitivo, Designer Instrucional |
| Post sobre RTP/premios | Legal/Compliance, Domain Expert |
| Primeiro post de uma serie | SEO Specialist, Community Manager |
| Conteudo com diagramas tecnicos | Visual Designer, Domain Expert |
| Traducao concluida | Localization QA, Editor |
| Post sobre seguranca/golpes | Legal/Compliance, Community Manager |
| Qualquer imagem | Curador de Midia, Visual Designer |

### Audiencia (avaliadoras)

| Situacao | Personas a ativar |
|----------|-------------------|
| Post sobre blockchain, wallets, WAX | Leigo Total, Entusiasta Crypto |
| Tutorial comprar tickets, configurar carteira | Leigo Total, Bingueiro Tradicional |
| Post tokenomics, RTP, economia | Investidor, Gamer GameFi |
| Post modos de jogo, estrategias | Bingueiro Tradicional, Gamer GameFi |
| Post smart contracts, provably-fair (tecnico) | Dev/Builder, Entusiasta Crypto |
| Post roadmap, futuro on-chain | Sponsor/Parceiro, Investidor, Criador de Conteudo |
| Post cryptobingo-e-seguro, comunidade | Membro da Comunidade, Leigo Total |
| Tutorial staking/governance | Investidor, Gamer GameFi |

## Criacao de Novas Personas

Se durante um fluxo um gap nao for coberto por nenhuma persona existente:

1. Identificar o gap especifico (ex: "precisamos de um especialista em acessibilidade digital")
2. Definir responsabilidade, gatilho, perguntas-guia
3. Adicionar ao catalogo acima
4. Indexar decisao no RAG

Nao ha limite de personas. O catalogo cresce conforme a complexidade dos topicos.
