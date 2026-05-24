import { Request, Response } from 'express';
import UserProfile from '../models/UserProfile';

export const getProfile = async (req: Request, res: Response) => {
    try {
        // Mock: Em produção, 'wallet_address' virá do Token JWT
        const wallet_address = req.query.wallet || 'jogador1.wax'; 

        let profile = await UserProfile.findOne({ wallet_address });
        
        // Se o perfil não existir (primeiro login), criamos na hora
        if (!profile) {
            profile = await UserProfile.create({ wallet_address });
        }

        res.status(200).json(profile);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar perfil' });
    }
};

export const updatePreferences = async (req: Request, res: Response) => {
    try {
        // Mock: Em produção, 'wallet_address' virá do Token JWT
        const wallet_address = req.body.wallet_address || 'jogador1.wax'; 
        const { nickname, locale } = req.body;

        const updatedProfile = await UserProfile.findOneAndUpdate(
            { wallet_address },
            { 
                $set: { 
                    nickname, 
                    'preferences.locale': locale 
                } 
            },
            { new: true } // Retorna o documento atualizado
        );

        if (!updatedProfile) {
            return res.status(404).json({ error: 'Perfil não encontrado' });
        }

        res.status(200).json(updatedProfile);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao atualizar preferências' });
    }
};