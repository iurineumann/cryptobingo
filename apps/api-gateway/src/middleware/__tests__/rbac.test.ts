// apps/api-gateway/src/middleware/__tests__/rbac.test.ts
// Testa a equivalência role↔permission (ADR-036): admin.* nas permissions
// deve ser tratado como role admin pelo requireRole.
import { requireRole } from '../rbac';
import { UserProfile } from '../../models/UserProfile';

jest.mock('../../models/UserProfile', () => ({
    UserProfile: { findOne: jest.fn() },
}));

function mockReq(role: string | undefined, permissions: string[] = [], wallet = 'w1') {
    return {
        user: role === undefined ? undefined : { wallet },
        originalUrl: '/admin/x',
        method: 'POST',
        ip: '1.2.3.4',
        headers: {},
    } as any;
}
function mockRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

const findOne = UserProfile.findOne as jest.Mock;

function leanResult(data: unknown) {
    return { lean: () => Promise.resolve(data) };
}

describe('requireRole (ADR-036: admin.* == role admin)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('role player + sem perms → 403 em rota admin', async () => {
        findOne.mockReturnValue(leanResult({ role: 'player', permissions: [] }));
        const req = mockReq('player'); const res = mockRes();
        await requireRole('admin')(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('role player + permissions [admin.*] → PASSA rota admin (bug cworldcntrct corrigido)', async () => {
        findOne.mockReturnValue(leanResult({ role: 'player', permissions: ['admin.*'] }));
        const req = mockReq('player', ['admin.*']); const res = mockRes();
        const next = jest.fn();
        await requireRole('admin')(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalledWith(403);
        expect(req.userRole).toBe('player');
    });

    it('role admin → PASSA', async () => {
        findOne.mockReturnValue(leanResult({ role: 'admin', permissions: ['admin.*'] }));
        const req = mockReq('admin'); const res = mockRes(); const next = jest.fn();
        await requireRole('admin')(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it('contract_admin → PASSA qualquer role', async () => {
        findOne.mockReturnValue(leanResult({ role: 'contract_admin', permissions: [] }));
        const req = mockReq('contract_admin'); const res = mockRes(); const next = jest.fn();
        await requireRole('admin', 'sponsor')(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    it('admin.* NÃO supre role sponsor (escopo diferente)', async () => {
        findOne.mockReturnValue(leanResult({ role: 'player', permissions: ['admin.*'] }));
        const req = mockReq('player', ['admin.*']); const res = mockRes();
        await requireRole('sponsor')(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('sem perfil → 404', async () => {
        findOne.mockReturnValue(leanResult(null));
        const req = mockReq('player'); const res = mockRes();
        await requireRole('admin')(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('sem auth (requireAuth faltando) → 401', async () => {
        const req = mockReq(undefined); const res = mockRes();
        await requireRole('admin')(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });
});
