import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import SystemToken from '../models/SystemToken';

export const listTokens = async (_req: Request, res: Response): Promise<void> => {
    try {
        const tokens = await SystemToken.find({ enabled: true }).sort({ label: 1 }).lean();
        res.status(200).json({ tokens });
    } catch (err) {
        console.error('[TokenConfig] Erro ao listar tokens:', err);
        res.status(500).json({ error: 'Erro interno ao listar tokens.' });
    }
};

export const createToken = async (req: Request, res: Response): Promise<void> => {
    const { contract, symbol, precision, label, is_native } = req.body;
    if (!contract || !symbol || !label) {
        res.status(400).json({ error: 'Campos obrigatórios: contract, symbol, label.' });
        return;
    }
    if (typeof precision !== 'number' || precision < 0 || precision > 18) {
        res.status(400).json({ error: 'precision deve ser número entre 0 e 18.' });
        return;
    }
    try {
        const token = await SystemToken.create({ contract, symbol, precision, label, is_native: !!is_native });
        res.status(201).json({ token });
    } catch (err: any) {
        if (err.code === 11000) {
            res.status(409).json({ error: 'Token (contract + symbol) já cadastrado.' });
            return;
        }
        console.error('[TokenConfig] Erro ao criar token:', err);
        res.status(500).json({ error: 'Erro interno ao criar token.' });
    }
};

export const deleteToken = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    if (!isValidObjectId(id)) { res.status(400).json({ error: 'ID inválido.' }); return; }
    try {
        const result = await SystemToken.findByIdAndDelete(id);
        if (!result) { res.status(404).json({ error: 'Token não encontrado.' }); return; }
        res.status(200).json({ ok: true });
    } catch (err) {
        console.error('[TokenConfig] Erro ao remover token:', err);
        res.status(500).json({ error: 'Erro interno ao remover token.' });
    }
};
