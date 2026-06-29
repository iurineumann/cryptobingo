import { Request, Response } from 'express';
import { Session } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { rpcClient } from '@cryptobingo/blockchain-core';
import { Name, UInt64 } from '@wharfkit/antelope';
import type { BlockchainRoom } from '@cryptobingo/shared-types';
import RoomMetadataModel from '../models/RoomMetadata';

const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT      || 'bingogamectr';
const MICROSERVICE_KEY = process.env.MICROSERVICE_PRIVATE_KEY!;
const CHAIN_ID         = process.env.CHAIN_ID!;
const RPC_URL          = process.env.RPC_URL               || 'http://127.0.0.1:8888';

// ADR-026: assina como bingogamectr@admin com a chave do bingogamesvc
function getAdminSession(): Session {
    return new Session({
        actor:        CONTRACT_ACCOUNT,
        permission:   'admin',
        chain:        { id: CHAIN_ID, url: RPC_URL },
        walletPlugin: new WalletPluginPrivateKey(MICROSERVICE_KEY),
    });
}

// ==========================================
// GET /api/v1/rooms — Lista todas as salas on-chain
// ==========================================
export async function listRooms(_req: Request, res: Response): Promise<void> {
    try {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:  CONTRACT_ACCOUNT,
            scope: CONTRACT_ACCOUNT,
            table: 'rooms',
            limit: 100,
            json:  true,
        });
        const rooms = response.rows as BlockchainRoom[];

        const roomIds = rooms.map(r => String(r.room_id));

        const metadatas = await RoomMetadataModel.find({
            room_id: { $in: roomIds },
        }).lean();

        const metaMap = new Map(metadatas.map(m => [m.room_id, m]));

        const enriched = rooms.map(room => ({
            ...room,
            metadata: metaMap.get(String(room.room_id)) ?? null,
        }));

        res.status(200).json({ rooms: enriched });
    } catch (err) {
        console.error('[RoomCtrl] Erro ao listar salas:', err);
        res.status(503).json({ error: 'Nó blockchain indisponível.' });
    }
}

// ==========================================
// GET /api/v1/rooms/:roomId — Detalhe da sala
// ==========================================
export async function getRoom(req: Request, res: Response): Promise<void> {
    const { roomId } = req.params as Record<string, string>;
    try {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:        CONTRACT_ACCOUNT,
            scope:       CONTRACT_ACCOUNT,
            table:       'rooms',
            lower_bound: UInt64.from(roomId),
            upper_bound: UInt64.from(roomId),
            limit:       1,
            json:        true,
        });
        if (!response.rows.length) {
            res.status(404).json({ error: `Sala ${roomId} não encontrada.` });
            return;
        }
        const room = response.rows[0] as BlockchainRoom;
        const metadata = await RoomMetadataModel.findOne({ room_id: roomId }).lean();
        res.status(200).json({ ...room, metadata: metadata ?? null });
    } catch (err) {
        console.error('[RoomCtrl] Erro ao buscar sala:', err);
        res.status(503).json({ error: 'Nó blockchain indisponível.' });
    }
}

// ==========================================
// POST /api/v1/admin/rooms — Criar sala (on-chain + metadados)
// Auth: JWT admin
// ==========================================
export async function createRoom(req: Request, res: Response): Promise<void> {
    const {
        room_id, sponsor, gametype_id,
        currency_quantity, currency_contract,
        ticket_price_min_quantity, ticket_price_min_contract,
        ticket_price_max_quantity, ticket_price_max_contract,
        ticket_price_default_quantity, ticket_price_default_contract,
        max_tickets_per_player,
        name, description, cover_image_url, rules_summary,
        chat_enabled, auto_start_delay_sec, drops,
    } = req.body;

    if (!room_id || !currency_quantity || !currency_contract) {
        res.status(400).json({ error: 'Campos obrigatórios: room_id, currency_quantity, currency_contract.' });
        return;
    }

    try {
        const session = getAdminSession();

        const result = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'createroom',
                authorization: [session.permissionLevel],
                data: {
                    room_id:                UInt64.from(room_id),
                    sponsor:                sponsor || CONTRACT_ACCOUNT,
                    gametype_id:            UInt64.from(gametype_id ?? 0),
                    ticket_price_min: {
                        quantity: ticket_price_min_quantity || currency_quantity,
                        contract: ticket_price_min_contract || currency_contract,
                    },
                    ticket_price_max: {
                        quantity: ticket_price_max_quantity || currency_quantity,
                        contract: ticket_price_max_contract || currency_contract,
                    },
                    ticket_price_default: {
                        quantity: ticket_price_default_quantity || currency_quantity,
                        contract: ticket_price_default_contract || currency_contract,
                    },
                    max_tickets_per_player: max_tickets_per_player ?? 0,
                    sponsor_room:           !!sponsor,
                },
            }],
        }, { broadcast: true });

        // Persiste metadados off-chain
        await RoomMetadataModel.findOneAndUpdate(
            { room_id: String(room_id) },
            {
                $set: {
                    room_id:             String(room_id),
                    name:                name ?? '',
                    description:         description ?? '',
                    cover_image_url:      cover_image_url ?? '',
                    rules_summary:       rules_summary ?? '',
                    chat_enabled:        chat_enabled ?? true,
                    auto_start_delay_sec: auto_start_delay_sec ?? 30,
                    drops:               drops ?? [],
                },
            },
            { upsert: true }
        );

        console.log(`✅ [RoomCtrl] Sala ${room_id} criada. TX: ${result.response?.transaction_id}`);
        res.status(200).json({
            message:        `Sala ${room_id} criada com sucesso.`,
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[RoomCtrl] Erro ao criar sala:', err);
        res.status(500).json({ error: `Erro ao criar sala: ${msg}` });
    }
}

// ==========================================
// PUT /api/v1/admin/rooms/:roomId/metadata — Atualiza metadados off-chain
// Auth: JWT admin ou sponsor
// ==========================================
export async function upsertRoomMetadata(req: Request, res: Response): Promise<void> {
    const { roomId } = req.params as Record<string, string>;
    const {
        name, description, cover_image_url, rules_summary,
        chat_enabled, auto_start_delay_sec, drops,
    } = req.body;

    try {
        const updated = await RoomMetadataModel.findOneAndUpdate(
            { room_id: roomId },
            {
                $set: {
                    ...(name !== undefined                && { name }),
                    ...(description !== undefined         && { description }),
                    ...(cover_image_url !== undefined      && { cover_image_url }),
                    ...(rules_summary !== undefined       && { rules_summary }),
                    ...(chat_enabled !== undefined        && { chat_enabled }),
                    ...(auto_start_delay_sec !== undefined && { auto_start_delay_sec }),
                    ...(drops !== undefined               && { drops }),
                },
            },
            { upsert: true, returnDocument: 'after' }
        ).lean();

        res.status(200).json(updated);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[RoomCtrl] Erro ao atualizar metadados:', err);
        res.status(500).json({ error: `Erro ao atualizar metadados: ${msg}` });
    }
}

// ==========================================
// POST /api/v1/admin/rooms/:roomId/activate
// ==========================================
export async function activateRoom(req: Request, res: Response): Promise<void> {
    const { roomId } = req.params as Record<string, string>;
    try {
        const session = getAdminSession();
        const result = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'activateroom',
                authorization: [session.permissionLevel],
                data:          { room_id: UInt64.from(roomId) },
            }],
        }, { broadcast: true });
        res.status(200).json({
            message:        `Sala ${roomId} ativada.`,
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `Erro ao ativar sala: ${msg}` });
    }
}

// ==========================================
// POST /api/v1/admin/rooms/:roomId/pause
// ==========================================
export async function pauseRoom(req: Request, res: Response): Promise<void> {
    const { roomId } = req.params as Record<string, string>;
    try {
        const session = getAdminSession();
        const result = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'pauseroom',
                authorization: [session.permissionLevel],
                data:          { room_id: UInt64.from(roomId) },
            }],
        }, { broadcast: true });
        res.status(200).json({
            message:        `Sala ${roomId} pausada.`,
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `Erro ao pausar sala: ${msg}` });
    }
}

// ==========================================
// POST /api/v1/admin/rooms/:roomId/close
// ==========================================
export async function closeRoom(req: Request, res: Response): Promise<void> {
    const { roomId } = req.params as Record<string, string>;
    try {
        const session = getAdminSession();
        const result = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'closeroom',
                authorization: [session.permissionLevel],
                data:          { room_id: UInt64.from(roomId) },
            }],
        }, { broadcast: true });
        res.status(200).json({
            message:        `Sala ${roomId} fechada.`,
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `Erro ao fechar sala: ${msg}` });
    }
}

// ==========================================
// PUT /api/v1/admin/rooms/:roomId/settings — Atualiza configs on-chain
// ==========================================
export async function updateRoomSettings(req: Request, res: Response): Promise<void> {
    const { roomId } = req.params as Record<string, string>;
    const {
        room_drop_chance_bps, max_tickets_per_player,
    } = req.body;

    try {
        const session = getAdminSession();
        const result = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'setroommeta',
                authorization: [session.permissionLevel],
                data: {
                    room_id:                UInt64.from(roomId),
                    room_drop_chance_bps:   room_drop_chance_bps ?? 10000,
                    max_tickets_per_player: max_tickets_per_player ?? 10,
                },
            }],
        }, { broadcast: true });

        res.status(200).json({
            message:        `Configurações da sala ${roomId} atualizadas.`,
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `Erro ao atualizar sala: ${msg}` });
    }
}

// ==========================================
// GET /api/v1/sponsor/rooms — Salas do sponsor autenticado
// ==========================================
export async function listSponsorRooms(req: Request, res: Response): Promise<void> {
    const wallet = req.user?.wallet;
    if (!wallet) {
        res.status(401).json({ error: 'Autenticação necessária.' });
        return;
    }

    try {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:        CONTRACT_ACCOUNT,
            scope:       CONTRACT_ACCOUNT,
            table:       'rooms',
            index_position: 'secondary',
            key_type:       'name',
            lower_bound:    Name.from(wallet),
            upper_bound:    Name.from(wallet),
            limit: 50,
            json:  true,
        });
        const rooms = response.rows as BlockchainRoom[];

        const metadatas = await RoomMetadataModel.find({
            room_id: { $in: rooms.map(r => r.room_id) },
        }).lean();
        const metaMap = new Map(metadatas.map(m => [m.room_id, m]));

        const enriched = rooms.map(room => ({
            ...room,
            metadata: metaMap.get(room.room_id) ?? null,
        }));

        res.status(200).json({ rooms: enriched });
    } catch (err) {
        console.error('[RoomCtrl] Erro ao listar salas do sponsor:', err);
        res.status(503).json({ error: 'Nó blockchain indisponível.' });
    }
}

// ==========================================
// PUT /api/v1/admin/rooms/:roomId/nft-config
// Configura NFT allowlist + taxa + colateral da sala (ADR-028 §4).
// Auth: JWT admin
// ==========================================
export async function setRoomNft(req: Request, res: Response): Promise<void> {
    const { roomId } = req.params as Record<string, string>;
    const { nft_template_allowlist = [], campaign_id = 0, house_fee_bps = 0, estimated_monthly_tickets = 0 } = req.body;

    if (!Array.isArray(nft_template_allowlist)) {
        res.status(400).json({ error: 'nft_template_allowlist deve ser um array de números.' });
        return;
    }
    if (typeof house_fee_bps !== 'number' || house_fee_bps < 0 || house_fee_bps > 10000) {
        res.status(400).json({ error: 'house_fee_bps deve ser 0–10000.' });
        return;
    }

    try {
        const session = getAdminSession();
        const result = await session.transact({
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'setroomnft',
                authorization: [session.permissionLevel],
                data: {
                    room_id:                   UInt64.from(roomId),
                    nft_template_allowlist:     nft_template_allowlist.map((id: number) => UInt64.from(id)),
                    campaign_id:               UInt64.from(campaign_id),
                    house_fee_bps:             house_fee_bps,
                    estimated_monthly_tickets: estimated_monthly_tickets,
                },
            }],
        }, { broadcast: true });

        res.status(200).json({
            message:        `Configuração NFT da sala ${roomId} atualizada.`,
            transaction_id: result.response?.transaction_id,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `Erro ao configurar NFT da sala: ${msg}` });
    }
}

// ==========================================
// GET /api/v1/rooms/:roomId/treasury
// Saldo do treasury da sala (balance + locked).
// Público para leitura (exibição no lobby e dashboard sponsor).
// ==========================================
export async function getRoomTreasury(req: Request, res: Response): Promise<void> {
    const { roomId } = req.params as Record<string, string>;
    try {
        const response = await rpcClient.v1.chain.get_table_rows({
            code:        CONTRACT_ACCOUNT,
            scope:       CONTRACT_ACCOUNT,
            table:       'roomtresry',
            lower_bound: UInt64.from(roomId),
            upper_bound: UInt64.from(roomId),
            limit:       1,
            json:        true,
        });
        if (!response.rows.length) {
            res.status(200).json({ treasury: null });
            return;
        }
        res.status(200).json({ treasury: response.rows[0] });
    } catch (err) {
        console.error('[RoomCtrl] Erro ao buscar treasury:', err);
        res.status(503).json({ error: 'Nó blockchain indisponível.' });
    }
}
