#!/usr/bin/env ts-node --transpile-only --project scripts/tsconfig.json
// Seed: popula collection 'content' com dados iniciais (FAQ, HowItWorks, etc).
// Uso: npx ts-node --transpile-only --project scripts/tsconfig.json scripts/seed-content.ts
// Idempotente: pula se já existirem documentos do tipo.

import mongoose from 'mongoose';
import { Content } from '../src/models/Content';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/cryptobingo_edge';

async function seed(): Promise<void> {
    await mongoose.connect(MONGO_URI);
    console.log(`[seed] Conectado a ${MONGO_URI}`);

    // ── FAQ ──────────────────────────────────────────────────────────────────
    const faqCount = await Content.countDocuments({ type: 'faq' });
    if (faqCount > 0) {
        console.log(`[seed] FAQ já possui ${faqCount} itens — pulando.`);
    } else {
        const faqItems = [
            { question: 'O que é o CryptoBingo?', answer: 'CryptoBingo é uma plataforma de bingo on-chain na blockchain WAX. Cada partida é verificável publicamente e os prêmios são pagos automaticamente na sua carteira.' },
            { question: 'Como faço para jogar?', answer: 'Conecte sua carteira WAX (Anchor, Wombat ou similar), escolha uma sala no lobby, compre suas cartelas e aguarde o sorteio. Se ganhar, o prêmio é enviado automaticamente pelo contrato inteligente — sem intermediários.' },
            { question: 'Os sorteios são justos?', answer: 'Sim. Usamos o oráculo de aleatoriedade oficial da WAX (orng.wax), baseado em RSA-SHA256. O resultado é gerado externamente e verificável por qualquer pessoa diretamente na blockchain — nenhum código da plataforma pode influenciar o sorteio.' },
            { question: 'Quanto posso ganhar com uma cartela?', answer: 'O prêmio segue a fórmula: Valor da Cartela × Multiplicador Base × (Peso do Padrão / 100). Exemplo: cartela de 2 BINGO, multiplicador 1, padrão peso 150 (1.5×) → prêmio de 3 BINGO. O RTP global é de 85%.' },
            { question: 'O que são padrões e combinações?', answer: 'Padrões são formas na cartela 5×5 que, quando preenchidas pelos números sorteados, geram prêmio (ex: linha, diagonal, letra B, cartela cheia). Combinações são bônus por completar múltiplos padrões na mesma rodada. Cada tipo de jogo define seus próprios padrões e pesos.' },
            { question: 'Quais modos de sorteio existem?', answer: 'A plataforma suporta 4 modos: Standard (35 bolas padrão), Fixed (número configurado de bolas), First Full (bolas até alguém completar a cartela inteira) e Golden Ball (35 bolas + 1 bola dourada com multiplicador aleatório de prêmio).' },
            { question: 'Quais tokens posso usar?', answer: 'WAX é o token padrão. Cada sala define sua moeda base (WAX, BINGO, TLM ou outros). Você também pode pagar com tokens alternativos usando a funcionalidade de Swap integrada — a conversão é feita automaticamente.' },
            { question: 'Como funcionam as NFTs na plataforma?', answer: 'NFTs de coleções parceiras podem conceder: desconto na compra de cartelas (TICKET_DISCOUNT), aumento de prêmio (PRIZE_BOOST), acesso a salas exclusivas (ROOM_ACCESS) e desbloqueio de benefícios via queima de NFT (BURN_TO_CLAIM). Todos os benefícios são validados on-chain pelo contrato inteligente.' },
            { question: 'Como uso um NFT para desconto?', answer: 'Na tela de compra, selecione seu NFT elegível no seletor de desconto. O sistema verifica automaticamente seus NFTs e aplica o desconto ao valor da cartela. Após confirmar a geração da prévia, o NFT fica bloqueado para aquela compra.' },
            { question: 'O que são salas patrocinadas?', answer: 'Salas criadas por projetos ou empresas (sponsors) que depositam tokens no tesouro da sala para custear os prêmios. Cada sala tem configurações próprias de moeda, preço de cartela e tipo de jogo. Patrocinadores também podem alocar drops de NFTs e tokens para os jogadores.' },
            { question: 'Como funciona o ranking/leaderboard?', answer: 'O leaderboard exibe os melhores jogadores por vitórias, volume apostado ou XP acumulado. As posições atualizam ao fim de cada partida. XP é ganho jogando, vencendo e completando conquistas.' },
            { question: 'Como atualizo meu perfil?', answer: 'Acesse a página de Perfil para definir avatar (via NFT da sua carteira), nickname e outras preferências. Alterações são autenticadas via assinatura WAX — só você pode modificar seus dados.' },
            { question: 'Minha carteira e dados estão seguros?', answer: 'A plataforma nunca armazena sua chave privada. Autenticação é feita via assinatura na sua carteira WAX (Anchor/Wombat) — você assina cada transação no próprio app da carteira. O contrato é público e auditável por qualquer pessoa na blockchain WAX.' },
            { question: 'O que é GGR e para onde vai?', answer: 'GGR (Gross Gaming Revenue) é a margem de 15% retida pela plataforma por partida. Esses fundos sustentam a operação, o desenvolvimento e a liquidez da tesouraria global. O RTP resultante é 85% — estatisticamente, 85% de tudo apostado retorna como prêmio.' },
            { question: 'O que acontece se ninguém ganhar numa rodada?', answer: 'Em modos standard, o prêmio vai ao jogador com a cartela de maior progresso (maior peso de padrão completado). No modo First Full, se nenhuma cartela completar a cartela inteira, o jogo é encerrado pelo worker e uma nova rodada é iniciada automaticamente.' },
        ];

        const docs = faqItems.map((item, i) => ({
            type: 'faq' as const,
            slug: `faq-${i + 1}`,
            title: item.question,
            content_format: 'text' as const,
            content: item.answer,
            metadata: { question: item.question },
            sort_order: i + 1,
            active: true,
            pinned: false,
            published_at: new Date(),
            published_by: 'seed',
        }));

        await Content.insertMany(docs);
        console.log(`[seed] Inseridos ${docs.length} FAQs.`);
    }

    // ── How It Works ─────────────────────────────────────────────────────────
    const hiwCount = await Content.countDocuments({ type: 'howitworks' });
    if (hiwCount > 0) {
        console.log(`[seed] HowItWorks já possui ${hiwCount} itens — pulando.`);
    } else {
        await Content.create({
            type: 'howitworks',
            slug: 'how-it-works',
            title: 'Como Funciona',
            content_format: 'text',
            content: '1. Conecte sua carteira WAX.\n2. Compre cartelas em uma sala.\n3. Acompanhe o sorteio ao vivo.\n4. Ganhe prêmios automaticamente.',
            sort_order: 1,
            active: true,
            published_at: new Date(),
            published_by: 'seed',
        });
        console.log('[seed] Inserido HowItWorks.');
    }

    console.log('[seed] Concluído.');
    await mongoose.disconnect();
}

await seed();
