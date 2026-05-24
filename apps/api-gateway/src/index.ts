import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectMongo, connectPostgres } from './database';
import { getProfile, updatePreferences } from './controllers/profileController';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware Base
app.use(cors());
app.use(express.json());

// Inicialização dos Bancos de Dados
connectMongo();
connectPostgres();

// ==========================================
// ROTAS DA API
// ==========================================
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'Gateway Online', timestamp: new Date() });
});

// Rotas de Perfil
app.get('/api/v1/profile', getProfile);
app.put('/api/v1/profile', updatePreferences);

// Inicializa o Servidor
app.listen(PORT, () => {
    console.log('=============================================');
    console.log(`🌐 CryptoBingo: API Gateway rodando na porta ${PORT}`);
    console.log('=============================================');
});