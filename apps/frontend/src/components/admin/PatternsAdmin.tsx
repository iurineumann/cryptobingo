import { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAdminPatterns, createAdminPattern, deleteAdminPattern, fetchAdminGametypes, type BlockchainPattern, type BlockchainGametype } from '../../services/api';

// Layout coluna-maior do grid 5×5
//     B  I  N  G  O
// R0  0  5  10 15 20
// R1  1  6  11 16 21
// R2  2  7  12† 17 22    † = FREE SPACE (bit 12)
// R3  3  8  13 18 23
// R4  4  9  14 19 24
const BIT_TO_ROW = (b: number) => b % 5;
const BIT_TO_COL = (b: number) => Math.floor(b / 5);
const CELL_LABELS = ['B','I','N','G','O'];

const BIT_NAMES: Record<number, string> = {
    0:'B1', 1:'B2', 2:'B3', 3:'B4', 4:'B5',
    5:'I1', 6:'I2', 7:'I3', 8:'I4', 9:'I5',
    10:'N1', 11:'N2', 13:'N3', 14:'N4',
    15:'G1', 16:'G2', 17:'G3', 18:'G4', 19:'G5',
    20:'O1', 21:'O2', 22:'O3', 23:'O4', 24:'O5',
};

// Máscaras computadas com layout coluna-maior: bit = col×5 + row
// Visualização (B I N G O, linhas 1-5) — '*' = FREE SPACE (sempre ativo):
//   BINGO_B  █████ █···█ ██*██ █···█ █████  (Col B + Row 1 + Row 5 + Col O + Row 3)
//   BINGO_I  █████ ··█·· ··*·· ··█·· █████  (Row 1 + Col N central + Row 5)
//   BINGO_N  █···█ ██··█ █·*·█ █··██ █···█  (Col B + Diag TL-BR + Col O)
//   BINGO_G  █████ █···· █·*██ █···█ █████  (Row 1 + Col B + Row 5 + O3 + O4 + G3 + N3)
//   BINGO_O  █████ █···█ █·*·█ █···█ █████  (Row 1 + Row 5 + Col B + Col O)
const SUGGEST_PATTERNS = [
    // Básicos: 5 linhas + 2 diagonais
    { name: 'ROW_0',      mask: 1_082_401,  group: 'basic'   as const },
    { name: 'ROW_1',      mask: 2_164_802,  group: 'basic'   as const },
    { name: 'ROW_2',      mask: 4_329_604,  group: 'basic'   as const },
    { name: 'ROW_3',      mask: 8_659_208,  group: 'basic'   as const },
    { name: 'ROW_4',      mask: 17_318_416, group: 'basic'   as const },
    { name: 'DIAG_TL_BR', mask: 17_043_521, group: 'basic'   as const },
    { name: 'DIAG_TR_BL', mask: 1_118_480,  group: 'basic'   as const },
    // Especiais: letras BINGO (formas compostas de múltiplas linhas/colunas)
    { name: 'BINGO_B',    mask: 33_216_191, group: 'special' as const },
    { name: 'BINGO_I',    mask: 18_415_153, group: 'special' as const }, // Col N (central), não Col I
    { name: 'BINGO_N',    mask: 32_772_191, group: 'special' as const },
    { name: 'BINGO_G',    mask: 31_118_911, group: 'special' as const },
    { name: 'BINGO_O',    mask: 33_080_895, group: 'special' as const },
    // Mestre: cartela completa
    { name: 'MASTER',     mask: (1 << 25) - 1, group: 'master' as const },
];

function maskToGrid(mask: number): boolean[] {
    const grid = new Array(25).fill(false);
    for (let b = 0; b < 25; b++) {
        if (b === 12) continue;
        if (mask & (1 << b)) grid[b] = true;
    }
    return grid;
}

function gridToMask(grid: boolean[]): number {
    let mask = 1 << 12; // FREE SPACE sempre ativo
    for (let b = 0; b < 25; b++) {
        if (b === 12) continue;
        if (grid[b]) mask |= (1 << b);
    }
    return mask;
}

function GridEditor({ mask, onChange }: { mask: number; onChange: (v: number) => void }) {
    const grid = useMemo(() => maskToGrid(mask), [mask]);

    const toggle = useCallback((bit: number) => {
        if (bit === 12) return;
        const next = [...grid];
        next[bit] = !next[bit];
        onChange(gridToMask(next));
    }, [grid, onChange]);

    const bitIndex = (col: number, row: number) => col * 5 + row;

    return (
        <div className="inline-flex flex-col gap-1 select-none">
            {/* Cabeçalho das colunas */}
            <div className="flex gap-1 pl-8">
                {CELL_LABELS.map(l => (
                    <div key={l} className="w-9 h-6 flex items-center justify-center text-xs font-bold text-[--cb-text-tertiary]">
                        {l}
                    </div>
                ))}
            </div>
            {[0,1,2,3,4].map(row => (
                <div key={row} className="flex items-center gap-1">
                    <span className="w-6 text-xs text-[--cb-text-tertiary] text-right pr-1">{row + 1}</span>
                    {[0,1,2,3,4].map(col => {
                        const bit = bitIndex(col, row);
                        const isCenter = bit === 12;
                        const active = grid[bit];
                        return (
                            <button
                                key={bit}
                                type="button"
                                data-testid={`pattern-cell-${row}-${col}`}
                                disabled={isCenter}
                                title={isCenter ? 'FREE SPACE' : BIT_NAMES[bit] ?? `bit ${bit}`}
                                className={[
                                    'w-9 h-9 rounded-lg text-xs font-mono font-bold border transition-all duration-100',
                                    isCenter
                                        ? 'bg-[--cb-bg-surface] border-[--cb-border-default] text-[--cb-text-tertiary] cursor-default'
                                        : active
                                            ? 'bg-[--cb-brand] border-[--cb-brand] text-white shadow-sm scale-105'
                                            : 'bg-[--cb-bg-elevated] border-[--cb-border-default] text-[--cb-text-secondary] hover:border-[--cb-border-strong] hover:bg-[--cb-bg-surface]',
                                ].join(' ')}
                                onClick={() => toggle(bit)}
                                aria-label={isCenter ? 'FREE' : `${BIT_NAMES[bit] ?? bit}`}
                                aria-pressed={active}
                            >
                                {isCenter ? '★' : active ? '█' : '·'}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

function maskToGridPreview(mask: number): string {
    const lines: string[] = [];
    for (let r = 0; r < 5; r++) {
        const row: string[] = [];
        for (let c = 0; c < 5; c++) {
            const bit = c * 5 + r;
            // '★' (U+2605) tem largura ambígua em fontes monospace e desalinha as células
            // seguintes; '*' é ASCII puro e sempre ocupa exatamente 1 coluna.
            row.push(bit === 12 ? '*' : (mask & (1 << bit)) ? '█' : '·');
        }
        lines.push(row.join(' '));
    }
    return lines.join('\n');
}

export default function PatternsAdmin() {
    const { t } = useTranslation();
    const [patterns,  setPatterns]  = useState<BlockchainPattern[]>([]);
    const [gametypes, setGametypes] = useState<BlockchainGametype[]>([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('');
    const [editMask, setEditMask] = useState<number>(1 << 12); // só FREE SPACE
    const [saving, setSaving] = useState(false);
    const [suggesting, setSuggesting] = useState(false);
    const [suggestMsg, setSuggestMsg] = useState<{ created: number; skipped: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const [patData, gtData] = await Promise.all([
                fetchAdminPatterns(),
                fetchAdminGametypes(),
            ]);
            setPatterns(patData.patterns);
            setGametypes(gtData.gametypes);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.patterns_error_load'));
        } finally {
            setLoading(false);
        }
    };

    // IDs de padrões atualmente em uso por algum gametype (impede remoção)
    const usedPatternIds = useMemo(
        () => new Set(gametypes.flatMap(gt => (gt.rules ?? []).map(r => String(r.pattern_id)))),
        [gametypes]
    );

    const handleSuggest = async () => {
        setSuggesting(true);
        setSuggestMsg(null);
        setError(null);
        // Verifica por nome E por máscara para evitar duplicatas
        // (cobre tanto padrões já cadastrados quanto os exibidos na tela)
        const existingNames = new Set(patterns.map(p => p.name.toLocaleLowerCase()));
        const existingMasks = new Set(patterns.map(p => Number(p.mask)));
        const missing = SUGGEST_PATTERNS.filter(
            p => !existingNames.has(p.name.toLocaleLowerCase()) && !existingMasks.has(p.mask)
        );
        let created = 0;
        for (const p of missing) {
            const maxId = patterns.reduce((max, pp) => Math.max(max, parseInt(pp.pattern_id) || 0), 0) + created;
            try {
                await createAdminPattern({ pattern_id: maxId + 1, name: p.name, mask: p.mask });
                created++;
            } catch {
                continue;
            }
        }
        const skipped = SUGGEST_PATTERNS.length - missing.length + (missing.length - created);
        setSuggestMsg({ created, skipped, total: SUGGEST_PATTERNS.length });
        await load();
        setSuggesting(false);
    };

    useEffect(() => { load(); }, []);

    const existingNames = useMemo(() => new Set(patterns.map(p => p.name.toLocaleLowerCase())), [patterns]);
    const existingMasks = useMemo(() => new Set(patterns.map(p => p.mask)), [patterns]);

    const nameError = name && existingNames.has(name.toLocaleLowerCase().trim())
        ? t('admin.patterns_error_duplicate')
        : null;

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || editMask <= (1 << 12) || nameError) return;
        setSaving(true);
        setError(null);
        try {
            const maxId = patterns.reduce((max, p) => Math.max(max, parseInt(p.pattern_id) || 0), 0);
            const pattern_id = maxId + 1;
            await createAdminPattern({ pattern_id, name: name.trim(), mask: editMask });
            setName('');
            setEditMask(1 << 12);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.patterns_error_create'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (patternId: string) => {
        if (!confirm(t('admin.patterns_confirm_delete', { id: patternId }))) return;
        try {
            await deleteAdminPattern(patternId);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.patterns_error_delete'));
        }
    };

    return (
        <div>
            <p className="text-sm text-[--cb-text-tertiary] mb-6">
                {t('admin.patterns_desc')}
            </p>

            {error && (
                <div className="cb-alert cb-alert-error mb-4" role="alert">
                    <span>⚠️ {error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-sm">✕</button>
                </div>
            )}

            <form onSubmit={handleCreate} className="cb-card p-4 mb-6 flex flex-col gap-4">
                <div className="flex flex-wrap gap-4 items-start">
                    {/* Grid visual */}
                    <div className="flex flex-col gap-2">
                        <span className="text-xs text-[--cb-text-tertiary] font-semibold uppercase tracking-wide">
                            {t('admin.patterns_editor')}
                        </span>
                        <GridEditor mask={editMask} onChange={setEditMask} />
                            <span className="text-xs text-[--cb-text-tertiary] font-mono" data-testid="pattern-bitmask">
                                {t('admin.patterns_mask')}<strong>{editMask}</strong>
                            </span>
                    </div>

                    {/* Campos de texto */}
                    <div className="flex flex-col gap-3 min-w-[200px]">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-[--cb-text-tertiary]">{t('admin.patterns_name')}</label>
                            <input
                                className="cb-input"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder={t('admin.patterns_name_placeholder')}
                                required
                            />
                            {nameError && (
                                <span className="text-xs text-[--cb-danger]">{nameError}</span>
                            )}
                        </div>
                        <button type="submit" className="cb-btn cb-btn-primary self-start" data-testid="pattern-create" disabled={saving || !name || editMask <= (1 << 12) || !!nameError}>
                            {saving ? t('common.saving') : t('admin.patterns_create')}
                        </button>
                    </div>
                </div>
            </form>

            <div className="cb-card p-4 mb-6 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-[--cb-text-tertiary] font-semibold uppercase tracking-wide">
                        {t('admin.patterns_suggest')}
                    </span>
                    {suggestMsg && (
                        <span data-testid="patterns-suggest-result" className={`text-xs ${suggestMsg.created === suggestMsg.total ? 'text-[--cb-success]' : 'text-[--cb-warning]'}`}>
                            {suggestMsg.created === suggestMsg.total
                                ? t('admin.patterns_suggest_done', { created: suggestMsg.created, skipped: suggestMsg.skipped })
                                : t('admin.patterns_suggest_error', { created: suggestMsg.created, total: suggestMsg.total })}
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-[--cb-text-tertiary]">
                    <span>{t('admin.patterns_suggest_basic')} ·</span>
                    <span>{t('admin.patterns_suggest_special')} ·</span>
                    <span>{t('admin.patterns_suggest_master')}</span>
                </div>
                <button
                    type="button"
                    data-testid="patterns-suggest-btn"
                    className="cb-btn cb-btn-outline self-start"
                    disabled={suggesting}
                    onClick={handleSuggest}
                >
                    {suggesting
                        ? <><span className="cb-spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }} /> {t('admin.patterns_suggest_creating')}</>
                        : `✨ ${t('admin.patterns_suggest')}`
                    }
                </button>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-4">
                    <span className="cb-spinner w-4 h-4" /><span>{t('admin.patterns_loading')}</span>
                </div>
            ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))' }}>
                    {patterns.map(p => (
                        <div key={p.pattern_id} className="cb-card p-4 flex flex-col gap-2">
                            <div className="flex items-start justify-between">
                                <div>
                                    <span className="font-bold text-[--cb-text-primary]">{p.name}</span>
                                    <span className="text-xs text-[--cb-text-tertiary] ml-2 font-mono">#{p.pattern_id}</span>
                                </div>
                                {usedPatternIds.has(String(p.pattern_id)) ? (
                                    <span
                                        className="text-xs text-[--cb-text-tertiary] cursor-help select-none"
                                        title={t('admin.patterns_delete_blocked')}
                                    >
                                        🔒 {t('admin.patterns_in_use')}
                                    </span>
                                ) : (
                                    <button
                                        className="text-xs text-[--cb-danger] hover:underline"
                                        onClick={() => handleDelete(p.pattern_id)}
                                    >
                                        {t('admin.patterns_delete')}
                                    </button>
                                )}
                            </div>
                            <pre className="font-mono text-xs leading-tight text-[--cb-text-secondary]">{maskToGridPreview(p.mask)}</pre>
                            <span className="text-xs text-[--cb-text-tertiary] font-mono">mask: {p.mask}</span>
                        </div>
                    ))}
                    {patterns.length === 0 && (
                        <p className="text-[--cb-text-tertiary] text-sm col-span-full">{t('admin.patterns_empty')}</p>
                    )}
                </div>
            )}
        </div>
    );
}
