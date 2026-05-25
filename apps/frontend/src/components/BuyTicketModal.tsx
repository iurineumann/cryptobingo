// apps/frontend/src/components/BuyTicketModal.tsx
// Modal de compra de cartelas. Orquestra a UX completa do fluxo:
//
//   1. Seleção de quantidade (1–10)
//   2. Confirmação e submissão via useTicketPurchase
//   3. Exibição das cartelas geradas em TicketGrid
//   4. Link para a transação on-chain
//
// Ref: ADR-001, SPEC.md §2.1, useTicketPurchase.ts

import { useState } from 'react';
import { Session } from '@wharfkit/session';
import { useTicketPurchase } from '../hooks/useTicketPurchase';
import TicketGrid from './TicketGrid';
import type { ExtendedAsset } from '@cryptobingo/shared-types';

interface BuyTicketModalProps {
    gameId: string;
    ticketPrice: ExtendedAsset;
    session: Session;
    onClose: () => void;
    onSuccess: () => void; // Callback para atualizar o lobby após compra
}

const EXPLORER_BASE = import.meta.env.VITE_EXPLORER_URL ?? 'https://wax.bloks.io';

export default function BuyTicketModal({
    gameId,
    ticketPrice,
    session,
    onClose,
    onSuccess,
}: BuyTicketModalProps) {
    const [count, setCount] = useState(1);
    const { isPurchasing, purchaseError, lastPurchase, purchaseTickets, clearError } = useTicketPurchase();

    const handleBuy = async () => {
        clearError();
        const result = await purchaseTickets(session, gameId, count);
        if (result) {
            onSuccess(); // Atualiza saldo/lobby no pai
        }
    };

    // Cálculo do custo total para exibição (sem BigInt completo — apenas display)
    const [priceAmount, priceSymbol] = ticketPrice.quantity.split(' ');
    const totalDisplay = `${(parseFloat(priceAmount) * count).toFixed(4)} ${priceSymbol}`;

    // ── Tela de sucesso — exibe as cartelas geradas ───────────────────────────
    if (lastPurchase) {
        return (
            <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
                <div style={styles.modal}>
                    <div style={styles.header}>
                        <h2 style={{ margin: 0, color: '#059669' }}>🎉 Cartelas Compradas!</h2>
                        <button style={styles.closeBtn} onClick={onClose}>✕</button>
                    </div>

                    <p style={{ color: '#475569', marginBottom: '8px' }}>
                        <strong>{lastPurchase.ticketCount}</strong> cartela(s) adquirida(s) no jogo <strong>#{gameId}</strong>.
                    </p>

                    {lastPurchase.transactionId !== 'pending' && (
                        <a
                            href={`${EXPLORER_BASE}/transaction/${lastPurchase.transactionId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '13px', color: '#2563eb', wordBreak: 'break-all' }}
                        >
                            Ver transação: {lastPurchase.transactionId.slice(0, 24)}...
                        </a>
                    )}

                    <h3 style={{ marginTop: '24px', marginBottom: '12px' }}>Suas Cartelas:</h3>

                    <div style={styles.ticketsList}>
                        {lastPurchase.tickets.map((ticket, idx) => (
                            <div key={idx} style={{ textAlign: 'center' }}>
                                <p style={{ marginBottom: '6px', fontWeight: 'bold', color: '#64748b', fontSize: '13px' }}>
                                    Cartela #{idx + 1}
                                </p>
                                <TicketGrid matrix={ticket.matrix} />
                            </div>
                        ))}
                    </div>

                    <button style={{ ...styles.btnPrimary, marginTop: '20px', width: '100%' }} onClick={onClose}>
                        Fechar
                    </button>
                </div>
            </div>
        );
    }

    // ── Tela de compra ────────────────────────────────────────────────────────
    return (
        <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div style={{ ...styles.modal, maxWidth: '400px' }}>
                <div style={styles.header}>
                    <h2 style={{ margin: 0 }}>🎲 Comprar Cartelas</h2>
                    <button style={styles.closeBtn} onClick={onClose} disabled={isPurchasing}>✕</button>
                </div>

                <p style={{ color: '#475569' }}>Jogo <strong>#{gameId}</strong></p>

                {/* Seletor de quantidade */}
                <div style={styles.formGroup}>
                    <label style={styles.label}>Quantidade de cartelas</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                        <button
                            style={styles.counterBtn}
                            onClick={() => setCount(c => Math.max(1, c - 1))}
                            disabled={isPurchasing || count <= 1}
                        >−</button>
                        <span style={{ fontSize: '24px', fontWeight: 'bold', minWidth: '32px', textAlign: 'center' }}>
                            {count}
                        </span>
                        <button
                            style={styles.counterBtn}
                            onClick={() => setCount(c => Math.min(10, c + 1))}
                            disabled={isPurchasing || count >= 10}
                        >+</button>
                    </div>
                </div>

                {/* Resumo de custo */}
                <div style={styles.costBox}>
                    <div style={styles.costRow}>
                        <span>Preço por cartela</span>
                        <span>{ticketPrice.quantity}</span>
                    </div>
                    <div style={styles.costRow}>
                        <span>Quantidade</span>
                        <span>× {count}</span>
                    </div>
                    <div style={{ ...styles.costRow, fontWeight: 'bold', borderTop: '1px solid #cbd5e1', paddingTop: '8px', marginTop: '4px' }}>
                        <span>Total</span>
                        <span style={{ color: '#2563eb' }}>{totalDisplay}</span>
                    </div>
                </div>

                {/* Erro */}
                {purchaseError && (
                    <div style={styles.errorBox}>
                        ⚠️ {purchaseError}
                    </div>
                )}

                {/* Botões */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                    <button
                        style={{ ...styles.btnSecondary, flex: 1 }}
                        onClick={onClose}
                        disabled={isPurchasing}
                    >
                        Cancelar
                    </button>
                    <button
                        style={{ ...styles.btnPrimary, flex: 2, opacity: isPurchasing ? 0.7 : 1 }}
                        onClick={handleBuy}
                        disabled={isPurchasing}
                    >
                        {isPurchasing ? '⏳ Processando...' : `Comprar ${count} Cartela${count > 1 ? 's' : ''}`}
                    </button>
                </div>

                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', textAlign: 'center' }}>
                    O valor será debitado do saldo interno do contrato.
                </p>
            </div>
        </div>
    );
}

// ==========================================
// ESTILOS
// ==========================================

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position:       'fixed',
        inset:          0,
        background:     'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        zIndex:         1000,
        padding:        '20px',
    },
    modal: {
        background:   '#ffffff',
        borderRadius: '16px',
        padding:      '28px',
        width:        '100%',
        maxWidth:     '680px',
        maxHeight:    '90vh',
        overflowY:    'auto',
        boxShadow:    '0 25px 50px -12px rgba(0,0,0,0.25)',
    },
    header: {
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        marginBottom:   '16px',
        paddingBottom:  '16px',
        borderBottom:   '1px solid #e2e8f0',
    },
    closeBtn: {
        background:   'none',
        border:       'none',
        fontSize:     '20px',
        cursor:       'pointer',
        color:        '#64748b',
        padding:      '4px 8px',
        borderRadius: '6px',
    },
    formGroup: {
        marginTop:    '16px',
    },
    label: {
        display:    'block',
        fontWeight: 'bold',
        color:      '#374151',
        fontSize:   '14px',
    },
    counterBtn: {
        width:        '40px',
        height:       '40px',
        borderRadius: '8px',
        border:       '2px solid #cbd5e1',
        background:   '#f8fafc',
        fontSize:     '20px',
        cursor:       'pointer',
        fontWeight:   'bold',
        color:        '#374151',
    },
    costBox: {
        background:   '#f8fafc',
        border:       '1px solid #e2e8f0',
        borderRadius: '8px',
        padding:      '16px',
        marginTop:    '20px',
    },
    costRow: {
        display:        'flex',
        justifyContent: 'space-between',
        marginBottom:   '6px',
        fontSize:       '14px',
        color:          '#374151',
    },
    errorBox: {
        background:   '#fef2f2',
        border:       '1px solid #fecaca',
        borderRadius: '8px',
        padding:      '12px',
        marginTop:    '12px',
        color:        '#dc2626',
        fontSize:     '14px',
    },
    btnPrimary: {
        background:   '#2563eb',
        color:        '#ffffff',
        border:       'none',
        borderRadius: '8px',
        padding:      '12px 20px',
        fontSize:     '15px',
        fontWeight:   'bold',
        cursor:       'pointer',
    },
    btnSecondary: {
        background:   '#f1f5f9',
        color:        '#374151',
        border:       '1px solid #cbd5e1',
        borderRadius: '8px',
        padding:      '12px 20px',
        fontSize:     '15px',
        cursor:       'pointer',
    },
    ticketsList: {
        display:             'flex',
        flexWrap:            'wrap',
        gap:                 '20px',
        justifyContent:      'center',
        maxHeight:           '400px',
        overflowY:           'auto',
        padding:             '8px',
    },
};
