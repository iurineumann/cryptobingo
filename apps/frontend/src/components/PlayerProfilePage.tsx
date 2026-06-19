import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import type { MongoUserProfile } from '@cryptobingo/shared-types';
import { PrivateKey, Checksum256 } from '@wharfkit/antelope';
import {
    fetchMyNfts, fetchAchievements, syncBurns,
    updateProfile, type NftAsset, type AchievementDef,
} from '../services/api';
import XpProgressBar from './XpProgressBar';

/**
 * Assina payload de atualização de perfil.
 * Dev (VITE_DEV_PRIVATE_KEY definida): assina SHA256(payload) direto com a chave.
 * Prod: assina via session.transact (eosio.null:nonce, broadcast:false).
 * Backend valida ambos os modos (digest / transactionPayload).
 */
async function signProfileUpdate(
    session: Session,
    payload: string,
    ts: number,
): Promise<{ signature: string; transactionPayload?: object }> {
    const devKey = import.meta.env.VITE_DEV_PRIVATE_KEY;

    if (devKey) {
        const pk = PrivateKey.from(devKey);
        const digest = Checksum256.hash(Buffer.from(payload, 'utf-8'));
        const sig = pk.signDigest(digest);
        return { signature: sig.toString() };
    }

    const payloadHex = Buffer.from(payload, 'utf-8').toString('hex');
    const result = await session.transact(
        {
            action: {
                account:       'eosio.null',
                name:          'nonce',
                authorization: [session.permissionLevel],
                data:          payloadHex,
            },
        },
        { broadcast: false },
    );
    if (!result.signatures?.length) throw new Error('empty_sig');
    return {
        signature:          result.signatures[0].toString(),
        transactionPayload: (result.transaction as any)?.toJSON(),
    };
}

interface Props {
    session:  Session;
    profile:  MongoUserProfile;
    onProfileUpdated: () => void;
}

type Tab = 'profile' | 'nfts' | 'xp';

export default function PlayerProfilePage({ session, profile, onProfileUpdated }: Props) {
    const { t } = useTranslation();
    const [tab, setTab] = useState<Tab>('profile');

    // ── Aba Perfil ────────────────────────────────────────────────────────
    const [nickname, setNickname]   = useState(profile.nickname ?? '');
    const [avatarId, setAvatarId]   = useState<string | null>(profile.avatar_nft_asset_id ?? null);
    const [saving, setSaving]       = useState(false);
    const [saveMsg, setSaveMsg]     = useState<{ ok: boolean; text: string } | null>(null);

    // ── Aba NFTs ──────────────────────────────────────────────────────────
    const [nfts, setNfts]           = useState<NftAsset[]>([]);
    const [nftsLoading, setNftsLoading] = useState(false);
    const [syncing, setSyncing]     = useState(false);
    const [syncMsg, setSyncMsg]     = useState<{ ok: boolean; text: string } | null>(null);

    // ── Aba XP ────────────────────────────────────────────────────────────
    const [achievements, setAchievements] = useState<AchievementDef[]>([]);
    const [achLoading, setAchLoading]     = useState(false);

    const loadNfts = useCallback(async () => {
        setNftsLoading(true);
        try { const r = await fetchMyNfts(); setNfts(r.nfts); }
        catch { setNfts([]); }
        finally { setNftsLoading(false); }
    }, []);

    const loadAchievements = useCallback(async () => {
        setAchLoading(true);
        try { const r = await fetchAchievements(); setAchievements(r.achievements); }
        catch { setAchievements([]); }
        finally { setAchLoading(false); }
    }, []);

    const avatarNft = nfts.find(n => n.asset_id === avatarId);

    useEffect(() => {
        if (tab === 'profile' || tab === 'nfts') loadNfts();
        if (tab === 'xp')                        loadAchievements();
    }, [tab, loadNfts, loadAchievements]);

    const handleSave = async () => {
        setSaving(true);
        setSaveMsg(null);
        try {
        const sensitiveFields: Record<string, unknown> = {};
        if (nickname !== (profile.nickname ?? ''))       sensitiveFields.nickname              = nickname;
        if (avatarId !== profile.avatar_nft_asset_id)   sensitiveFields.avatar_nft_asset_id  = avatarId;
            const hasSensitive = Object.keys(sensitiveFields).length > 0;

            let signature: string | undefined;
            let ts: number | undefined;
            let transactionPayload: object | undefined;

            if (hasSensitive) {
                ts = Date.now();
                const payload = `UPDATE_PROFILE:${String(session.actor)}:${ts}:${JSON.stringify(sensitiveFields)}`;
                const signed  = await signProfileUpdate(session, payload, ts);
                signature          = signed.signature;
                transactionPayload = signed.transactionPayload;
            }

            await updateProfile({
                ...sensitiveFields as any,
                ...(hasSensitive ? { signature, ts, ...(transactionPayload ? { transactionPayload } : {}) } : {}),
            });

            setSaveMsg({ ok: true, text: t('profile_page.save_success') });
            onProfileUpdated();
        } catch (e: any) {
            const msg = String(e?.message ?? e);
            setSaveMsg({ ok: false, text: msg.includes('sig') ? t('profile_page.sig_error') : t('profile_page.save_error') });
        } finally {
            setSaving(false);
        }
    };

    const handleSyncBurns = async () => {
        setSyncing(true);
        setSyncMsg(null);
        try {
            const r = await syncBurns();
            setSyncMsg({
                ok: true,
                text: r.recorded === 0
                    ? t('profile_page.sync_success_zero')
                    : t('profile_page.sync_success', { count: r.recorded }),
            });
        } catch {
            setSyncMsg({ ok: false, text: t('profile_page.sync_error') });
        } finally {
            setSyncing(false);
        }
    };

    const dirty = nickname !== profile.nickname || avatarId !== profile.avatar_nft_asset_id;

    const tabs: { id: Tab; label: string }[] = [
        { id: 'profile', label: t('profile_page.tab_profile') },
        { id: 'nfts',    label: t('profile_page.tab_nfts')    },
        { id: 'xp',      label: t('profile_page.tab_xp')      },
    ];

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-xl font-bold text-[--cb-text-primary]">{t('profile_page.title')}</h2>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-[--cb-border]">
                {tabs.map(tb => (
                    <button
                        key={tb.id}
                        onClick={() => setTab(tb.id)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            tab === tb.id
                                ? 'border-[--cb-brand] text-[--cb-brand]'
                                : 'border-transparent text-[--cb-text-secondary] hover:text-[--cb-text-primary]'
                        }`}
                        data-testid={`profile-tab-${tb.id}`}
                        aria-current={tab === tb.id ? 'page' : undefined}
                    >
                        {tb.label}
                    </button>
                ))}
            </div>

            {/* ── Aba Perfil ─────────────────────────────────────────── */}
            {tab === 'profile' && (
                <div className="cb-card p-5 space-y-4">
                    {/* Wallet */}
                    <div>
                        <p className="text-xs text-[--cb-text-tertiary] mb-1">{t('profile_page.wallet_label')}</p>
                        <p className="font-mono text-sm text-[--cb-text-primary]" data-testid="profile-wallet">
                            {String(session.actor)}
                        </p>
                    </div>

                    {/* Nickname */}
                    <div>
                        <label className="block text-sm text-[--cb-text-secondary] mb-1">
                            {t('profile_page.nickname_label')}
                        </label>
                        <input
                            className="cb-input w-full"
                            maxLength={32}
                            placeholder={t('profile_page.nickname_placeholder')}
                            value={nickname}
                            onChange={e => setNickname(e.target.value)}
                            data-testid="profile-nickname-input"
                        />
                        <p className="text-xs text-[--cb-text-tertiary] mt-1">{t('profile_page.nickname_hint')}</p>
                    </div>

                    {/* Avatar */}
                    <div>
                        <label className="block text-sm text-[--cb-text-secondary] mb-1">
                            {t('profile_page.avatar_label')}
                        </label>
                        {avatarId && avatarNft?.img_url ? (
                            <div className="flex items-center gap-3">
                                <img
                                    src={avatarNft.img_url}
                                    alt={avatarNft.name}
                                    className="w-16 h-16 rounded-lg object-cover border border-[--cb-border]"
                                    data-testid="profile-avatar"
                                />
                                <div>
                                    <p className="text-xs font-medium text-[--cb-text-primary]">{avatarNft.name}</p>
                                    <p className="text-xs text-[--cb-text-tertiary]">#{avatarNft.asset_id}</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-[--cb-text-tertiary]">
                                {avatarId ?? t('profile_page.avatar_none')}
                            </p>
                        )}
                    </div>

                    <button
                        className="cb-btn cb-btn-primary w-full"
                        onClick={handleSave}
                        disabled={saving || !dirty}
                        data-testid="profile-save-btn"
                    >
                        {saving ? t('profile_page.saving') : t('profile_page.save')}
                    </button>

                    {saveMsg && (
                        <div className={`text-sm p-3 rounded-lg ${saveMsg.ok ? 'bg-[color-mix(in_srgb,var(--cb-success)_10%,transparent)] text-[--cb-success]' : 'bg-red-500/10 text-red-500'}`}>
                            {saveMsg.text}
                        </div>
                    )}
                </div>
            )}

            {/* ── Aba NFTs ───────────────────────────────────────────── */}
            {tab === 'nfts' && (
                <div className="space-y-4">
                    {/* Sync burns */}
                    <div className="cb-card p-4 flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-[--cb-text-primary]">
                                {t('profile_page.sync_burns')}
                            </p>
                            {syncMsg && (
                                <p className={`text-xs mt-1 ${syncMsg.ok ? 'text-green-600' : 'text-red-500'}`}>
                                    {syncMsg.text}
                                </p>
                            )}
                        </div>
                        <button
                            className="cb-btn cb-btn-outline cb-btn-sm whitespace-nowrap"
                            onClick={handleSyncBurns}
                            disabled={syncing}
                            data-testid="profile-sync-burns-btn"
                        >
                            {syncing ? t('profile_page.syncing') : t('profile_page.sync_burns')}
                        </button>
                    </div>

                    {/* Lista de NFTs */}
                    {nftsLoading ? (
                        <p className="text-sm text-[--cb-text-tertiary]">{t('profile_page.nfts_loading')}</p>
                    ) : nfts.length === 0 ? (
                        <p className="text-sm text-[--cb-text-tertiary]">{t('profile_page.nfts_empty')}</p>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {nfts.map(nft => (
                                <div
                                    key={nft.asset_id}
                                    className={`cb-card p-3 cursor-pointer transition-colors ${
                                        avatarId === nft.asset_id ? 'ring-2 ring-[--cb-brand]' : ''
                                    }`}
                                    onClick={() => setAvatarId(avatarId === nft.asset_id ? null : nft.asset_id)}
                                    data-testid={`profile-nft-${nft.asset_id}`}
                                >
                                    {nft.img_url ? (
                                        <img
                                            src={nft.img_url}
                                            alt={nft.name}
                                            className="w-full aspect-square rounded object-cover mb-2"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full aspect-square rounded bg-[--cb-surface-2] mb-2 flex items-center justify-center">
                                        </div>
                                    )}
                                    <p className="text-xs font-medium text-[--cb-text-primary] truncate">{nft.name}</p>
                                    <p className="text-xs text-[--cb-text-tertiary]">#{nft.asset_id}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Salvar avatar se selecionou diferente */}
                    {avatarId !== profile.avatar_nft_asset_id && (
                        <button
                            className="cb-btn cb-btn-primary w-full"
                            onClick={handleSave}
                            disabled={saving}
                            data-testid="profile-save-avatar-btn"
                        >
                            {saving ? t('profile_page.saving') : t('profile_page.save')}
                        </button>
                    )}
                    {saveMsg && tab === 'nfts' && (
                        <div className={`text-sm p-3 rounded-lg ${saveMsg.ok ? 'bg-[color-mix(in_srgb,var(--cb-success)_10%,transparent)] text-[--cb-success]' : 'bg-red-500/10 text-red-500'}`}>
                            {saveMsg.text}
                        </div>
                    )}
                </div>
            )}

            {/* ── Aba XP ─────────────────────────────────────────────── */}
            {tab === 'xp' && (
                <div className="space-y-4">
                    {/* XP bar expandida */}
                    <div className="cb-card p-4 space-y-3">
                        <XpProgressBar
                            tier={profile.progression.tier}
                            level={profile.progression.level}
                            subLevel={profile.progression.sub_level}
                            progressPct={profile.progression.progress_pct ?? 0}
                            nextLevelXp={profile.progression.next_level_xp ?? 0}
                            xpToNext={profile.progression.xp_to_next_level ?? 0}
                        />
                        <div className="grid grid-cols-3 gap-3 pt-2">
                            <div className="text-center">
                                <p className="text-lg font-bold text-[--cb-text-primary]">
                                    {profile.progression.games_played}
                                </p>
                                <p className="text-xs text-[--cb-text-tertiary]">{t('profile_page.games_played')}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold text-[--cb-text-primary]">
                                    {profile.progression.wins_count ?? 0}
                                </p>
                                <p className="text-xs text-[--cb-text-tertiary]">{t('profile_page.wins')}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold text-[--cb-text-primary]">
                                    {profile.progression.burns_count ?? 0}
                                </p>
                                <p className="text-xs text-[--cb-text-tertiary]">{t('profile_page.burns')}</p>
                            </div>
                        </div>
                    </div>

                    {/* Achievements */}
                    <h3 className="text-sm font-semibold text-[--cb-text-secondary]">{t('profile_page.achievements_title')}</h3>
                    {achLoading ? (
                        <p className="text-sm text-[--cb-text-tertiary]">{t('common.loading')}</p>
                    ) : achievements.length === 0 ? (
                        <p className="text-sm text-[--cb-text-tertiary]">{t('profile_page.achievements_empty')}</p>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {achievements.map(a => (
                                <div
                                    key={a.id}
                                    className={`cb-card p-3 flex gap-2 items-start ${!a.unlocked ? 'opacity-40' : ''}`}
                                    data-testid={`achievement-${a.id}`}
                                    aria-label={a.unlocked ? a.label : t('profile_page.achievement_locked', { name: a.label })}
                                >
                                    <span className="text-xl">{a.icon}</span>
                                    <div>
                                        <p className="text-xs font-medium text-[--cb-text-primary]">{a.label}</p>
                                        <p className="text-xs text-[--cb-text-tertiary]">{a.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
