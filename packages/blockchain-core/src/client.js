"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rpcClient = void 0;
exports.fetchGame = fetchGame;
exports.fetchPlayerTickets = fetchPlayerTickets;
exports.fetchPlayerBalance = fetchPlayerBalance;
const antelope_1 = require("@wharfkit/antelope");
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8888';
const CONTRACT_ACCOUNT = 'bingo.game';
exports.rpcClient = new antelope_1.APIClient({ url: RPC_URL });
async function fetchGame(gameId) {
    const response = await exports.rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: CONTRACT_ACCOUNT,
        table: 'games',
        // CORREÇÃO: Convertendo string para UInt64 da rede Antelope
        lower_bound: antelope_1.UInt64.from(gameId),
        upper_bound: antelope_1.UInt64.from(gameId),
        limit: 1,
        json: true,
    });
    if (response.rows.length === 0)
        return null;
    return response.rows[0];
}
async function fetchPlayerTickets(gameId, playerWallet) {
    const response = await exports.rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: gameId,
        table: 'tickets',
        index_position: 'secondary',
        key_type: 'i64',
        // CORREÇÃO: Convertendo a carteira do jogador para o tipo Name
        lower_bound: antelope_1.Name.from(playerWallet).value,
        upper_bound: antelope_1.Name.from(playerWallet).value,
        json: true,
    });
    return response.rows;
}
async function fetchPlayerBalance(playerWallet) {
    const response = await exports.rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: CONTRACT_ACCOUNT,
        table: 'balances',
        // CORREÇÃO: Convertendo a carteira do jogador para o tipo Name
        lower_bound: antelope_1.Name.from(playerWallet),
        upper_bound: antelope_1.Name.from(playerWallet),
        limit: 1,
        json: true,
    });
    if (response.rows.length === 0)
        return null;
    return response.rows[0];
}
//# sourceMappingURL=client.js.map