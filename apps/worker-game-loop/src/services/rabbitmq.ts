import amqp, { ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import { executeLockGame, executeStartDraw } from './blockchain';
import { processAllGameWinners } from './evaluator';
import dotenv from 'dotenv';

dotenv.config();

const RABBITMQ_URL  = process.env.RABBITMQ_URL  || 'amqp://localhost:5672';
const QUEUE_NAME    = 'game_loop_events';
const RETRY_DELAY_MS = 5_000;

let connection: ChannelModel;
let channel: Channel;

// ==========================================
// TIPOS DE PAYLOAD
// ==========================================

interface LockGamePayload  { action: 'lockgame';  gameId: string; }
interface StartDrawPayload { action: 'startdraw'; gameId: string; }

/**
 * claimwin não precisa de playerWallet — o worker é o juiz e varre
 * TODOS os tickets do jogo via processAllGameWinners().
 */
interface ClaimWinPayload  { action: 'claimwin';  gameId: string; }

type GameEventPayload = LockGamePayload | StartDrawPayload | ClaimWinPayload;

// ==========================================
// CONEXÃO RESILIENTE
// ==========================================

/**
 * Estabelece conexão com o RabbitMQ e registra handlers de erro para
 * reconexão automática em caso de queda do broker.
 */
export async function connectRabbitMQ(): Promise<void> {
    try {
        console.log('🐇 [RabbitMQ] Conectando ao Message Broker...');
        connection = await amqp.connect(RABBITMQ_URL);

        // Reconexão automática: sem esses handlers, a queda do broker é silenciosa
        connection.on('error', (err) => {
            console.error('❌ [RabbitMQ] Erro na conexão:', err.message);
        });
        connection.on('close', () => {
            console.warn(`⚠️ [RabbitMQ] Conexão encerrada. Reconectando em ${RETRY_DELAY_MS / 1000}s...`);
            setTimeout(connectRabbitMQ, RETRY_DELAY_MS);
        });

        channel = await connection.createChannel();

        // durable: true — a fila sobrevive a reboots do RabbitMQ
        await channel.assertQueue(QUEUE_NAME, { durable: true });

        // prefetch(1) — processa uma mensagem por vez; garante que o ACK/NACK
        // seja emitido antes de receber a próxima. Essencial para não perder
        // mensagens se o worker crashar durante uma transação blockchain.
        await channel.prefetch(1);

        console.log(`✅ [RabbitMQ] Escutando a fila: "${QUEUE_NAME}"`);
        consumeMessages();

    } catch (error) {
        console.error(`❌ [RabbitMQ] Falha ao conectar. Tentando novamente em ${RETRY_DELAY_MS / 1000}s...`, error);
        setTimeout(connectRabbitMQ, RETRY_DELAY_MS);
    }
}

// ==========================================
// CONSUMIDOR E ROTEADOR
// ==========================================

function consumeMessages(): void {
    channel.consume(QUEUE_NAME, async (msg: ConsumeMessage | null) => {
        if (!msg) return;

        const payloadStr = msg.content.toString();
        console.log(`\n📥 [RabbitMQ] Mensagem recebida: ${payloadStr}`);

        // --- FASE 1: Parse do payload ---
        // Erros de parse são permanentes (mensagem malformada nunca vai se consertar).
        // NACK sem requeue: descarta a mensagem e evita loop infinito.
        let payload: GameEventPayload;
        try {
            payload = JSON.parse(payloadStr) as GameEventPayload;
        } catch (parseError) {
            console.error('❌ [RabbitMQ] Payload inválido (JSON malformado). Descartando.', parseError);
            channel.nack(msg, false, false); // requeue: false — descarta permanentemente
            return;
        }

        if (!payload.action || !payload.gameId) {
            console.error('❌ [RabbitMQ] Payload sem campos obrigatórios (action, gameId). Descartando.');
            channel.nack(msg, false, false);
            return;
        }

        // --- FASE 2: Execução da ação blockchain ---
        // Erros de blockchain são potencialmente transitórios (nó offline, timeout de CPU).
        // NACK com requeue: devolve à fila para nova tentativa.
        // Em produção, configurar Dead Letter Queue (DLQ) para evitar loop infinito
        // em caso de erro permanente de contrato (ex: estado inválido).
        try {
            switch (payload.action) {
                case 'lockgame':
                    await executeLockGame(payload.gameId);
                    break;

                case 'startdraw':
                    await executeStartDraw(payload.gameId);
                    break;

                case 'claimwin':
                    // O worker é o juiz: varre TODOS os tickets do jogo e liquida os vencedores.
                    // Não depende de qual jogador enviou a mensagem.
                    await processAllGameWinners(payload.gameId);
                    break;

                default:
                    // Ação desconhecida — descarta sem requeue (não vai se consertar)
                    console.warn(`⚠️ [RabbitMQ] Ação desconhecida: "${(payload as GameEventPayload).action}". Descartando.`);
                    channel.nack(msg, false, false);
                    return;
            }

            // ACK: confirma o processamento e remove da fila
            channel.ack(msg);
            console.log(`✅ [RabbitMQ] Evento "${payload.action}" para jogo ${payload.gameId} processado com sucesso.`);

        } catch (blockchainError) {
            console.error(
                `❌ [RabbitMQ] Erro ao processar "${payload.action}" para jogo ${payload.gameId}:`,
                blockchainError
            );
            // requeue: true — devolve à fila para nova tentativa após erro transitório.
            // IMPORTANTE: configurar DLQ no RabbitMQ para limitar o número de retentativas
            // e evitar loop infinito em caso de erro permanente de contrato.
            channel.nack(msg, false, true);
        }

    }, { noAck: false }); // noAck: false — exige ACK/NACK manual (at-least-once delivery)
}
