// apps/frontend/src/components/Lobby.tsx
// Lista de salas de bingo ativas lidas diretamente da blockchain.
// Integra o modal de compra de cartelas (BuyTicketModal) e exibe
// o saldo interno do jogador no contrato bingo.game.
//
// Correções em relação à versão anterior:
//   - Saldo lido com scope correto (Name.value do jogador, não bingo.game)
//   - buyticket → buytickets (ação correta do ABI)
//   - Fluxo de compra delegado ao BuyTicketModal + useTicketPurchase
//   - ticket_price e prize_pool renderizados como ExtendedAsset (objeto)
//
// Ref: SPEC.md §1.1 (tabela balances), §1.2 (tabela games), ADR-001

import { useEffect, useState, useCallback } from 'react';
import { Name, Session } from '@wharfkit/session';
import type { BlockchainGameState, BlockchainBalance } from '@cryptobingo/shared-types';
import BuyTicketModal from './BuyTicketModal';

interface LobbyProps {
    session: Session;
}

const CONTRACT_ACCOUNT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';

// Mapeamento de status → cor e label
const STATUS_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
    funding:  { color: '#059669', bg: '#d1fae5', label: '🟢 Vendas Abertas'  },
    locked:   { color: '#d97706', bg: '#fef3c7', label: '🔒 Encerrado'       },
    drawing:  { color: '#7c3aed', bg: '#ede9fe', label: '🎲 Sorteando'       },
    drawn:    { color: '#2563eb', bg: '#dbeafe', label: '✅ Sorteado'         },
    archived: { color: '#64748b', bg: '#f1f5f9', label: '📁 Arquivado'       },
    aborted:  { color: '#dc2626', bg: '#fee2e2', label: '❌ Cancelado'       },
};

export default function Lobby({ session }: LobbyProps) {
    const [balances, setBalances]           = useState<BlockchainBalance[]>([]);
    const [games, setGames]                 = useState<BlockchainGameState[]>([]);
    const [loadingData, setLoadingData]     = useState(false);
    const [selectedGame, setSelectedGame]   = useState<BlockchainGameState | null>(null);

    const loadBlockchainData = useCallback(async () => {
        setLoadingData(true);
        try {
            // 1. Saldo do jogador na tabela `balances`
            //    Scope: uint64 derivado do name do jogador (não do contrato)
            //    Ref: SPEC.md §1.1
            const ownerScope = Name.from(session.actor).value.toString();
            const balanceRes = await session.client.v1.chain.get_table_rows({
                code:  CONTRACT_ACCOUNT,
                scope: ownerScope,
                table: 'balances',
                limit: 20,
                json:  true,
            });
            setBalances(balanceRes.rows as BlockchainBalance[]);

            // 2. Jogos ativos na tabela `games`
            //    Scope: bingo.game (global do contrato)
            //    Ref: SPEC.md §1.2
            const gamesRes = await session.client.v1.chain.get_table_rows({
                code:  CONTRACT_ACCOUNT,
                scope: CONTRACT_ACCOUNT,
                table: 'games',
                limit: 20,
                json:  true,
            });
            setGames(gamesRes.rows as BlockchainGameState[]);
        } catch (err) {
            console.error('[Lobby] Erro ao carregar dados da blockchain:', err);
        } finally {
            setLoadingData(false);
        }
    }, [session]);

    // Carrega dados na montagem e a cada 15 segundos
    useEffect(() => {
        loadBlockchainData();
        const interval = setInterval(loadBlockchainData, 15_000);
        return () => clearInterval(interval);
    }, [loadBlockchainData]);

    const handlePurchaseSuccess = () => {
        // Aguarda 2s para a transação propagar e recarrega
        setTimeout(loadBlockchainData, 2000);
    };

    // ── Renderização do saldo ─────────────────────────────────────────────────
    const renderBalance = () => {
        if (balances.length === 0) {
            return <span style={{ color: '#94a3b8' }}>0.0000 BINGO</span>;
        }
        return (
            <span>
                {balances.map((b, i) => (
                    <span key={i} style={{ marginLeft: i > 0 ? '12px' : 0 }}>
                        {b.balance.quantity}
                    </span>
                ))}
            </span>
        );
    };

    // ── Renderização dos jogos ────────────────────────────────────────────────
    const renderGames = () => {
        if (loadingData && games.length === 0) {
            return (
                <div style={styles.emptyState}>
                    <span style={{ fontSize: '32px' }}>⏳</span>
                    <p>Carregando salas...</p>
                </div>
            );
        }

        if (games.length === 0) {
            return (
                <div style={styles.emptyState}>
                    <span style={{ fontSize: '32px' }}>🎱</span>
                    <p>Nenhuma sala ativa no contrato no momento.</p>
                    <button style={styles.refreshBtn} onClick={loadBlockchainData}>
                        🔄 Atualizar
                    </button>
                </div>
            );
        }

        return (
            <div style={styles.grid}>
                {games.map((game) => {
                    const statusCfg = STATUS_CONFIG[game.status] ?? {
                        color: '#64748b', bg: '#f1f5f9', label: game.status,
                    };

                    const canBuy = game.status === 'funding';

                    return (
                        <div key={game.game_id} style={styles.card}>
                            {/* Header do card */}
                            <div style={styles.cardHeader}>
                                <h3 style={styles.cardTitle}>Sala #{game.game_id}</h3>
                                <span style={{
                                    ...styles.statusBadge,
                                    color:      statusCfg.color,
                                    background: statusCfg.bg,
                                }}>
                                    {statusCfg.label}
                                </span>
                            </div>

                            {/* Detalhes financeiros */}
                            <div style={styles.cardBody}>
                                <div style={styles.infoRow}>
                                    <span style={styles.infoLabel}>Preço da Cartela</span>
                                    <span style={styles.infoValue}>{game.ticket_price.quantity}</span>
                                </div>
                                <div style={styles.infoRow}>
                                    <span style={styles.infoLabel}>Prêmio Acumulado</span>
                                    <span style={{ ...styles.infoValue, color: '#059669', fontWeight: 'bold' }}>
                                        {game.prize_pool.quantity}
                                    </span>
                                </div>
                                {game.sponsor_pool.length > 0 && (
                                    <div style={styles.infoRow}>
                                        <span style={styles.infoLabel}>Prêmio Patrocinado</span>
                                        <span style={{ ...styles.infoValue, color: '#7c3aed' }}>
                                            {game.sponsor_pool.map(s => s.quantity).join(' + ')}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Bolas sorteadas (se houver) */}
                            {game.drawn_balls.length > 0 && (
                                <div style={styles.drawnBalls}>
                                    <span style={styles.infoLabel}>Bolas Sorteadas:</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                                        {game.drawn_balls.map((ball, i) => (
                                            <span key={i} style={styles.ballChip}>{ball}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Botão de compra */}
                            {canBuy && (
                                <button
                                    style={styles.buyBtn}
                                    onClick={() => setSelectedGame(game)}
                                >
                                    🎲 Comprar Cartelas
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div style={styles.container}>
            {/* Header do Lobby */}
            <div style={styles.lobbyHeader}>
                <h2 style={{ margin: 0 }}>🎮 Lobby de Jogos</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={styles.balanceBox}>
                        💰 Saldo: {renderBalance()}
                    </div>
                    <button
                        style={styles.refreshBtn}
                        onClick={loadBlockchainData}
                        disabled={loadingData}
                        title="Atualizar dados da blockchain"
                    >
                        {loadingData ? '⏳' : '🔄'}
                    </button>
                </div>
            </div>

            {/* Lista de salas */}
            {renderGames()}

            {/* Modal de compra — montado apenas quando um jogo é selecionado */}
            {selectedGame && (
                <BuyTicketModal
                    gameId={selectedGame.game_id}
                    ticketPrice={selectedGame.ticket_price}
                    session={session}
                    onClose={() => setSelectedGame(null)}
                    onSuccess={handlePurchaseSuccess}
                />
            )}
        </div>
    );
}

// ==========================================
// ESTILOS
// ==========================================

const styles: Record<string, React.CSSProperties> = {
    container: {
        marginTop:    '24px',
        padding:      '24px',
        background:   '#f8fafc',
        borderRadius: '16px',
        border:       '1px solid #e2e8f0',
    },
    lobbyHeader: {
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        borderBottom:   '2px solid #cbd5e1',
        paddingBottom:  '16px',
        marginBottom:   '20px',
        flexWrap:       'wrap',
        gap:            '12px',
    },
    balanceBox: {
        background:   '#1e293b',
        color:        '#f8fafc',
        padding:      '8px 16px',
        borderRadius: '50px',
        fontWeight:   'bold',
        fontSize:     '14px',
    },
    refreshBtn: {
        background:   '#f1f5f9',
        border:       '1px solid #cbd5e1',
        borderRadius: '8px',
        padding:      '8px 12px',
        cursor:       'pointer',
        fontSize:     '16px',
    },
    grid: {
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap:                 '16px',
    },
    card: {
        background:   '#ffffff',
        borderRadius: '12px',
        border:       '1px solid #e2e8f0',
        boxShadow:    '0 4px 6px -1px rgba(0,0,0,0.07)',
        padding:      '20px',
        display:      'flex',
        flexDirection:'column',
        gap:          '12px',
    },
    cardHeader: {
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'flex-start',
        gap:            '8px',
    },
    cardTitle: {
        margin:     0,
        fontSize:   '18px',
        color:      '#0f172a',
        fontWeight: 'bold',
    },
    statusBadge: {
        padding:      '4px 10px',
        borderRadius: '50px',
        fontSize:     '12px',
        fontWeight:   'bold',
        whiteSpace:   'nowrap',
    },
    cardBody: {
        display:       'flex',
        flexDirection: 'column',
        gap:           '8px',
    },
    infoRow: {
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        fontSize:       '14px',
    },
    infoLabel: {
        color:    '#64748b',
        fontSize: '13px',
    },
    infoValue: {
        color:    '#0f172a',
        fontSize: '14px',
    },
    drawnBalls: {
        borderTop:  '1px solid #f1f5f9',
        paddingTop: '12px',
    },
    ballChip: {
        background:   '#e2e8f0',
        color:        '#1e293b',
        borderRadius: '50%',
        width:        '28px',
        height:       '28px',
        display:      'inline-flex',
        alignItems:   'center',
        justifyContent: 'center',
        fontSize:     '11px',
        fontWeight:   'bold',
    },
    buyBtn: {
        marginTop:    '4px',
        width:        '100%',
        padding:      '12px',
        background:   '#2563eb',
        color:        '#ffffff',
        border:       'none',
        borderRadius: '8px',
        cursor:       'pointer',
        fontWeight:   'bold',
        fontSize:     '15px',
        transition:   'background 0.2s',
    },
    emptyState: {
        textAlign:  'center',
        padding:    '48px 20px',
        color:      '#64748b',
    },
};
