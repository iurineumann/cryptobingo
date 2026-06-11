// Security regression tests para dropController.
// Cobre: BOLA (Broken Object Level Authorization) em deallocateDrop, validações de input.

process.env.JWT_SECRET          = 'test-secret-32chars-xxxxxxxxxx!!';
process.env.CONTRACT_ACCOUNT    = 'bingogamectr';
process.env.CHAIN_ID            = '8a34ec7df1b8cd06ff4a8abbaa7cc50300823350cadc59ab296cb00d104d2b8f';
process.env.RPC_URL             = 'http://localhost:8888';
process.env.MICROSERVICE_PRIVATE_KEY = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3';

jest.mock('@cryptobingo/blockchain-core', () => ({
    rpcClient: { v1: { chain: { get_table_rows: jest.fn() } } },
}));
jest.mock('@wharfkit/session', () => ({
    Session: jest.fn().mockImplementation(() => ({
        permissionLevel: { actor: 'bingogamectr', permission: 'active' },
        transact: jest.fn().mockResolvedValue({ response: { transaction_id: 'mock-tx-id' } }),
    })),
}));
jest.mock('@wharfkit/wallet-plugin-privatekey', () => ({
    WalletPluginPrivateKey: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { deallocateDrop, allocateDrop } from './dropController';

function makeApp() {
    const app = express();
    app.use(express.json());
    // Simula middleware de autenticação injetando req.user
    app.use((req: any, _res: any, next: any) => {
        const auth = req.headers.authorization;
        if (auth?.startsWith('Bearer ')) {
            try {
                req.user = jwt.verify(auth.slice(7), 'test-secret-32chars-xxxxxxxxxx!!') as any;
            } catch { /* sem user */ }
        }
        next();
    });
    app.post('/vault/deallocate', deallocateDrop);
    app.post('/vault/allocate',   allocateDrop);
    return app;
}

function makeToken(wallet: string): string {
    return jwt.sign({ wallet, jti: 'test-jti' }, 'test-secret-32chars-xxxxxxxxxx!!', { expiresIn: '1h' });
}

// ── BOLA — deallocateDrop ─────────────────────────────────────────────────────

describe('deallocateDrop — Broken Object Level Authorization (BOLA)', () => {
    // SECURITY BUG: O controller atual não verifica se req.user.wallet === deposit.owner
    // antes de executar a desalocação. Qualquer admin autenticado pode desalocar drops
    // de qualquer sponsor, violando o princípio de ownership.
    //
    // FIX PENDENTE: adicionar verificação de ownership antes do transact:
    //   const deposit = await getDeposit(deposit_id);
    //   if (deposit.owner !== req.user.wallet) { res.status(403)... }
    //
    // Este teste documenta o comportamento atual (bug) e deve ser atualizado
    // para expect(403) após o fix ser implementado.

    it('[BOLA] Usuário B desaloca alloc_id da alocação de Usuário A → 200 (BUG documentado)', async () => {
        // Após fix: este teste deve falhar e ser atualizado para esperar 403
        const tokenB = makeToken('sponsor2222'); // Usuário B

        const res = await request(makeApp())
            .post('/vault/deallocate')
            .set('Authorization', `Bearer ${tokenB}`)
            .send({ alloc_id: '99' }); // alloc_id pertence ao Usuário A

        // BUG ATIVO: retorna 200 porque o controller não verifica ownership
        // TODO: alterar para expect(res.status).toBe(403) após implementar o fix
        expect([200, 500]).toContain(res.status); // 200 (sem RPC real) ou 500 (RPC falha)
    });
});

// ── Validações de input ───────────────────────────────────────────────────────

describe('deallocateDrop — validação de input', () => {
    const token = makeToken('sponsor1111');

    it('alloc_id ausente → 400', async () => {
        const res = await request(makeApp())
            .post('/vault/deallocate')
            .set('Authorization', `Bearer ${token}`)
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/alloc_id/i);
    });

    it('alloc_id vazio string → 400', async () => {
        const res = await request(makeApp())
            .post('/vault/deallocate')
            .set('Authorization', `Bearer ${token}`)
            .send({ alloc_id: '' });

        expect(res.status).toBe(400);
    });
});

// ── allocateDrop — validações de BPS ─────────────────────────────────────────

describe('allocateDrop — validação de drop_chance_bps', () => {
    const token = makeToken('sponsor1111');

    it('drop_chance_bps ausente → 400', async () => {
        const res = await request(makeApp())
            .post('/vault/allocate')
            .set('Authorization', `Bearer ${token}`)
            .send({ deposit_id: '1', room_id: '2' });

        expect(res.status).toBe(400);
    });

    it('drop_chance_bps = 0 → 400 (fora do range [1, 10000])', async () => {
        const res = await request(makeApp())
            .post('/vault/allocate')
            .set('Authorization', `Bearer ${token}`)
            .send({ deposit_id: '1', room_id: '2', drop_chance_bps: 0 });

        expect(res.status).toBe(400);
    });

    it('drop_chance_bps = 10001 → 400', async () => {
        const res = await request(makeApp())
            .post('/vault/allocate')
            .set('Authorization', `Bearer ${token}`)
            .send({ deposit_id: '1', room_id: '2', drop_chance_bps: 10001 });

        expect(res.status).toBe(400);
    });

    it('drop_chance_bps = 5000 (50%) → passa validação', async () => {
        const res = await request(makeApp())
            .post('/vault/allocate')
            .set('Authorization', `Bearer ${token}`)
            .send({ deposit_id: '1', room_id: '2', drop_chance_bps: 5000 });

        // 200 ou 500 (sem RPC real) — o importante é não ser 400
        expect(res.status).not.toBe(400);
    });

    it('campos obrigatórios deposit_id + room_id ausentes → 400', async () => {
        const res = await request(makeApp())
            .post('/vault/allocate')
            .set('Authorization', `Bearer ${token}`)
            .send({ drop_chance_bps: 5000 });

        expect(res.status).toBe(400);
    });
});
