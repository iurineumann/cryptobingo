// apps/frontend/src/components/admin/NftAdmin.tsx
// Painel de administração de NFTs AtomicAssets.
// Leitura: AtomicAssets REST API (VITE_ATOMIC_API).
// Escrita: session.transact() direto — admin assina com a própria carteira.
//
// Abas: Coleções | Schemas | Templates | Assets

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, TriangleAlert, Check } from 'lucide-react';
import type { Session } from '@wharfkit/session';
import { ATOMIC_API } from '@/config/env';
const COLLECTION    = import.meta.env.VITE_ATOMIC_COLLECTION ?? 'cryptobingo1';
const EXPLORER_URL  = import.meta.env.VITE_EXPLORER_URL      ?? 'https://wax.bloks.io';
const ATOMICHUB_URL = import.meta.env.VITE_ATOMICHUB_URL     ?? 'wax-test.atomichub.io';

// ── Tipos AtomicAssets ────────────────────────────────────────────────────────

interface AtomicCollection {
    collection_name: string;
    author:          string;
    allow_notify:    boolean;
    authorized_accounts: string[];
    data:            Record<string, string>;
    created_at_time: string;
}

interface AtomicSchema {
    schema_name: string;
    format:      Array<{ name: string; type: string }>;
    created_at_time: string;
}

interface AtomicTemplate {
    template_id:      string;
    schema:           { schema_name: string };
    transferable:     boolean;
    burnable:         boolean;
    max_supply:       string;
    issued_supply:    string;
    is_transferable:  boolean;
    is_burnable:      boolean;
    immutable_data:   Record<string, unknown>;
    created_at_time:  string;
}

interface AtomicAsset {
    asset_id:     string;
    owner:        string;
    name:         string;
    template:     { template_id: string; schema: { schema_name: string } } | null;
    data:         Record<string, unknown>;
    burned_at_time: string | null;
    minted_at_time: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function atomicFetch<T>(path: string): Promise<T[]> {
    const res = await fetch(`${ATOMIC_API}${path}`);
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `AtomicAssets API ${res.status}`);
    }
    const json = await res.json() as { success: boolean; data: T[] };
    if (!json.success) throw new Error('AtomicAssets API error');
    return json.data;
}

const SCHEMA_TYPES = ['string', 'image', 'ipfs', 'uint8', 'uint16', 'uint32', 'uint64', 'int8', 'int16', 'int32', 'int64', 'bool', 'float', 'double'];

// ── Componente Principal ──────────────────────────────────────────────────────

interface NftAdminProps {
    session?: Session;
}

export default function NftAdmin({ session }: NftAdminProps) {
    const { t } = useTranslation();
    const [tab, setTab] = useState<'collections' | 'schemas' | 'templates' | 'assets'>('collections');
    const [error,   setError]   = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const actor = session ? String(session.actor) : '';

    const showError = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

    async function transact(actions: object[]) {
        if (!session) { setError(t('admin.nft_no_session')); return false; }
        try {
            const result = await (session as any).transact({ actions }, { broadcast: true });
            const txId = result?.response?.transaction_id ?? result?.transaction_id ?? '';
            setSuccess(`✓ TX: ${txId ? txId.slice(0, 16) + '...' : 'ok'}`);
            return true;
        } catch (e) { showError(e); return false; }
    }

    // ── COLEÇÕES ─────────────────────────────────────────────────────────────

    const [collections, setCollections] = useState<AtomicCollection[]>([]);
    const [showCreateCol, setShowCreateCol] = useState(false);
    const [colForm, setColForm] = useState({ name: '', display_name: '', description: '', img: '', url: '', market_fee: '0.02', auth_account: '' });

    const loadCollections = useCallback(async () => {
        if (!actor) return;
        setLoading(true);
        try {
            const data = await atomicFetch<AtomicCollection>(`/collections?author=${actor}&limit=50`);
            setCollections(data);
        } catch (e) { showError(e); }
        finally { setLoading(false); }
    }, [actor]);

    useEffect(() => { if (tab === 'collections') loadCollections(); }, [tab, loadCollections]);

    async function createCollection() {
        const fee = Math.round(parseFloat(colForm.market_fee) * 10000);
        const ok = await transact([{
            account: 'atomicassets',
            name: 'createcol',
            authorization: [{ actor, permission: 'active' }],
            data: {
                author: actor,
                collection_name: colForm.name,
                allow_notify: true,
                authorized_accounts: [actor],
                notify_accounts: [],
                market_fee: fee / 10000,
                data: [
                    { key: 'name',        value: ['string', colForm.display_name] },
                    { key: 'description', value: ['string', colForm.description]  },
                    { key: 'img',         value: ['string', colForm.img]           },
                    { key: 'url',         value: ['string', colForm.url]           },
                ],
            },
        }]);
        if (ok) { setShowCreateCol(false); loadCollections(); }
    }

    async function authorizeAccount(collectionName: string, account: string) {
        const col = collections.find(c => c.collection_name === collectionName);
        if (!col) return;
        const ok = await transact([{
            account: 'atomicassets',
            name: 'addcolauth',
            authorization: [{ actor, permission: 'active' }],
            data: { collection_name: collectionName, account_to_add: account },
        }]);
        if (ok) loadCollections();
    }

    // ── SCHEMAS ──────────────────────────────────────────────────────────────

    const [schemas, setSchemas] = useState<AtomicSchema[]>([]);
    const [showCreateSchema, setShowCreateSchema] = useState(false);
    const [schemaForm, setSchemaForm] = useState({ name: '', fields: [{ name: '', type: 'string' }] });
    const [extendSchema, setExtendSchema] = useState<string | null>(null);
    const [newFields, setNewFields] = useState([{ name: '', type: 'string' }]);

    const loadSchemas = useCallback(async () => {
        setLoading(true);
        try {
            const data = await atomicFetch<AtomicSchema>(`/schemas?collection_name=${COLLECTION}&limit=100`);
            setSchemas(data);
        } catch (e) { showError(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { if (tab === 'schemas') loadSchemas(); }, [tab, loadSchemas]);

    async function createSchema() {
        const format = schemaForm.fields.filter(f => f.name.trim());
        const ok = await transact([{
            account: 'atomicassets',
            name: 'createschema',
            authorization: [{ actor, permission: 'active' }],
            data: { authorized_creator: actor, collection_name: COLLECTION, schema_name: schemaForm.name, schema_format: format },
        }]);
        if (ok) { setShowCreateSchema(false); loadSchemas(); }
    }

    async function extendSchemaAction(schemaName: string) {
        const fields = newFields.filter(f => f.name.trim());
        if (!fields.length) return;
        const ok = await transact([{
            account: 'atomicassets',
            name: 'extendschema',
            authorization: [{ actor, permission: 'active' }],
            data: { authorized_editor: actor, collection_name: COLLECTION, schema_name: schemaName, schema_format_extension: fields },
        }]);
        if (ok) { setExtendSchema(null); loadSchemas(); }
    }

    // ── TEMPLATES ────────────────────────────────────────────────────────────

    const [templates, setTemplates]     = useState<AtomicTemplate[]>([]);
    const [showCreateTpl, setShowCreateTpl] = useState(false);
    const [tplForm, setTplForm] = useState({ schema: '', transferable: true, burnable: true, max_supply: '0', immutable: [{ key: '', value: '' }] });

    const loadTemplates = useCallback(async () => {
        setLoading(true);
        try {
            const data = await atomicFetch<AtomicTemplate>(`/templates?collection_name=${COLLECTION}&limit=100`);
            setTemplates(data);
        } catch (e) { showError(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { if (tab === 'templates') loadTemplates(); }, [tab, loadTemplates]);

    async function createTemplate() {
        const immutableData = tplForm.immutable
            .filter(f => f.key.trim() && f.value.trim())
            .map(f => ({ key: f.key, value: ['string', f.value] }));
        const ok = await transact([{
            account: 'atomicassets',
            name: 'createtempl',
            authorization: [{ actor, permission: 'active' }],
            data: {
                authorized_creator: actor,
                collection_name: COLLECTION,
                schema_name: tplForm.schema,
                transferable: tplForm.transferable,
                burnable: tplForm.burnable,
                max_supply: parseInt(tplForm.max_supply) || 0,
                immutable_data: immutableData,
            },
        }]);
        if (ok) { setShowCreateTpl(false); loadTemplates(); }
    }

    async function lockTemplate(templateId: string) {
        if (!confirm(t('admin.nft_confirm_lock_template', { id: templateId }))) return;
        const ok = await transact([{
            account: 'atomicassets',
            name: 'locktemplate',
            authorization: [{ actor, permission: 'active' }],
            data: { authorized_editor: actor, collection_name: COLLECTION, template_id: parseInt(templateId) },
        }]);
        if (ok) loadTemplates();
    }

    // ── ASSETS ───────────────────────────────────────────────────────────────

    const [assets, setAssets]       = useState<AtomicAsset[]>([]);
    const [showMint, setShowMint]   = useState(false);
    const [mintForm, setMintForm]   = useState({ template_id: '', owner: actor, memo: '' });
    const [selected, setSelected]   = useState<Set<string>>(new Set());
    const [transferTo, setTransferTo] = useState('');

    const loadAssets = useCallback(async () => {
        setLoading(true);
        try {
            const data = await atomicFetch<AtomicAsset>(`/assets?collection_name=${COLLECTION}&limit=100`);
            setAssets(data);
        } catch (e) { showError(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { if (tab === 'assets') loadAssets(); }, [tab, loadAssets]);

    async function mintAsset() {
        const ok = await transact([{
            account: 'atomicassets',
            name: 'mintasset',
            authorization: [{ actor, permission: 'active' }],
            data: {
                authorized_minter: actor,
                collection_name: COLLECTION,
                schema_name: templates.find(t => t.template_id === mintForm.template_id)?.schema.schema_name ?? '',
                template_id: parseInt(mintForm.template_id),
                new_asset_owner: mintForm.owner,
                immutable_data: [],
                mutable_data: [],
                tokens_to_back: [],
            },
        }]);
        if (ok) { setShowMint(false); loadAssets(); }
    }

    async function burnAsset(assetId: string) {
        if (!confirm(t('admin.nft_confirm_burn', { id: assetId }))) return;
        const ok = await transact([{
            account: 'atomicassets',
            name: 'burnasset',
            authorization: [{ actor, permission: 'active' }],
            data: { asset_owner: actor, asset_id: assetId },
        }]);
        if (ok) loadAssets();
    }

    async function transferAssets() {
        if (!transferTo || !selected.size) return;
        const ok = await transact([{
            account: 'atomicassets',
            name: 'transfer',
            authorization: [{ actor, permission: 'active' }],
            data: { from: actor, to: transferTo, asset_ids: [...selected], memo: '' },
        }]);
        if (ok) { setSelected(new Set()); setTransferTo(''); loadAssets(); }
    }

    // ── Renderização ──────────────────────────────────────────────────────────

    const TABS = [
        { id: 'collections', label: t('admin.nft_tab_collections') },
        { id: 'schemas',     label: t('admin.nft_tab_schemas') },
        { id: 'templates',   label: t('admin.nft_tab_templates') },
        { id: 'assets',      label: t('admin.nft_tab_assets') },
    ] as const;

    return (
        <div>
            <div className="flex items-baseline justify-between mb-1 gap-4">
                <div>
                    <p className="text-sm text-[--cb-text-tertiary]">
                        {t('admin.nft_desc')} · {t('admin.nft_collection_label')}: <span className="font-mono text-[--cb-brand]">{COLLECTION}</span>
                    </p>
                </div>
                <a href={`https://${ATOMICHUB_URL}/explorer/collection/wax-testnet/${COLLECTION}`} target="_blank" rel="noreferrer"
                   className="cb-btn cb-btn-ghost cb-btn-sm text-xs" style={{ whiteSpace: 'nowrap' }}>
                    ↗ AtomicHub
                </a>
            </div>

            {!session && (
                <div className="cb-alert cb-alert-error mb-4"><TriangleAlert className="size-4 shrink-0" /> {t('admin.nft_no_session')}</div>
            )}
            {error && (
                <div className="cb-alert cb-alert-error mb-4 flex items-center gap-2">
                    <span><TriangleAlert className="size-4 shrink-0" /> {error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-sm"><X className="size-4 shrink-0" /></button>
                </div>
            )}
            {success && (
                <div className="cb-alert cb-alert-success mb-4 flex items-center gap-2">
                    <span>{success}</span>
                    <button onClick={() => setSuccess(null)} className="ml-auto text-sm"><X className="size-4 shrink-0" /></button>
                </div>
            )}

            {/* ── Tab bar ── */}
            <div className="flex gap-2 mb-6 flex-wrap">
                {TABS.map(tb => (
                    <button key={tb.id}
                        data-testid={`nft-tab-${tb.id}`}
                        className={`cb-btn cb-btn-sm ${tab === tb.id ? 'cb-btn-primary' : 'cb-btn-outline'}`}
                        onClick={() => { setTab(tb.id); setError(null); setSuccess(null); }}>
                        {tb.label}
                    </button>
                ))}
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-4">
                    <span className="cb-spinner w-4 h-4" /><span>{t('common.loading')}</span>
                </div>
            )}

            {/* ══════════ COLEÇÕES ══════════ */}
            {!loading && tab === 'collections' && (
                <div>
                    <div className="flex justify-between mb-4">
                        <span className="text-sm text-[--cb-text-tertiary]">{error ? '—' : collections.length} {t('admin.nft_collections_found')}</span>
                        <button className="cb-btn cb-btn-primary cb-btn-sm" onClick={() => setShowCreateCol(v => !v)}>
                            {showCreateCol ? t('common.cancel') : `+ ${t('admin.nft_create_collection')}`}
                        </button>
                    </div>

                    {showCreateCol && (
                        <div className="cb-card p-4 mb-5" style={{ maxWidth: '36rem' }}>
                            <h3 className="font-bold mb-3">{t('admin.nft_create_collection')}</h3>
                            <div className="grid gap-3">
                                {[
                                    { field: 'name',         label: t('admin.nft_col_name'),        ph: 'mycollection' },
                                    { field: 'display_name', label: t('admin.nft_col_display'),     ph: 'My Collection' },
                                    { field: 'description',  label: t('admin.nft_col_description'), ph: '' },
                                    { field: 'img',          label: t('admin.nft_col_img'),         ph: 'QmXXX... (IPFS hash)' },
                                    { field: 'url',          label: t('admin.nft_col_url'),         ph: 'https://...' },
                                ].map(({ field, label, ph }) => (
                                    <label key={field} className="flex flex-col gap-1">
                                        <span className="text-xs text-[--cb-text-tertiary]">{label}</span>
                                        <input className="cb-input" placeholder={ph}
                                            value={(colForm as any)[field]}
                                            onChange={e => setColForm(f => ({ ...f, [field]: e.target.value }))} />
                                    </label>
                                ))}
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-[--cb-text-tertiary]">{t('admin.nft_col_market_fee')} (0–15%)</span>
                                    <input className="cb-input" type="number" min="0" max="0.15" step="0.01"
                                        value={colForm.market_fee}
                                        onChange={e => setColForm(f => ({ ...f, market_fee: e.target.value }))} />
                                </label>
                                <button className="cb-btn cb-btn-primary" onClick={createCollection}>{t('common.save')}</button>
                            </div>
                        </div>
                    )}

                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(26rem, 1fr))' }}>
                        {collections.map(col => (
                            <div key={col.collection_name} className="cb-card p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <span className="font-bold font-mono text-[--cb-brand]">{col.collection_name}</span>
                                        {col.data?.name && <p className="text-sm text-[--cb-text-secondary] mt-0.5">{String(col.data.name)}</p>}
                                    </div>
                                    <a href={`https://${ATOMICHUB_URL}/explorer/collection/wax-testnet/${col.collection_name}`} target="_blank" rel="noreferrer"
                                       className="text-xs text-[--cb-text-tertiary] hover:text-[--cb-brand]">↗ Hub</a>
                                </div>
                                <div className="mt-3 text-xs text-[--cb-text-tertiary] space-y-1">
                                    <p>{t('admin.nft_authorized')}: {col.authorized_accounts.join(', ') || '—'}</p>
                                </div>
                                <div className="mt-3 flex gap-2 items-center">
                                    <input className="cb-input flex-1" placeholder={t('admin.nft_add_auth_account')}
                                        value={colForm.auth_account}
                                        onChange={e => setColForm(f => ({ ...f, auth_account: e.target.value }))} />
                                    <button className="cb-btn cb-btn-outline cb-btn-sm"
                                        onClick={() => authorizeAccount(col.collection_name, colForm.auth_account)}>
                                        {t('admin.nft_authorize')}
                                    </button>
                                </div>
                            </div>
                        ))}
                        {collections.length === 0 && !loading && !error && (
                            <p className="text-[--cb-text-tertiary] text-sm col-span-full">{t('admin.nft_no_collections')}</p>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════ SCHEMAS ══════════ */}
            {!loading && tab === 'schemas' && (
                <div>
                    <div className="flex justify-between mb-4">
                        <span className="text-sm text-[--cb-text-tertiary]">{error ? '—' : schemas.length} schemas · {COLLECTION}</span>
                        <button className="cb-btn cb-btn-primary cb-btn-sm" onClick={() => setShowCreateSchema(v => !v)}>
                            {showCreateSchema ? t('common.cancel') : `+ ${t('admin.nft_create_schema')}`}
                        </button>
                    </div>

                    {showCreateSchema && (
                        <div className="cb-card p-4 mb-5" style={{ maxWidth: '36rem' }}>
                            <h3 className="font-bold mb-3">{t('admin.nft_create_schema')}</h3>
                            <div className="grid gap-3">
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-[--cb-text-tertiary]">{t('admin.nft_schema_name')}</span>
                                    <input className="cb-input" placeholder="cards" value={schemaForm.name}
                                        onChange={e => setSchemaForm(f => ({ ...f, name: e.target.value }))} />
                                </label>
                                <div>
                                    <p className="text-xs text-[--cb-text-tertiary] mb-2">{t('admin.nft_schema_fields')}</p>
                                    {schemaForm.fields.map((field, i) => (
                                        <div key={i} className="flex gap-2 mb-2">
                                            <input className="cb-input flex-1" placeholder="name" value={field.name}
                                                onChange={e => setSchemaForm(f => {
                                                    const fields = [...f.fields];
                                                    fields[i] = { ...fields[i], name: e.target.value };
                                                    return { ...f, fields };
                                                })} />
                                            <select className="cb-input cb-select" value={field.type}
                                                onChange={e => setSchemaForm(f => {
                                                    const fields = [...f.fields];
                                                    fields[i] = { ...fields[i], type: e.target.value };
                                                    return { ...f, fields };
                                                })}>
                                                {SCHEMA_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
                                            </select>
                                            {schemaForm.fields.length > 1 && (
                                                <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={() =>
                                                    setSchemaForm(f => ({ ...f, fields: f.fields.filter((_, j) => j !== i) }))}><X className="size-4 shrink-0" /></button>
                                            )}
                                        </div>
                                    ))}
                                    <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={() =>
                                        setSchemaForm(f => ({ ...f, fields: [...f.fields, { name: '', type: 'string' }] }))}>
                                        + {t('admin.nft_add_field')}
                                    </button>
                                </div>
                                <button className="cb-btn cb-btn-primary" onClick={createSchema}>{t('common.save')}</button>
                            </div>
                        </div>
                    )}

                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(26rem, 1fr))' }}>
                        {schemas.map(sc => (
                            <div key={sc.schema_name} className="cb-card p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="font-bold font-mono text-[--cb-brand]">{sc.schema_name}</span>
                                    <button className="cb-btn cb-btn-outline cb-btn-sm"
                                        onClick={() => { setExtendSchema(sc.schema_name); setNewFields([{ name: '', type: 'string' }]); }}>
                                        + {t('admin.nft_extend_schema')}
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {sc.format.map(f => (
                                        <span key={f.name} className="cb-badge text-xs cb-badge-neutral">
                                            {f.name}: <span className="text-[--cb-text-tertiary]">{f.type}</span>
                                        </span>
                                    ))}
                                </div>
                                {extendSchema === sc.schema_name && (
                                    <div className="mt-3 border-t border-[--cb-border-subtle] pt-3">
                                        <p className="text-xs text-[--cb-text-tertiary] mb-2">{t('admin.nft_new_fields')}</p>
                                        {newFields.map((field, i) => (
                                            <div key={i} className="flex gap-2 mb-2">
                                                <input className="cb-input flex-1" placeholder="new_field" value={field.name}
                                                    onChange={e => setNewFields(fs => { const n = [...fs]; n[i] = { ...n[i], name: e.target.value }; return n; })} />
                                                <select className="cb-input cb-select" value={field.type}
                                                    onChange={e => setNewFields(fs => { const n = [...fs]; n[i] = { ...n[i], type: e.target.value }; return n; })}>
                                                    {SCHEMA_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
                                                </select>
                                            </div>
                                        ))}
                                        <div className="flex gap-2">
                                            <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={() => setNewFields(fs => [...fs, { name: '', type: 'string' }])}>+</button>
                                            <button className="cb-btn cb-btn-primary cb-btn-sm" onClick={() => extendSchemaAction(sc.schema_name)}>{t('common.save')}</button>
                                            <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={() => setExtendSchema(null)}>{t('common.cancel')}</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                        {schemas.length === 0 && !loading && !error && (
                            <p className="text-[--cb-text-tertiary] text-sm col-span-full">{t('admin.nft_no_schemas')}</p>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════ TEMPLATES ══════════ */}
            {!loading && tab === 'templates' && (
                <div>
                    <div className="flex justify-between mb-4">
                        <span className="text-sm text-[--cb-text-tertiary]">{error ? '—' : templates.length} templates · {COLLECTION}</span>
                        <button className="cb-btn cb-btn-primary cb-btn-sm" onClick={() => setShowCreateTpl(v => !v)}>
                            {showCreateTpl ? t('common.cancel') : `+ ${t('admin.nft_create_template')}`}
                        </button>
                    </div>

                    {showCreateTpl && (
                        <div className="cb-card p-4 mb-5" style={{ maxWidth: '40rem' }}>
                            <h3 className="font-bold mb-3">{t('admin.nft_create_template')}</h3>
                            <div className="grid gap-3">
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-[--cb-text-tertiary]">{t('admin.nft_schema_name')}</span>
                                    <select className="cb-input cb-select" value={tplForm.schema}
                                        onChange={e => setTplForm(f => ({ ...f, schema: e.target.value }))}>
                                        <option value="">{t('admin.nft_select_schema')}</option>
                                        {schemas.map(s => <option key={s.schema_name} value={s.schema_name}>{s.schema_name}</option>)}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-[--cb-text-tertiary]">{t('admin.nft_max_supply')} (0 = {t('admin.nft_unlimited')})</span>
                                    <input className="cb-input" type="number" min="0" value={tplForm.max_supply}
                                        onChange={e => setTplForm(f => ({ ...f, max_supply: e.target.value }))} />
                                </label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={tplForm.transferable}
                                            onChange={e => setTplForm(f => ({ ...f, transferable: e.target.checked }))} />
                                        <span className="text-sm">{t('admin.nft_transferable')}</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={tplForm.burnable}
                                            onChange={e => setTplForm(f => ({ ...f, burnable: e.target.checked }))} />
                                        <span className="text-sm">{t('admin.nft_burnable')}</span>
                                    </label>
                                </div>
                                <div>
                                    <p className="text-xs text-[--cb-text-tertiary] mb-2">{t('admin.nft_immutable_data')}</p>
                                    {tplForm.immutable.map((row, i) => (
                                        <div key={i} className="flex gap-2 mb-2">
                                            <input className="cb-input flex-1" placeholder="key" value={row.key}
                                                onChange={e => setTplForm(f => { const im = [...f.immutable]; im[i] = { ...im[i], key: e.target.value }; return { ...f, immutable: im }; })} />
                                            <input className="cb-input flex-1" placeholder="value" value={row.value}
                                                onChange={e => setTplForm(f => { const im = [...f.immutable]; im[i] = { ...im[i], value: e.target.value }; return { ...f, immutable: im }; })} />
                                        </div>
                                    ))}
                                    <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={() =>
                                        setTplForm(f => ({ ...f, immutable: [...f.immutable, { key: '', value: '' }] }))}>
                                        + {t('admin.nft_add_field')}
                                    </button>
                                </div>
                                <button className="cb-btn cb-btn-primary" onClick={createTemplate}>{t('common.save')}</button>
                            </div>
                        </div>
                    )}

                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(24rem, 1fr))' }}>
                        {templates.map(tpl => (
                            <div key={tpl.template_id} data-testid={`nft-row-${tpl.template_id}`} className="cb-card p-4">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <span className="font-bold">#{tpl.template_id}</span>
                                        <span className="text-xs text-[--cb-text-tertiary] ml-2">{tpl.schema.schema_name}</span>
                                    </div>
                                    <div className="flex gap-1.5">
                                        {tpl.transferable && <span className="cb-badge cb-badge-success text-xs">transfer</span>}
                                        {tpl.burnable && <span className="cb-badge cb-badge-neutral text-xs">burn</span>}
                                    </div>
                                </div>
                                <div className="text-xs text-[--cb-text-tertiary] mb-3">
                                    {t('admin.nft_supply')}: {tpl.issued_supply}/{tpl.max_supply === '0' ? '∞' : tpl.max_supply}
                                </div>
                                {Object.keys(tpl.immutable_data).length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-3">
                                        {Object.entries(tpl.immutable_data).map(([k, v]) => (
                                            <span key={k} className="text-xs bg-[--cb-bg-surface] px-1.5 py-0.5 rounded font-mono">
                                                {k}: {String(v).slice(0, 20)}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <button className="cb-btn cb-btn-danger cb-btn-sm text-xs"
                                    onClick={() => lockTemplate(tpl.template_id)}>
                                    {t('admin.nft_lock_template')}
                                </button>
                            </div>
                        ))}
                        {templates.length === 0 && !loading && !error && (
                            <p className="text-[--cb-text-tertiary] text-sm col-span-full">{t('admin.nft_no_templates')}</p>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════ ASSETS ══════════ */}
            {!loading && tab === 'assets' && (
                <div>
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <span className="text-sm text-[--cb-text-tertiary]">{error ? '—' : assets.length} assets · {COLLECTION}</span>
                        <div className="flex gap-2">
                            {selected.size > 0 && (
                                <>
                                    <input className="cb-input" placeholder={t('admin.nft_transfer_to')} style={{ width: '12rem' }}
                                        value={transferTo} onChange={e => setTransferTo(e.target.value)} />
                                    <button className="cb-btn cb-btn-primary cb-btn-sm" onClick={transferAssets}>
                                        ↗ {t('admin.nft_transfer')} ({selected.size})
                                    </button>
                                </>
                            )}
                            <button className="cb-btn cb-btn-primary cb-btn-sm" onClick={() => setShowMint(v => !v)}>
                                {showMint ? t('common.cancel') : `+ ${t('admin.nft_mint')}`}
                            </button>
                        </div>
                    </div>

                    {showMint && (
                        <div className="cb-card p-4 mb-5" style={{ maxWidth: '32rem' }}>
                            <h3 className="font-bold mb-3">{t('admin.nft_mint')}</h3>
                            <div className="grid gap-3">
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-[--cb-text-tertiary]">{t('admin.nft_template_id')}</span>
                                    <select className="cb-input cb-select" value={mintForm.template_id}
                                        onChange={e => setMintForm(f => ({ ...f, template_id: e.target.value }))}>
                                        <option value="">{t('admin.nft_select_template')}</option>
                                        {templates.map(tpl => (
                                            <option key={tpl.template_id} value={tpl.template_id}>
                                                #{tpl.template_id} — {tpl.schema.schema_name}
                                                {tpl.immutable_data?.name ? ` (${tpl.immutable_data.name})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-[--cb-text-tertiary]">{t('admin.nft_mint_owner')}</span>
                                    <input className="cb-input" placeholder={actor} value={mintForm.owner}
                                        onChange={e => setMintForm(f => ({ ...f, owner: e.target.value }))} />
                                </label>
                                <button className="cb-btn cb-btn-primary" onClick={mintAsset}>{t('admin.nft_mint')}</button>
                            </div>
                        </div>
                    )}

                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(20rem, 1fr))' }}>
                        {assets.map(asset => (
                            <div key={asset.asset_id}
                                className={`cb-card p-3 cursor-pointer transition-all ${selected.has(asset.asset_id) ? 'ring-2 ring-[--cb-brand]' : ''}`}
                                onClick={() => setSelected(s => {
                                    const n = new Set(s);
                                    n.has(asset.asset_id) ? n.delete(asset.asset_id) : n.add(asset.asset_id);
                                    return n;
                                })}>
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <span className="font-mono text-xs text-[--cb-brand]">#{asset.asset_id}</span>
                                        <p className="text-sm font-medium">{asset.name || `Asset #${asset.asset_id}`}</p>
                                        <p className="text-xs text-[--cb-text-tertiary]">{t('admin.nft_owner')}: {asset.owner}</p>
                                        {asset.template && (
                                            <p className="text-xs text-[--cb-text-tertiary]">
                                                {t('admin.nft_template_id')}: #{asset.template.template_id}
                                                {' · '}{asset.template.schema.schema_name}
                                            </p>
                                        )}
                                    </div>
                                    <button className="cb-btn cb-btn-danger cb-btn-sm text-xs shrink-0"
                                        onClick={e => { e.stopPropagation(); burnAsset(asset.asset_id); }}>
                                        {t('admin.nft_burn')}
                                    </button>
                                </div>
                            </div>
                        ))}
                        {assets.length === 0 && !loading && !error && (
                            <p className="text-[--cb-text-tertiary] text-sm col-span-full">{t('admin.nft_no_assets')}</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
