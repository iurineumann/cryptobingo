// apps/frontend/src/components/admin/ContentAdmin.tsx
// CRUD de conteúdo unificado por type. Ref: ADR-037.

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pen, Plus, Trash2, X, Check, Globe, ArrowUpDown, FileText } from 'lucide-react';
import { useCreateBlockNote, BlockNoteViewRaw } from '@blocknote/react';
import '@blocknote/react/style.css';
import {
    fetchContentByType, fetchContentItem,
    createContentItem, updateContentItem, deleteContentItem,
} from '../../services/api';
import type { ContentItem } from '@cryptobingo/shared-types';

const CONTENT_TYPES = ['faq', 'howitworks', 'sponsors', 'tutorials', 'news'] as const;
const BLOCK_TYPES = ['howitworks', 'sponsors', 'tutorials', 'news'] as const;

function isBlockType(t: string): boolean {
    return (BLOCK_TYPES as readonly string[]).includes(t);
}

export default function ContentAdmin() {
    const { t } = useTranslation();

    const [activeType, setActiveType] = useState<string>('faq');
    const [items, setItems] = useState<ContentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<ReactNode | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

    // Form fields
    const [formTitle, setFormTitle] = useState('');
    const [formContent, setFormContent] = useState<string | unknown[]>('');
    const [formImageUrl, setFormImageUrl] = useState('');
    const [formSortOrder, setFormSortOrder] = useState(0);
    const [formPinned, setFormPinned] = useState(false);
    const [formMetaQuestion, setFormMetaQuestion] = useState('');

    // Translation review
    const [showTranslate, setShowTranslate] = useState(false);
    const [translateItem, setTranslateItem] = useState<ContentItem | null>(null);
    const [translateLocale, setTranslateLocale] = useState<'en-US' | 'zh-CN' | null>(null);

    const showToast = (kind: 'success' | 'error', msg: string) => {
        setToast({ kind, msg });
        setTimeout(() => setToast(null), 3000);
    };

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchContentByType(activeType as any);
            setItems(res.items);
        } catch {
            setError(t('admin.content_error_load'));
        } finally {
            setLoading(false);
        }
    }, [activeType, t]);

    useEffect(() => { load(); }, [load]);

    const resetForm = () => {
        setFormTitle('');
        setFormContent('');
        setFormImageUrl('');
        setFormSortOrder(0);
        setFormPinned(false);
        setFormMetaQuestion('');
    };

    const startCreate = () => {
        resetForm();
        setEditingId(null);
        setShowCreate(true);
    };

    const startEdit = async (id: string) => {
        setSaving(true);
        try {
            const item = await fetchContentItem(activeType as any, id);
            setFormTitle(item.title);
            setFormContent(item.content);
            setFormImageUrl(item.image_url ?? '');
            setFormSortOrder(item.sort_order);
            setFormPinned(item.pinned);
            setFormMetaQuestion(item.metadata?.question as string ?? '');
            setEditingId(id);
            setShowCreate(true);
        } catch {
            showToast('error', t('admin.content_error_load'));
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formTitle.trim() || !formContent) {
            showToast('error', t('admin.content_error_create'));
            return;
        }

        setSaving(true);
        try {
            const contentFormat = isBlockType(activeType) ? 'blocks' : 'text';
            const payload: any = {
                title: formTitle.trim(),
                content: formContent,
                content_format: contentFormat,
                image_url: formImageUrl || null,
                pinned: formPinned,
                sort_order: formSortOrder,
                metadata: activeType === 'faq' && formMetaQuestion ? { question: formMetaQuestion } : null,
            };

            if (editingId) {
                await updateContentItem(activeType as any, editingId, payload);
                showToast('success', t('admin.content_success_update'));
            } else {
                await createContentItem(activeType as any, payload);
                showToast('success', t('admin.content_success_create'));
            }
            setShowCreate(false);
            resetForm();
            load();
        } catch {
            showToast('error', editingId ? t('admin.content_error_update') : t('admin.content_error_create'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t('admin.content_confirm_delete'))) return;
        try {
            await deleteContentItem(activeType as any, id);
            showToast('success', t('admin.content_success_delete'));
            load();
        } catch {
            showToast('error', t('admin.content_error_delete'));
        }
    };

    const openTranslate = (item: ContentItem) => {
        setTranslateItem(item);
        setTranslateLocale(null);
        setShowTranslate(true);
    };

    const submitLabel = editingId ? t('common.save') : t('admin.content_create');

    return (
        <div className="cb-card p-4" data-testid="content-admin">
            {/* Toast */}
            {toast && (
                <div className={`cb-alert mb-4 ${toast.kind === 'error' ? 'cb-alert-error' : 'cb-alert-success'}`}>
                    <span>{toast.msg}</span>
                    <button onClick={() => setToast(null)} className="ml-auto"><X className="size-4" /></button>
                </div>
            )}

            {/* Type tabs */}
            <div className="flex gap-2 mb-4 flex-wrap" data-testid="content-admin-tabs">
                {CONTENT_TYPES.map(ct => (
                    <button
                        key={ct}
                        data-testid={`content-admin-tab-${ct}`}
                        className={`cb-btn cb-btn-sm ${ct === activeType ? 'cb-btn-primary' : 'cb-btn-ghost'}`}
                        onClick={() => { setActiveType(ct); setShowCreate(false); resetForm(); }}
                    >
                        {t(`admin.content_type_${ct}`)}
                    </button>
                ))}
            </div>

            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">{t(`admin.content_type_${activeType}`)}</h2>
                <button
                    data-testid="content-admin-new"
                    className="cb-btn cb-btn-primary cb-btn-sm"
                    onClick={startCreate}
                >
                    <Plus className="size-4" /> {t('admin.content_new')}
                </button>
            </div>

            {/* Create/Edit form */}
            {showCreate && (
                <form onSubmit={handleSave} className="cb-card p-4 mb-4" data-testid="content-admin-form">
                    <div className="grid gap-3">
                        <div>
                            <label className="cb-label">{t('admin.content_field_title')}</label>
                            <input
                                className="cb-input w-full"
                                value={formTitle}
                                onChange={e => setFormTitle(e.target.value)}
                                data-testid="content-admin-field-title"
                                required
                            />
                        </div>
                        {activeType === 'faq' && (
                            <div>
                                <label className="cb-label">{t('faq.question')}</label>
                                <input
                                    className="cb-input w-full"
                                    value={formMetaQuestion}
                                    onChange={e => setFormMetaQuestion(e.target.value)}
                                    data-testid="content-admin-field-question"
                                />
                            </div>
                        )}
                        <div>
                            <label className="cb-label">{t('admin.content_field_content')}</label>
                            {isBlockType(activeType) ? (
                                <div className="border rounded p-2 min-h-[200px] bg-[--cb-surface]">
                                    <BlockNoteEditorPreview
                                        initialContent={typeof formContent === 'string' ? [] : formContent}
                                        onChange={doc => setFormContent(doc)}
                                    />
                                </div>
                            ) : (
                                <textarea
                                    className="cb-input w-full min-h-[120px]"
                                    value={typeof formContent === 'string' ? formContent : ''}
                                    onChange={e => setFormContent(e.target.value)}
                                    data-testid="content-admin-field-content"
                                    required={!isBlockType(activeType)}
                                />
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="cb-label">{t('admin.content_field_image_url')}</label>
                                <input
                                    className="cb-input w-full"
                                    value={formImageUrl}
                                    onChange={e => setFormImageUrl(e.target.value)}
                                    data-testid="content-admin-field-image"
                                />
                            </div>
                            <div>
                                <label className="cb-label">{t('admin.content_field_sort_order')}</label>
                                <input
                                    type="number"
                                    className="cb-input w-full"
                                    value={formSortOrder}
                                    onChange={e => setFormSortOrder(Number(e.target.value))}
                                    data-testid="content-admin-field-sort"
                                />
                            </div>
                        </div>
                        <label className="flex items-center gap-2 cb-label cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formPinned}
                                onChange={e => setFormPinned(e.target.checked)}
                                data-testid="content-admin-field-pinned"
                            />
                            {t('admin.content_field_pinned')}
                        </label>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button type="submit" className="cb-btn cb-btn-primary cb-btn-sm" disabled={saving}>
                            {saving ? t('admin.content_saving') : submitLabel}
                        </button>
                        <button type="button" className="cb-btn cb-btn-ghost cb-btn-sm" onClick={() => { setShowCreate(false); resetForm(); }}>
                            {t('common.cancel')}
                        </button>
                    </div>
                </form>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-4" data-testid="content-admin-loading">
                    <span className="cb-spinner w-4 h-4" /> <span>{t('common.loading')}</span>
                </div>
            )}

            {/* Error */}
            {error && !loading && (
                <div className="cb-alert cb-alert-error mb-4" data-testid="content-admin-error">
                    <span><FileText className="size-4 shrink-0" /> {error}</span>
                </div>
            )}

            {/* Empty */}
            {!loading && !error && items.length === 0 && !showCreate && (
                <p className="text-[--cb-text-tertiary] py-8 text-center" data-testid="content-admin-empty">
                    {t('admin.content_empty')}
                </p>
            )}

            {/* List */}
            {!loading && !error && items.length > 0 && (
                <div className="grid gap-2" data-testid="content-admin-list">
                    {items.map((item, idx) => (
                        <div
                            key={item.id}
                            className="cb-card p-3 flex items-center justify-between"
                            data-testid={`content-admin-item-${idx}`}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                {item.pinned && <ArrowUpDown className="size-4 shrink-0 text-[--cb-accent]" />}
                                <div className="min-w-0">
                                    <p className="font-medium truncate">{item.title}</p>
                                    <p className="text-xs text-[--cb-text-tertiary]">
                                        #{item.sort_order}
                                        {item.published_at && ` · ${new Date(item.published_at).toLocaleDateString()}`}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {item.locale_overrides && (item.locale_overrides['en-US'] || item.locale_overrides['zh-CN']) && (
                                    <button
                                        className="cb-btn cb-btn-ghost cb-btn-xs"
                                        onClick={() => openTranslate(item)}
                                        data-testid={`content-admin-translate-${idx}`}
                                        title={t('admin.content_translate')}
                                    >
                                        <Globe className="size-4" />
                                    </button>
                                )}
                                <button
                                    className="cb-btn cb-btn-ghost cb-btn-xs"
                                    onClick={() => startEdit(item.id)}
                                    data-testid={`content-admin-edit-${idx}`}
                                >
                                    <Pen className="size-4" />
                                </button>
                                <button
                                    className="cb-btn cb-btn-ghost cb-btn-xs text-[--cb-danger]"
                                    onClick={() => handleDelete(item.id)}
                                    data-testid={`content-admin-delete-${idx}`}
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Translation review modal */}
            {showTranslate && translateItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="content-admin-translate-modal">
                    <div className="cb-card p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold">{t('admin.content_translate_review')}</h3>
                            <button onClick={() => setShowTranslate(false)}><X className="size-4" /></button>
                        </div>
                        <div className="grid gap-4">
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    className={`cb-btn cb-btn-sm ${translateLocale === 'en-US' ? 'cb-btn-primary' : 'cb-btn-ghost'}`}
                                    onClick={() => setTranslateLocale('en-US')}
                                >
                                    {t('admin.content_translate_en')}
                                </button>
                                <button
                                    className={`cb-btn cb-btn-sm ${translateLocale === 'zh-CN' ? 'cb-btn-primary' : 'cb-btn-ghost'}`}
                                    onClick={() => setTranslateLocale('zh-CN')}
                                >
                                    {t('admin.content_translate_zh')}
                                </button>
                            </div>
                            {translateLocale && translateItem.locale_overrides?.[translateLocale] && (
                                <div className="grid gap-3">
                                    <div>
                                        <label className="cb-label">{t('admin.content_translate_original')}</label>
                                        <p className="text-sm p-2 bg-[--cb-surface] rounded">{translateItem.title}</p>
                                    </div>
                                    <div>
                                        <label className="cb-label">{t('admin.content_translate')}</label>
                                        <p className="text-sm p-2 bg-[--cb-surface] rounded border-l-2 border-[--cb-accent]">
                                            {translateItem.locale_overrides[translateLocale]?.title}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 mt-4">
                            <button className="cb-btn cb-btn-primary cb-btn-sm">
                                <Check className="size-4" /> {t('admin.content_translate_accept')}
                            </button>
                            <button className="cb-btn cb-btn-ghost cb-btn-sm">
                                {t('admin.content_translate_regenerate')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// BlockNote editor wrapper for controlled usage
function BlockNoteEditorPreview({
    initialContent,
    onChange,
}: Readonly<{
    initialContent: unknown[];
    onChange: (doc: unknown[]) => void;
}>) {
    const editor = useCreateBlockNote({
        initialContent: initialContent.length > 0 ? initialContent as any : undefined,
    });

    const handleChange = () => {
        if (editor) {
            onChange(editor.document as unknown[]);
        }
    };

    return (
        <BlockNoteViewRaw editor={editor} onChange={handleChange} />
    );
}
