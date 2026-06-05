import mongoose from 'mongoose';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// ==========================================
// MONGODB (Dynamic Edge - Perfis e Gamificação)
// ==========================================
export const connectMongo = async () => {
    try {
        console.log('🍃 [MongoDB] Conectando...');
        await mongoose.connect(process.env.MONGO_URL as string);
        console.log('✅ [MongoDB] Conectado com sucesso (Edge & Gamification).');
    } catch (error) {
        console.error('❌ [MongoDB] Falha na conexão:', error);
        process.exit(1);
    }
};

// ==========================================
// POSTGRESQL (Core Ledger - Auditoria e Compliance)
// ==========================================
export const pgPool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});

export const connectPostgres = async () => {
    try {
        console.log('🐘 [PostgreSQL] Conectando...');
        const client = await pgPool.connect();
        console.log('✅ [PostgreSQL] Conectado com sucesso (Ledger & Compliance).');
        client.release();
    } catch (error) {
        console.error('❌ [PostgreSQL] Falha na conexão:', error);
        process.exit(1);
    }
};