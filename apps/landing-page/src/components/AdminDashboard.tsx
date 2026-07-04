import { useState, useEffect } from 'react';
import { LogOut, Send } from 'lucide-react';
import { getIdeas, adminUpdateIdeaStatus, adminSendNewsletter, type Idea } from '@/lib/api';
import { clearAdminToken } from '@/lib/store';

const STATUS_OPTIONS: Idea['status'][] = ['pending', 'approved', 'rejected', 'implemented'];

const STATUS_LABELS: Record<Idea['status'], string> = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    implemented: 'Implemented',
};

function handleLogout() {
    clearAdminToken();
    globalThis.location.reload();
}

function getOriginalStatus(ideas: Idea[], id: number): Idea['status'] {
    const found = ideas.find((x) => x.id === id);
    return found!.status;
}

interface IdeasTableProps {
    readonly ideas: Idea[];
    readonly loading: boolean;
    readonly onStatusChange: (id: number, status: Idea['status']) => void;
}

function IdeasTable({
    ideas,
    loading,
    onStatusChange,
}: IdeasTableProps) {
    if (loading) {
        return (
            <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-secondary">
                    Loading...
                </td>
            </tr>
        );
    }
    if (ideas.length === 0) {
        return (
            <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-secondary">
                    No ideas yet.
                </td>
            </tr>
        );
    }
    return ideas.map((idea) => (
        <tr
            key={idea.id}
            className="border-b border-surface-700/50 hover:bg-surface-750 transition"
        >
            <td className="px-4 py-3 text-secondary">{idea.id}</td>
            <td className="px-4 py-3 text-white font-medium max-w-xs truncate">
                {idea.title}
            </td>
            <td className="px-4 py-3 text-secondary">{idea.author_name}</td>
            <td className="px-4 py-3 text-center text-success-400">{idea.upvotes}</td>
            <td className="px-4 py-3 text-center text-danger-400">{idea.downvotes}</td>
            <td className="px-4 py-3">
                <select
                    value={idea.status}
                    onChange={(e) =>
                        onStatusChange(idea.id, e.target.value as Idea['status'])
                    }
                    className="bg-surface-700 border border-surface-600 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-500"
                >
                    {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                        </option>
                    ))}
                </select>
            </td>
        </tr>
    ));
}

export default function AdminDashboard() {
    const [ideas, setIdeas] = useState<Idea[]>([]);
    const [loading, setLoading] = useState(true);
    const [newsletterSubject, setNewsletterSubject] = useState('');
    const [newsletterBody, setNewsletterBody] = useState('');
    const [sending, setSending] = useState(false);
    const [sentCount, setSentCount] = useState<number | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        getIdeas()
            .then(setIdeas)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const total = ideas.length;
    const pendingCount = ideas.filter((i) => i.status === 'pending').length;
    const approvedCount = ideas.filter((i) => i.status === 'approved' || i.status === 'implemented').length;

    async function handleStatusChange(id: number, newStatus: Idea['status']) {
        const origStatus = getOriginalStatus(ideas, id);
        setIdeas((prev) =>
            prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i))
        );
        try {
            await adminUpdateIdeaStatus(id, newStatus);
        } catch {
            setIdeas((prev) =>
                prev.map((i) => (i.id === id ? { ...i, status: origStatus } : i))
            );
        }
    }

    async function handleSendNewsletter() {
        setSending(true);
        try {
            const result = await adminSendNewsletter(newsletterSubject, newsletterBody);
            setSentCount(result.sent);
            setNewsletterSubject('');
            setNewsletterBody('');
        } catch {
            setSentCount(-1);
        } finally {
            setSending(false);
            setShowConfirm(false);
        }
    }

    const hasSent = sentCount !== null;

    function renderNewsletterResult() {
        if (sentCount === -1) {
            return <p className="text-danger-400">Failed to send newsletter.</p>;
        }
        const plural = sentCount === 1 ? '' : 's';
        return (
            <p className="text-success-400 font-medium">
                Newsletter sent to {sentCount} subscriber{plural}.
            </p>
        );
    }

    return (
        <main id="main-content" className="mx-auto max-w-6xl px-4 py-12">
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-white">Admin Dashboard</h2>
                <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 text-sm text-secondary hover:text-danger-400 transition"
                >
                    <LogOut size={16} />
                    Logout
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
                <div className="bg-surface-800 rounded-xl p-5 border border-surface-700/50">
                    <p className="text-3xl font-bold text-white">{total}</p>
                    <p className="text-sm text-secondary mt-1">Total Ideas</p>
                </div>
                <div className="bg-surface-800 rounded-xl p-5 border border-surface-700/50">
                    <p className="text-3xl font-bold text-accent-400">{pendingCount}</p>
                    <p className="text-sm text-secondary mt-1">Pending</p>
                </div>
                <div className="bg-surface-800 rounded-xl p-5 border border-surface-700/50">
                    <p className="text-3xl font-bold text-success-400">{approvedCount}</p>
                    <p className="text-sm text-secondary mt-1">Approved / Implemented</p>
                </div>
            </div>

            <div className="bg-surface-800 rounded-xl border border-surface-700/50 overflow-hidden mb-10">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-surface-700/50 text-left text-secondary">
                                <th className="px-4 py-3 font-medium">ID</th>
                                <th className="px-4 py-3 font-medium">Title</th>
                                <th className="px-4 py-3 font-medium">Author</th>
                                <th className="px-4 py-3 font-medium text-center">Up</th>
                                <th className="px-4 py-3 font-medium text-center">Down</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <IdeasTable
                                ideas={ideas}
                                loading={loading}
                                onStatusChange={handleStatusChange}
                            />
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-surface-800 rounded-xl p-6 border border-surface-700/50">
                <h3 className="text-lg font-semibold text-white mb-4">Send Newsletter</h3>
                {hasSent ? (
                    <div>
                        {renderNewsletterResult()}
                        <button
                            onClick={() => setSentCount(null)}
                            className="mt-4 text-sm text-brand-400 hover:text-brand-300 transition"
                        >
                            Send another
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="newsletter-subject" className="block text-sm text-secondary mb-1">Subject</label>
                                <input
                                    id="newsletter-subject"
                                    type="text"
                                    value={newsletterSubject}
                                    onChange={(e) => setNewsletterSubject(e.target.value)}
                                    placeholder="Newsletter subject"
                                    className="w-full px-4 py-2.5 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder:text-tertiary focus:outline-none focus:border-brand-500"
                                />
                            </div>
                            <div>
                                <label htmlFor="newsletter-body" className="block text-sm text-secondary mb-1">Body</label>
                                <textarea
                                    id="newsletter-body"
                                    value={newsletterBody}
                                    onChange={(e) => setNewsletterBody(e.target.value)}
                                    placeholder="Write your newsletter content..."
                                    rows={5}
                                    className="w-full px-4 py-2.5 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder:text-tertiary focus:outline-none focus:border-brand-500 resize-y"
                                />
                            </div>
                            <button
                                onClick={() => setShowConfirm(true)}
                                disabled={!newsletterSubject.trim() || !newsletterBody.trim()}
                                className="flex items-center gap-2 bg-accent-400 text-surface-900 font-semibold px-6 py-3 rounded-xl hover:bg-accent-300 transition disabled:opacity-50"
                            >
                                <Send size={16} />
                                Send to All Subscribers
                            </button>
                        </div>

                        {showConfirm && (
                            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                                <div className="bg-surface-800 rounded-xl p-6 max-w-sm w-full shadow-modal border border-surface-700/50">
                                    <h4 className="text-lg font-bold text-white mb-2">Confirm Newsletter</h4>
                                    <p className="text-sm text-secondary mb-6">
                                        This will send an email to all subscribers. Are you sure?
                                    </p>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setShowConfirm(false)}
                                            className="flex-1 px-4 py-2.5 rounded-xl border border-surface-600 text-white hover:bg-surface-700 transition"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSendNewsletter}
                                            disabled={sending}
                                            className="flex-1 bg-accent-400 text-surface-900 font-semibold px-4 py-2.5 rounded-xl hover:bg-accent-300 transition disabled:opacity-50"
                                        >
                                            {sending ? 'Sending...' : 'Send'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </main>
    );
}
