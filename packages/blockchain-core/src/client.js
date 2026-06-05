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
/**
 * Busca o estado de um jogo na tabela `games` (scope: bingo.game).
 * Retorna null se o jogo não existir.
 */
async function fetchGame(gameId) {
    const gameIdU64 = antelope_1.UInt64.from(gameId);
    const response = await exports.rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: CONTRACT_ACCOUNT,
        table: 'games',
        lower_bound: gameIdU64,
        upper_bound: gameIdU64,
        limit: 1,
        json: true,
    });
    if (response.rows.length === 0)
        return null;
    return response.rows[0];
}
/**
 * Busca todas as cartelas de um jogador em um jogo via índice secundário `owner`.
 *
 * O scope da tabela `tickets` é o game_id (uint64).
 * O índice secundário é o cast uint64 do `name` do owner (Name.value).
 *
 * IMPORTANTE: Retorna BlockchainTicketRecord[] com os campos reais do contrato:
 *   { ticket_id, owner, matrix, state, game_id }
 */
async function fetchPlayerTickets(gameId, playerWallet) {
    const ownerU64 = antelope_1.Name.from(playerWallet).value;
    const response = await exports.rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: gameId, // Scope é o game_id, conforme o hpp
        table: 'tickets',
        index_position: 'secondary',
        key_type: 'i64',
        lower_bound: ownerU64,
        upper_bound: ownerU64,
        json: true,
    });
    return response.rows;
}
/**
 * Busca o saldo de um token específico na tabela `balances`.
 *
 * O scope da tabela `balances` é o account_name do usuário.
 * A primary key é o symbol_code.raw() do token.
 * Para buscar todos os tokens do usuário, omitimos lower/upper bound.
 *
 * Retorna null se o usuário não tiver nenhum saldo registrado.
 */
async function fetchPlayerBalance(playerWallet) {
    const response = await exports.rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: antelope_1.Name.from(playerWallet).value.toString(), // Scope = uint64 do name
        table: 'balances',
        json: true,
        limit: 20, // Um usuário raramente terá mais de 20 tokens diferentes
    });
    return response.rows;
}
//# sourceMappingURL=client.js.map