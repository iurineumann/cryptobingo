import { useState, useEffect } from 'react';
import { LogOut, Send, Eye, SendToBack } from 'lucide-react';
import {
    getIdeas,
    adminUpdateIdeaStatus,
    adminSendNewsletter,
    getSubscribers,
    getNewsletters,
    getNewsletterRecipients,
    sendPendingNewsletter,
    type Idea,
    type Subscriber,
    type SubscribersResponse,
    type Newsletter,
    type NewsletterRecipient,
} from '@/lib/api';
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
    const [sentResult, setSentResult] = useState<{ id: number; sent: number } | null>(null);
    const [sentError, setSentError] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const [subTotal, setSubTotal] = useState(0);
    const [subPage, setSubPage] = useState(0);
    const [subLoading, setSubLoading] = useState(true);
    const SUB_PAGE_SIZE = 20;

    const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
    const [newslettersLoading, setNewslettersLoading] = useState(true);
    const [selectedNewsletter, setSelectedNewsletter] = useState<Newsletter | null>(null);
    const [recipients, setRecipients] = useState<NewsletterRecipient[]>([]);
    const [recipientsLoading, setRecipientsLoading] = useState(false);
    const [showRecipientsModal, setShowRecipientsModal] = useState(false);
    const [sendingPending, setSendingPending] = useState(false);

    useEffect(() => {
        getSubscribers(SUB_PAGE_SIZE, subPage * SUB_PAGE_SIZE)
            .then((res: SubscribersResponse) => {
                setSubscribers(res.subscribers);
                setSubTotal(res.total);
            })
            .catch(() => {})
            .finally(() => setSubLoading(false));
    }, [subPage]);

    useEffect(() => {
        getIdeas()
            .then(setIdeas)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        getNewsletters()
            .then((res) => setNewsletters(res.newsletters))
            .catch(() => {})
            .finally(() => setNewslettersLoading(false));
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
            setSentResult({ id: result.id, sent: result.sent });
            setSentError(false);
            setNewsletterSubject('');
            setNewsletterBody('');
            const nlRes = await getNewsletters();
            setNewsletters(nlRes.newsletters);
        } catch {
            setSentError(true);
            setSentResult(null);
        } finally {
            setSending(false);
            setShowConfirm(false);
        }
    }

    const hasSent = sentResult !== null || sentError;

    function renderNewsletterResult() {
        if (sentError) {
            return <p className="text-danger-400">Failed to send newsletter.</p>;
        }
        const plural = sentResult!.sent === 1 ? '' : 's';
        return (
            <p className="text-success-400 font-medium">
                Newsletter sent to {sentResult!.sent} subscriber{plural}.
            </p>
        );
    }

    async function handleViewRecipients(nl: Newsletter) {
        setSelectedNewsletter(nl);
        setRecipientsLoading(true);
        setShowRecipientsModal(true);
        try {
            const res = await getNewsletterRecipients(nl.id);
            setRecipients(res.recipients);
        } catch {
            setRecipients([]);
        } finally {
            setRecipientsLoading(false);
        }
    }

    async function handleSendPending() {
        if (!selectedNewsletter) return;
        setSendingPending(true);
        try {
            const res = await sendPendingNewsletter(selectedNewsletter.id);
            const [recipientsRes, newslettersRes] = await Promise.all([
                getNewsletterRecipients(selectedNewsletter.id),
                getNewsletters(),
            ]);
            setRecipients(recipientsRes.recipients);
            setNewsletters(newslettersRes.newsletters);
        } catch {
        } finally {
            setSendingPending(false);
        }
    }

    const pendingRecipientsCount = recipients.filter((r) => !r.received).length;

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

            <div className="bg-surface-800 rounded-xl border border-surface-700/50 overflow-hidden mb-10">
                <div className="px-6 py-4 border-b border-surface-700/50">
                    <h3 className="text-lg font-semibold text-white">Newsletter Subscribers</h3>
                    <p className="text-sm text-secondary mt-1">{subTotal} subscriber{subTotal === 1 ? '' : 's'}</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-surface-700/50 text-left text-secondary">
                                <th className="px-4 py-3 font-medium">Email</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                                <th className="px-4 py-3 font-medium">Subscribed At</th>
                                <th className="px-4 py-3 font-medium">Unsubscribed At</th>
                            </tr>
                        </thead>
                        <tbody>
                            {subLoading ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-secondary">Loading...</td>
                                </tr>
                            ) : subscribers.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-secondary">No subscribers yet.</td>
                                </tr>
                            ) : (
                                subscribers.map((s) => (
                                    <tr key={s.id} className="border-b border-surface-700/50 hover:bg-surface-750 transition">
                                        <td className="px-4 py-3 text-white">{s.email}</td>
                                        <td className="px-4 py-3">
                                            {s.active ? (
                                                <span className="text-success-400">Active</span>
                                            ) : (
                                                <span className="text-danger-400">Unsubscribed</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-secondary">{new Date(s.created_at).toLocaleDateString()}</td>
                                        <td className="px-4 py-3 text-secondary">
                                            {s.unsubscribed_at ? new Date(s.unsubscribed_at).toLocaleDateString() : '—'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {subTotal > SUB_PAGE_SIZE && (
                    <div className="flex items-center justify-between px-6 py-3 border-t border-surface-700/50">
                        <p className="text-sm text-secondary">
                            Page {subPage + 1} of {Math.ceil(subTotal / SUB_PAGE_SIZE)}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSubPage((p) => Math.max(0, p - 1))}
                                disabled={subPage === 0}
                                className="px-3 py-1.5 text-sm rounded-lg bg-surface-700 text-white hover:bg-surface-600 transition disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setSubPage((p) => p + 1)}
                                disabled={(subPage + 1) * SUB_PAGE_SIZE >= subTotal}
                                className="px-3 py-1.5 text-sm rounded-lg bg-surface-700 text-white hover:bg-surface-600 transition disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-surface-800 rounded-xl p-6 border border-surface-700/50 mb-10">
                <h3 className="text-lg font-semibold text-white mb-4">Send Newsletter</h3>
                {hasSent ? (
                    <div>
                        {renderNewsletterResult()}
                        <button
                            onClick={() => { setSentResult(null); setSentError(false); }}
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

            <div className="bg-surface-800 rounded-xl border border-surface-700/50 overflow-hidden">
                <div className="px-6 py-4 border-b border-surface-700/50">
                    <h3 className="text-lg font-semibold text-white">Newsletters enviadas</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-surface-700/50 text-left text-secondary">
                                <th className="px-4 py-3 font-medium">Subject</th>
                                <th className="px-4 py-3 font-medium">Sent at</th>
                                <th className="px-4 py-3 font-medium text-center">Sent count</th>
                                <th className="px-4 py-3 font-medium text-center">Recipients</th>
                            </tr>
                        </thead>
                        <tbody>
                            {newslettersLoading ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-secondary">Loading...</td>
                                </tr>
                            ) : newsletters.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-secondary">
                                        No newsletters sent yet.
                                    </td>
                                </tr>
                            ) : (
                                newsletters.map((nl) => (
                                    <tr key={nl.id} className="border-b border-surface-700/50 hover:bg-surface-750 transition">
                                        <td className="px-4 py-3 text-white font-medium">{nl.subject}</td>
                                        <td className="px-4 py-3 text-secondary">
                                            {nl.sent_at ? new Date(nl.sent_at).toLocaleString() : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-center text-white">{nl.sent_count}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => handleViewRecipients(nl)}
                                                className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 transition"
                                            >
                                                <Eye size={14} />
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showRecipientsModal && selectedNewsletter && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="bg-surface-800 rounded-xl p-6 max-w-2xl w-full shadow-modal border border-surface-700/50 max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-lg font-bold text-white truncate mr-4">
                                Recipients: {selectedNewsletter.subject}
                            </h4>
                            <button
                                onClick={() => setShowRecipientsModal(false)}
                                className="text-secondary hover:text-white transition text-xl leading-none"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {recipientsLoading ? (
                                <p className="text-center text-secondary py-8">Loading...</p>
                            ) : recipients.length === 0 ? (
                                <p className="text-center text-secondary py-8">No active subscribers.</p>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-surface-700/50 text-left text-secondary">
                                            <th className="px-4 py-2 font-medium">Email</th>
                                            <th className="px-4 py-2 font-medium text-center w-20">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recipients.map((r) => (
                                            <tr key={r.email} className="border-b border-surface-700/50 hover:bg-surface-750 transition">
                                                <td className="px-4 py-2.5 text-white">{r.email}</td>
                                                <td className="px-4 py-2.5 text-center text-lg">
                                                    {r.received ? (
                                                        <span className="text-success-400" title="Received">&#10003;</span>
                                                    ) : (
                                                        <span className="text-danger-400" title="Not received">&#10007;</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t border-surface-700/50 mt-4">
                            <p className="text-sm text-secondary">
                                {pendingRecipientsCount} pending / {recipients.length} total
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowRecipientsModal(false)}
                                    className="px-4 py-2 rounded-xl border border-surface-600 text-white hover:bg-surface-700 transition text-sm"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={handleSendPending}
                                    disabled={sendingPending || pendingRecipientsCount === 0}
                                    className="flex items-center gap-2 bg-accent-400 text-surface-900 font-semibold px-4 py-2 rounded-xl hover:bg-accent-300 transition disabled:opacity-50 text-sm"
                                >
                                    <SendToBack size={14} />
                                    {sendingPending ? 'Sending...' : `Send to ${pendingRecipientsCount} pending`}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
