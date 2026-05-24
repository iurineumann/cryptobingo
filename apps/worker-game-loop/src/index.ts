import { connectRabbitMQ } from './services/rabbitmq';
import dotenv from 'dotenv';

dotenv.config();

console.log('=============================================');
console.log('🤖 CryptoBingo: Game Loop Worker Iniciando...');
console.log('=============================================');

async function bootstrap() {
    // 1. Verifica se as chaves da blockchain estão presentes
    if (!process.env.MICROSERVICE_PRIVATE_KEY) {
        console.error('❌ ERRO CRÍTICO: MICROSERVICE_PRIVATE_KEY não definida no .env');
        process.exit(1);
    }

    // 2. Conecta ao RabbitMQ e começa a escutar a fila
    await connectRabbitMQ();
}

bootstrap();