import amqp, { ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import { executeLockGame, executeStartDraw } from './blockchain';
import dotenv from 'dotenv';

dotenv.config();

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const QUEUE_NAME = 'game_loop_events';

let connection: ChannelModel; 
let channel: Channel;

/**
 * Interface do payload (conteúdo) que esperamos receber na fila
 */
interface GameEventPayload {
    action: 'lockgame' | 'startdraw' | 'claimwin';
    gameId: string;
}

/**
 * Inicializa a conexão com o RabbitMQ de forma resiliente
 */
export async function connectRabbitMQ() {
    try {
        console.log('🐇 [RabbitMQ] Tentando conectar ao Message Broker...');
        connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();

        // Garante que a fila existe e sobrevive a reboots do servidor (durable: true)
        await channel.assertQueue(QUEUE_NAME, { durable: true });
        
        // Processa apenas 1 mensagem por vez (impede sobrecarga do Node.js)
        await channel.prefetch(1);

        console.log(`✅ [RabbitMQ] Conectado e escutando a fila: ${QUEUE_NAME}`);
        
        // Inicia o consumidor
        consumeMessages();
    } catch (error) {
        console.error('❌ [RabbitMQ] Falha na conexão. Tentando novamente em 5s...', error);
        setTimeout(connectRabbitMQ, 5000);
    }
}

/**
 * Consome e roteia as mensagens da fila
 */
async function consumeMessages() {
    channel.consume(QUEUE_NAME, async (msg: ConsumeMessage | null) => {
        if (!msg) return;

        const payloadStr = msg.content.toString();
        console.log(`\n📥 [RabbitMQ] Nova mensagem recebida: ${payloadStr}`);

        try {
            const payload: GameEventPayload = JSON.parse(payloadStr);

            // Roteador de Ações
            switch (payload.action) {
                case 'lockgame':
                    await executeLockGame(payload.gameId);
                    break;
                case 'startdraw':
                    await executeStartDraw(payload.gameId);
                    break;
                case 'claimwin':
                    console.log(`🏆 [Lógica] Pendente: Implementar claimwin para o jogo ${payload.gameId}`);
                    // await executeClaimWin(payload.gameId);
                    break;
                default:
                    console.warn(`⚠️ [RabbitMQ] Ação desconhecida ignorada: ${payload.action}`);
            }

            // Confirmação de Sucesso: Remove da fila
            channel.ack(msg);
            console.log(`✅ [RabbitMQ] Evento processado com sucesso (ACK).`);

        } catch (error) {
            console.error(`❌ [RabbitMQ] Erro ao processar evento na blockchain:`, error);
            
            // Rejeição (NACK): Devolve para a fila para tentar novamente depois
            // O segundo parâmetro (false) impede requeue instantâneo se for um erro de formato de json
            // O ideal em produção é enviar para uma "Dead Letter Queue" (DLQ)
            channel.nack(msg, false, true); 
        }
    }, { noAck: false }); // noAck: false exige que façamos o ack() manualmente
}