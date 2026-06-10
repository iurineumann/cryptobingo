import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Name } from '@wharfkit/session';
import type { Session } from '@wharfkit/session';

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';

interface PlayerDashboardProps { session: Session }

export default function PlayerDashboard({ session }: PlayerDashboardProps) {
    const { t } = useTranslation();
    const [balanceQty, setBalanceQty] = useState('');
    const [ticketCount, setTicketCount] = useState(0);
    const [games, setGames] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const ownerScope = Name.from(session.actor).value.toString();

                const [balanceRes, gamesRes] = await Promise.all([
                    session.client.v1.chain.get_table_rows({
                        code: CONTRACT, scope: ownerScope,
                        table: 'balances', limit: 1, json: true,
                    }),
                    session.client.v1.chain.get_table_rows({
                        code: CONTRACT, scope: CONTRACT,
                        table: 'games', limit: 50, json: true,
                    }),
                ]);

                const bal = balanceRes.rows[0] as any;
                setBalanceQty(bal?.balance?.quantity ?? '0.0000 WAX');

                const allGames = gamesRes.rows as any[];
                setGames(allGames);

                let totalTickets = 0;
                for (const g of allGames) {
                    const ticketRes = await session.client.v1.chain.get_table_rows({
                        code: CONTRACT, scope: g.game_id,
                        table: 'tickets', limit: 50, json: true,
                    });
                    const playerTickets = (ticketRes.rows as any[])
                        .filter((t: any) => t.owner === ownerScope);
                    totalTickets += playerTickets.length;
                }
                setTicketCount(totalTickets);
            } catch (err) {
                console.error('[PlayerDashboard] Erro:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, [session]);

    const myGames = games.filter((g: any) => g.status !== 'created');

    return (
        <div>
            <p className="text-sm text-[--cb-text-tertiary] mb-6">{String(session.actor)}</p>

            {loading ? (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-4"><span className="cb-spinner w-4 h-4" /><span>{t('admin.player_loading')}</span></div>
            ) : (
                <>
                    <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))' }}>
                        <div className="cb-card p-4">
                            <span className="text-xs text-[--cb-text-tertiary] uppercase tracking-wider">{t('admin.player_balance')}</span>
                            <span className="text-2xl font-bold font-mono text-[--cb-accent] block">{balanceQty}</span>
                        </div>
                        <div className="cb-card p-4">
                            <span className="text-xs text-[--cb-text-tertiary] uppercase tracking-wider">{t('admin.player_games')}</span>
                            <span className="text-2xl font-bold text-[--cb-text-primary] block">{myGames.length}</span>
                        </div>
                        <div className="cb-card p-4">
                            <span className="text-xs text-[--cb-text-tertiary] uppercase tracking-wider">{t('admin.player_tickets')}</span>
                            <span className="text-2xl font-bold text-[--cb-text-primary] block">{ticketCount}</span>
                        </div>
                    </div>

                    <h3 className="text-sm font-semibold text-[--cb-text-secondary] uppercase tracking-wide mb-3">{t('admin.player_history')}</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[--cb-text-tertiary] border-b border-[--cb-border-default]">
                                    <th className="text-left py-2 pr-4 font-medium">{t('admin.player_col_game')}</th>
                                    <th className="text-left py-2 pr-4 font-medium">{t('admin.player_col_status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {myGames.slice(0, 20).map((g: any) => (
                                    <tr key={g.game_id} className="border-b border-[--cb-border-default] text-[--cb-text-primary]">
                                        <td className="py-2 pr-4 font-mono text-xs">{g.game_id}</td>
                                        <td className="py-2 pr-4">
                                            <span className={`cb-badge text-xs ${
                                                g.status === 'archived' ? 'cb-badge-success' :
                                                g.status === 'aborted' ? 'cb-badge-danger' :
                                                g.status === 'funding' ? 'cb-status-funding' :
                                                'cb-badge-neutral'
                                            }`}>{g.status}</span>
                                        </td>
                                    </tr>
                                ))}
                                {myGames.length === 0 && <tr><td colSpan={2} className="py-4 text-center text-[--cb-text-tertiary]">{t('admin.player_empty')}</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}