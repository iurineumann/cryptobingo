import { usePalette, PALETTE_LIST, type PaletteId } from '../../hooks/usePalette';

interface PaletteSelectorProps {
    /** Mostra nome da paleta ativa ao lado dos swatches */
    showLabel?: boolean;
    className?: string;
}

export function PaletteSelector({ showLabel = false, className }: PaletteSelectorProps) {
    const { palette, setPalette } = usePalette();

    return (
        <div
            className={['cb-palette-picker', className].filter(Boolean).join(' ')}
            role="group"
            aria-label="Paleta de cores"
        >
            {showLabel && (
                <span
                    style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--cb-text-tertiary)',
                        fontWeight: 600,
                        letterSpacing: '0.01em',
                        flexShrink: 0,
                    }}
                >
                    Paleta
                </span>
            )}

            {PALETTE_LIST.map((p) => (
                <button
                    key={p.id}
                    type="button"
                    className="cb-palette-swatch"
                    data-active={palette === p.id ? 'true' : undefined}
                    onClick={() => setPalette(p.id as PaletteId)}
                    title={`${p.nome} — ${p.descricao}`}
                    aria-label={p.nome}
                    aria-pressed={palette === p.id}
                >
                    <span
                        className="cb-palette-swatch-dot"
                        style={{
                            background: `conic-gradient(
                                from 135deg,
                                ${p.swatchBg}      0deg  90deg,
                                ${p.swatchPrimary} 90deg 240deg,
                                ${p.swatchAccent}  240deg 360deg
                            )`,
                        }}
                    />
                </button>
            ))}
        </div>
    );
}
