import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Save } from 'lucide-react';
import type { MongoUserProfile } from '@cryptobingo/shared-types';
import { updateUserPreferences } from '../services/api';
import { RPC_PRESETS, setSelectedRpcUrl, getSelectedRpcUrl } from '../utils/rpcStore';
import { EXPLORER_PRESETS, setSelectedExplorerUrl, getSelectedExplorerUrl } from '../utils/explorerStore';

interface Props {
    readonly profile:  MongoUserProfile;
    readonly onPreferencesUpdated: () => void;
}

export default function UserSettingsPage({ profile, onPreferencesUpdated }: Props) {
    const { t } = useTranslation();

    const [rpcUrl, setRpcUrl]           = useState(getSelectedRpcUrl() || profile.preferences.rpc_url || RPC_PRESETS[0].url);
    const [explorerUrl, setExplorerUrl] = useState(getSelectedExplorerUrl() || profile.preferences.explorer_url || EXPLORER_PRESETS[0].url);
    const [soundEnabled, setSoundEnabled] = useState(profile.preferences.sound_enabled);
    const [saving, setSaving]           = useState(false);
    const [message, setMessage]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
    const [customRpc, setCustomRpc]     = useState('');
    const [customExplorer, setCustomExplorer] = useState('');

    useEffect(() => {
        setRpcUrl(getSelectedRpcUrl() || profile.preferences.rpc_url || RPC_PRESETS[0].url);
        setExplorerUrl(getSelectedExplorerUrl() || profile.preferences.explorer_url || EXPLORER_PRESETS[0].url);
        setSoundEnabled(profile.preferences.sound_enabled);
    }, [profile]);

    function handleRpcSelect(url: string) {
        setRpcUrl(url);
        setCustomRpc('');
        setSelectedRpcUrl(url);
    }

    function handleExplorerSelect(url: string) {
        setExplorerUrl(url);
        setCustomExplorer('');
        setSelectedExplorerUrl(url);
    }

    function handleCustomRpc() {
        const url = customRpc.trim();
        if (!url) return;
        setRpcUrl(url);
        setSelectedRpcUrl(url);
    }

    function handleCustomExplorer() {
        const url = customExplorer.trim();
        if (!url) return;
        setExplorerUrl(url);
        setSelectedExplorerUrl(url);
    }

    async function handleSave() {
        setSaving(true);
        setMessage(null);
        try {
            await updateUserPreferences({
                rpc_url: rpcUrl,
                explorer_url: explorerUrl,
                sound_enabled: soundEnabled,
            });
            setMessage({ type: 'ok', text: t('settings.saved') ?? 'Preferências salvas!' });
            onPreferencesUpdated();
        } catch (err) {
            console.error('[UserSettings] Erro ao salvar preferências:', err);
            setMessage({ type: 'err', text: t('settings.save_error') ?? 'Erro ao salvar preferências.' });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="settings-page" data-testid="settings-page">
            <h1 className="settings-title">{t('settings.title') ?? 'Configurações'}</h1>

            {/* RPC URL */}
            <section className="settings-section" data-testid="settings-rpc">
                <h2 className="settings-section-title">{t('settings.rpc_title') ?? 'Nó RPC da WAX'}</h2>
                <p className="settings-section-desc">{t('settings.rpc_desc') ?? 'Selecione o nó RPC para conectar à rede WAX.'}</p>
                <div className="settings-presets">
                    {RPC_PRESETS.map(p => (
                        <button
                            key={p.url}
                            className={`settings-preset-btn${rpcUrl === p.url ? ' is-selected' : ''}`}
                            onClick={() => handleRpcSelect(p.url)}
                            data-testid={`settings-rpc-${p.network}-${p.label.split(' ')[0].toLowerCase()}`}
                        >
                            {rpcUrl === p.url && <Check className="size-3 shrink-0" />}
                            <span>{p.label}</span>
                        </button>
                    ))}
                </div>
                <div className="settings-custom-row">
                    <input
                        className="cb-input"
                        type="text"
                        placeholder={t('settings.custom_rpc_placeholder') ?? 'URL personalizada...'}
                        value={customRpc}
                        onChange={e => setCustomRpc(e.target.value)}
                        data-testid="settings-rpc-custom-input"
                    />
                    <button
                        className="cb-btn cb-btn-outline cb-btn-sm"
                        onClick={handleCustomRpc}
                        disabled={!customRpc.trim()}
                        data-testid="settings-rpc-custom-apply"
                    >
                        {t('common.save') ?? 'Salvar'}
                    </button>
                </div>
                <div className="settings-current">
                    <code className="settings-current-value" data-testid="settings-rpc-current">{rpcUrl}</code>
                </div>
            </section>

            {/* Explorer URL */}
            <section className="settings-section" data-testid="settings-explorer">
                <h2 className="settings-section-title">{t('settings.explorer_title') ?? 'Explorador de Blocos'}</h2>
                <p className="settings-section-desc">{t('settings.explorer_desc') ?? 'Selecione o explorador de blocos para visualizar transações.'}</p>
                <div className="settings-presets">
                    {EXPLORER_PRESETS.map(p => (
                        <button
                            key={p.url}
                            className={`settings-preset-btn${explorerUrl === p.url ? ' is-selected' : ''}`}
                            onClick={() => handleExplorerSelect(p.url)}
                            data-testid={`settings-explorer-${p.network}-${p.label.split(' ')[0].toLowerCase()}`}
                        >
                            {explorerUrl === p.url && <Check className="size-3 shrink-0" />}
                            <span>{p.label}</span>
                        </button>
                    ))}
                </div>
                <div className="settings-custom-row">
                    <input
                        className="cb-input"
                        type="text"
                        placeholder={t('settings.custom_explorer_placeholder') ?? 'URL personalizada...'}
                        value={customExplorer}
                        onChange={e => setCustomExplorer(e.target.value)}
                        data-testid="settings-explorer-custom-input"
                    />
                    <button
                        className="cb-btn cb-btn-outline cb-btn-sm"
                        onClick={handleCustomExplorer}
                        disabled={!customExplorer.trim()}
                        data-testid="settings-explorer-custom-apply"
                    >
                        {t('common.save') ?? 'Salvar'}
                    </button>
                </div>
                <div className="settings-current">
                    <code className="settings-current-value" data-testid="settings-explorer-current">{explorerUrl}</code>
                </div>
            </section>

            {/* Sound */}
            <section className="settings-section" data-testid="settings-sound">
                <h2 className="settings-section-title">{t('settings.sound_title') ?? 'Som'}</h2>
                <p className="settings-section-desc">{t('settings.sound_desc') ?? 'Ativar ou desativar efeitos sonoros do jogo.'}</p>
                <label className="settings-toggle-row">
                    <span>{t('settings.sound_label') ?? 'Efeitos sonoros'}</span>
                    <input
                        type="checkbox"
                        className="cb-toggle"
                        checked={soundEnabled}
                        onChange={e => setSoundEnabled(e.target.checked)}
                        data-testid="settings-sound-toggle"
                    />
                </label>
            </section>

            {/* Save */}
            <div className="settings-actions">
                <button
                    className="cb-btn cb-btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                    data-testid="settings-save"
                >
                    {saving ? (
                        <>{t('common.saving') ?? 'Salvando...'}</>
                    ) : (
                        <><Save className="size-4 shrink-0" />{t('common.save') ?? 'Salvar'}</>
                    )}
                </button>
                {message && (
                    <p className={`settings-message settings-message--${message.type}`} data-testid="settings-message">
                        {message.text}
                    </p>
                )}
            </div>
        </div>
    );
}
