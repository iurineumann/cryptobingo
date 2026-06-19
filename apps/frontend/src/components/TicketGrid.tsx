// apps/frontend/src/components/TicketGrid.tsx
// Cartela 5x5 de Bingo — migrada para Tailwind v4 + Design System cb-*.
//
// Layout linha-maior:
//   Col:   B     I     N     G     O
//   Row0: B[0]  I[0]  N[0]  G[0]  O[0]
//   Row1: B[1]  I[1]  N[1]  G[1]  O[1]
//   Row2: B[2]  I[2]  FREE  G[2]  O[2]  ← FREE SPACE centro
//   Row3: B[3]  I[3]  N[2]  G[3]  O[3]
//   Row4: B[4]  I[4]  N[3]  G[4]  O[4]
//
// Ref: SPEC.md §1.3, ADR-004

import React, { useRef, useEffect } from 'react';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface TicketGridProps {
    matrix:       number[];
    drawnBalls?:  Set<number>;
    compact?:     boolean;
    /** Última bola sorteada — anima apenas esta célula */
    lastDrawn?:   number;
}

// ── Helper ───────────────────────────────────────────────────────────────────

function buildDisplayGrid(matrix: number[]): (number | null)[][] {
    const B     = matrix.slice(0,  5);
    const I     = matrix.slice(5,  10);
    const N_raw = matrix.slice(10, 14);
    const G     = matrix.slice(14, 19);
    const O     = matrix.slice(19, 24);
    const N: (number | null)[] = [N_raw[0], N_raw[1], null, N_raw[2], N_raw[3]];
    return Array.from({ length: 5 }, (_, row) => [B[row], I[row], N[row], G[row], O[row]]);
}

// Cor da coluna BINGO mapeada para as CSS vars do Design System
const COL_VAR = [
    'var(--color-bingo-b)',
    'var(--color-bingo-i)',
    'var(--color-bingo-n)',
    'var(--color-bingo-g)',
    'var(--color-bingo-o)',
];

const COL_LABELS = ['B', 'I', 'N', 'G', 'O'];

// ── Componente ───────────────────────────────────────────────────────────────

export default function TicketGrid({
    matrix,
    drawnBalls = new Set(),
    compact    = false,
    lastDrawn,
}: TicketGridProps) {

    // Ref para animar a célula recém marcada
    const lastMarkedRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (lastDrawn && lastMarkedRef.current) {
            const el = lastMarkedRef.current;
            el.classList.remove('animate-ball-drop');
            // Força reflow para reiniciar a animação
            void el.offsetWidth;
            el.classList.add('animate-ball-drop');
        }
    }, [lastDrawn]);

    if (matrix.length !== 24) {
        return (
            <p className="text-xs text-[--cb-danger] font-mono">
                Cartela inválida: {matrix.length}/24 posições.
            </p>
        );
    }

    const grid = buildDisplayGrid(matrix);

    return (
        <div
            className={[
                'inline-block rounded-xl overflow-hidden select-none',
                'border border-[--cb-border-default]',
                'shadow-[var(--shadow-card)]',
                compact ? 'w-40' : 'w-60',
            ].join(' ')}
            role="grid"
            aria-label="Cartela de Bingo"
        >
            {/* Header B-I-N-G-O */}
            {!compact && (
                <div className="grid grid-cols-5">
                    {COL_LABELS.map((col, colIdx) => (
                        <div
                            key={col}
                            className="flex items-center justify-center py-2 font-black tracking-widest text-white text-sm"
                            style={{ background: COL_VAR[colIdx] }}
                            aria-label={`Coluna ${col}`}
                        >
                            {col}
                        </div>
                    ))}
                </div>
            )}

            {/* Grade 5×5 */}
            <div className="grid grid-cols-5">
                {grid.map((row, rowIdx) =>
                    row.map((cell, colIdx) => {
                        const isFreeSpace = cell === null;
                        const isMarked    = !isFreeSpace && drawnBalls.has(cell!);
                        const isLastHit   = !isFreeSpace && cell === lastDrawn && isMarked;

                        const baseCell = compact
                            ? 'aspect-square flex items-center justify-center text-[11px] font-semibold border border-[--cb-border-subtle]'
                            : 'aspect-square flex items-center justify-center text-sm font-semibold border border-[--cb-border-subtle]';

                        if (isFreeSpace) {
                            return (
                                <div
                                    key={`${rowIdx}-${colIdx}`}
                                    className={`${baseCell} cb-bingo-cell-free text-lg font-black`}
                                    style={{ background: 'linear-gradient(135deg, var(--color-accent-600), var(--color-accent-400))' }}
                                    title="FREE SPACE"
                                    aria-label="Espaço livre"
                                    role="gridcell"
                                >
                                    FREE
                                </div>
                            );
                        }

                        if (isMarked) {
                            return (
                                <div
                                    key={`${rowIdx}-${colIdx}`}
                                    ref={isLastHit ? lastMarkedRef : null}
                                    className={[
                                        baseCell,
                                        'text-white font-bold relative overflow-hidden',
                                        isLastHit ? 'animate-[cb-ball-drop_0.45s_cubic-bezier(0.4,0,0.2,1)_forwards]' : '',
                                    ].join(' ')}
                                    style={{
                                        background: COL_VAR[colIdx],
                                        boxShadow: `inset 0 0 0 2px rgba(255,255,255,0.3)`,
                                    }}
                                    title={`Número ${cell} — marcado`}
                                    role="gridcell"
                                    aria-selected={true}
                                >
                                    {cell}
                                    {/* Gloss effect */}
                                    <span className="absolute inset-0 pointer-events-none"
                                          style={{ background: 'radial-gradient(ellipse at 35% 25%, rgba(255,255,255,0.25) 0%, transparent 60%)' }} />
                                </div>
                            );
                        }

                        return (
                            <div
                                key={`${rowIdx}-${colIdx}`}
                                className={`${baseCell} bg-[--cb-bg-elevated] text-[--cb-text-secondary] hover:bg-[--cb-border-subtle] transition-colors duration-150`}
                                title={`Número ${cell}`}
                                role="gridcell"
                                aria-selected={false}
                            >
                                {cell}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
