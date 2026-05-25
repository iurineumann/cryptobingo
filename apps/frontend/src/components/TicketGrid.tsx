// apps/frontend/src/components/TicketGrid.tsx
// Renderiza visualmente uma cartela 5x5 de Bingo.
//
// Layout de exibição (linha-maior, como o jogador enxerga):
//   Col:   B     I     N     G     O
//   Row0: B[0]  I[0]  N[0]  G[0]  O[0]
//   Row1: B[1]  I[1]  N[1]  G[1]  O[1]
//   Row2: B[2]  I[2]  FREE  G[2]  O[2]   ← FREE SPACE sempre no centro
//   Row3: B[3]  I[3]  N[2]  G[3]  O[3]
//   Row4: B[4]  I[4]  N[3]  G[4]  O[4]
//
// A matrix recebida tem 24 posições em ordem coluna-maior:
//   [B0-B4, I0-I4, N0,N1,N3,N4, G0-G4, O0-O4]
// A posição 12 (FREE SPACE no bit-layout) não existe na matrix.
//
// Para renderizar em grade linha-maior, fazemos a transposição aqui.
// Ref: SPEC.md §1.3, ADR-004 (layout de bits)

import React from 'react';

// ==========================================
// TIPOS
// ==========================================

interface TicketGridProps {
    /** Array de 24 números da cartela (sem FREE SPACE). */
    matrix: number[];
    /** Números já sorteados — célula fica marcada. */
    drawnBalls?: Set<number>;
    /** Se true, exibe o cartão em modo compacto (sem header de colunas). */
    compact?: boolean;
}

// ==========================================
// HELPER: Reconstrói a grade 5x5 para exibição linha-maior
// ==========================================

/**
 * Converte o array coluna-maior de 24 posições para uma grade
 * de 5 linhas × 5 colunas, inserindo FREE SPACE na posição [2][2].
 *
 * Retorna matrix[row][col] onde null representa o FREE SPACE.
 */
function buildDisplayGrid(matrix: number[]): (number | null)[][] {
    // Extrai as 5 colunas a partir da matrix coluna-maior
    const B = matrix.slice(0,  5);   // índices 0-4
    const I = matrix.slice(5,  10);  // índices 5-9
    // Coluna N tem 4 números: rows 0,1 (antes do FREE SPACE) e rows 3,4 (após)
    const N_raw = matrix.slice(10, 14); // índices 10-13
    const G = matrix.slice(14, 19);  // índices 14-18
    const O = matrix.slice(19, 24);  // índices 19-23

    // Reconstrói a coluna N com FREE SPACE no row 2
    const N: (number | null)[] = [N_raw[0], N_raw[1], null, N_raw[2], N_raw[3]];

    // Transpõe colunas → linhas para exibição grid
    return Array.from({ length: 5 }, (_, row) => [
        B[row], I[row], N[row], G[row], O[row],
    ]);
}

// ==========================================
// ESTILOS INLINE (sem dependência de CSS externo)
// ==========================================

const COLORS = {
    header:       '#1e293b',
    headerText:   '#f8fafc',
    cellBg:       '#ffffff',
    cellBorder:   '#cbd5e1',
    cellText:     '#0f172a',
    marked:       '#2563eb',
    markedText:   '#ffffff',
    freeSpace:    '#f59e0b',
    freeText:     '#ffffff',
    colB:         '#ef4444',
    colI:         '#f97316',
    colN:         '#22c55e',
    colG:         '#3b82f6',
    colO:         '#a855f7',
};

const COL_COLORS = [COLORS.colB, COLORS.colI, COLORS.colN, COLORS.colG, COLORS.colO];

// ==========================================
// COMPONENTE
// ==========================================

export default function TicketGrid({ matrix, drawnBalls = new Set(), compact = false }: TicketGridProps) {
    if (matrix.length !== 24) {
        return (
            <div style={{ color: 'red', fontSize: '12px' }}>
                Cartela inválida: esperadas 24 posições, recebidas {matrix.length}.
            </div>
        );
    }

    const grid = buildDisplayGrid(matrix);

    const cellSize = compact ? 36 : 48;
    const fontSize = compact ? 13 : 16;
    const headerSize = compact ? 14 : 18;

    return (
        <div style={{
            display:       'inline-block',
            border:        `2px solid ${COLORS.cellBorder}`,
            borderRadius:  '10px',
            overflow:      'hidden',
            boxShadow:     '0 4px 12px rgba(0,0,0,0.08)',
            userSelect:    'none',
        }}>
            {/* Header B-I-N-G-O */}
            {!compact && (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(5, ${cellSize}px)` }}>
                    {['B','I','N','G','O'].map((col, colIdx) => (
                        <div key={col} style={{
                            background:  COL_COLORS[colIdx],
                            color:       '#ffffff',
                            textAlign:   'center',
                            fontWeight:  'bold',
                            fontSize:    `${headerSize}px`,
                            padding:     '8px 0',
                            letterSpacing: '2px',
                        }}>
                            {col}
                        </div>
                    ))}
                </div>
            )}

            {/* Grade 5×5 */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(5, ${cellSize}px)` }}>
                {grid.map((row, rowIdx) =>
                    row.map((cell, colIdx) => {
                        const isFreeSpace = cell === null;
                        const isMarked    = !isFreeSpace && drawnBalls.has(cell!);

                        let bg      = COLORS.cellBg;
                        let fg      = COLORS.cellText;
                        let content: React.ReactNode = cell;

                        if (isFreeSpace) {
                            bg      = COLORS.freeSpace;
                            fg      = COLORS.freeText;
                            content = '★';
                        } else if (isMarked) {
                            bg      = COLORS.marked;
                            fg      = COLORS.markedText;
                        }

                        return (
                            <div
                                key={`${rowIdx}-${colIdx}`}
                                style={{
                                    width:          `${cellSize}px`,
                                    height:         `${cellSize}px`,
                                    display:        'flex',
                                    alignItems:     'center',
                                    justifyContent: 'center',
                                    background:     bg,
                                    color:          fg,
                                    fontSize:       `${fontSize}px`,
                                    fontWeight:     isMarked || isFreeSpace ? 'bold' : 'normal',
                                    border:         `1px solid ${COLORS.cellBorder}`,
                                    transition:     'background 0.3s ease, color 0.3s ease',
                                    cursor:         'default',
                                    // Feedback visual de marcação
                                    boxShadow:      isMarked ? 'inset 0 0 0 3px rgba(255,255,255,0.4)' : 'none',
                                    borderRadius:   isFreeSpace ? '4px' : '0',
                                }}
                                title={isFreeSpace ? 'FREE SPACE' : `Número ${cell}`}
                            >
                                {content}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
