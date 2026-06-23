import { useState, useEffect, useCallback } from 'react';

export type PaletteId = 'alta-roda' | 'feltro-verde' | 'cobre-cosmos';

const PALETTE_KEY = 'cb_palette';
const DEFAULT_PALETTE: PaletteId = 'alta-roda';

export interface PaletteDef {
    id: PaletteId;
    nome: string;
    descricao: string;
    swatchPrimary: string;
    swatchAccent: string;
    swatchBg: string;
}

export const PALETTES: Record<PaletteId, PaletteDef> = {
    'alta-roda': {
        id: 'alta-roda',
        nome: 'Alta Roda',
        descricao: 'Rose-magenta em tinta pura',
        swatchPrimary: 'oklch(0.620 0.220 352)',
        swatchAccent:  'oklch(0.870 0.180 75)',
        swatchBg:      'oklch(0.090 0.000 0)',
    },
    'feltro-verde': {
        id: 'feltro-verde',
        nome: 'Feltro Verde',
        descricao: 'Vermilhão em verde de cassino',
        swatchPrimary: 'oklch(0.640 0.210 15)',
        swatchAccent:  'oklch(0.900 0.130 86)',
        swatchBg:      'oklch(0.095 0.018 145)',
    },
    'cobre-cosmos': {
        id: 'cobre-cosmos',
        nome: 'Cobre & Cosmos',
        descricao: 'Bronze com chartreuse elétrico',
        swatchPrimary: 'oklch(0.620 0.165 50)',
        swatchAccent:  'oklch(0.880 0.200 135)',
        swatchBg:      'oklch(0.095 0.012 55)',
    },
};

export const PALETTE_LIST = Object.values(PALETTES);

function readSaved(): PaletteId {
    try {
        const saved = localStorage.getItem(PALETTE_KEY) as PaletteId | null;
        if (saved && saved in PALETTES) return saved;
    } catch {
        // localStorage bloqueado (SSR / iframe sandbox)
    }
    return DEFAULT_PALETTE;
}

export function usePalette() {
    const [palette, setPaletteState] = useState<PaletteId>(readSaved);

    useEffect(() => {
        document.documentElement.setAttribute('data-palette', palette);
        try { localStorage.setItem(PALETTE_KEY, palette); } catch { /* noop */ }
    }, [palette]);

    const setPalette = useCallback((p: PaletteId) => {
        setPaletteState(p);
    }, []);

    return {
        palette,
        setPalette,
        current: PALETTES[palette],
        palettes: PALETTE_LIST,
    };
}
