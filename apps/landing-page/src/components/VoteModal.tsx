import { useState, FormEvent, useEffect, useRef } from 'react';
import { X, CircleCheck, ArrowUp, ArrowDown } from 'lucide-react';
import { cn, validateEmail } from '@/lib/utils';
import { requestVote, confirmVote } from '@/lib/api';

interface VoteModalProps {
    readonly isOpen: boolean;
    readonly ideaId: number;
    readonly onClose: () => void;
}

type Step = 'email' | 'code' | 'confirmed';

export default function VoteModal({ isOpen, ideaId, onClose }: VoteModalProps) {
    const [step, setStep] = useState<Step>('email');
    const [voteType, setVoteType] = useState<'upvote' | 'downvote'>('upvote');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            previousFocusRef.current = document.activeElement as HTMLElement;
            setTimeout(() => dialogRef.current?.focus(), 50);
        } else if (previousFocusRef.current) {
            previousFocusRef.current.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        function handleKey(e: KeyboardEvent) {
            if (e.key === 'Escape') { reset(); onClose(); return; }
            if (e.key !== 'Tab' || !dialogRef.current) return;
            const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    function reset() {
        setStep('email');
        setVoteType('upvote');
        setEmail('');
        setCode('');
        setLoading(false);
        setError(null);
    }

    function handleOverlayClick(e: React.MouseEvent) {
        if (e.target === e.currentTarget) {
            reset();
            onClose();
        }
    }

    async function handleSendCode(e: FormEvent) {
        e.preventDefault();
        setError(null);
        if (!validateEmail(email)) {
            setError('Please enter a valid email.');
            return;
        }
        setLoading(true);
        try {
            await requestVote(ideaId, email, voteType);
            setStep('code');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send code.');
        } finally {
            setLoading(false);
        }
    }

    async function handleConfirm(e: FormEvent) {
        e.preventDefault();
        setError(null);
        if (code.length !== 6) {
            setError('Code must be 6 digits.');
            return;
        }
        setLoading(true);
        try {
            await confirmVote(email, code);
            setStep('confirmed');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to confirm vote.');
        } finally {
            setLoading(false);
        }
    }

    function handleClose() {
        reset();
        onClose();
    }

    // NOSONAR(S6819): native <dialog> breaks Tailwind backdrop-blur + CSS animations
    return (
        <div
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={handleOverlayClick}
            role="presentation"
        >
            <div
                ref={dialogRef}
                tabIndex={-1}
                className="bg-surface-800 rounded-xl p-6 max-w-md w-full shadow-modal border border-surface-700/50 relative outline-none"
                role="dialog"
                aria-modal="true"
                aria-label="Vote modal"
            >
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 text-tertiary hover:text-white transition"
                >
                    <X size={20} />
                </button>

                {step === 'email' && (
                    <>
                        <h3 className="text-xl font-bold text-white mb-2">Vote on this idea</h3>
                        <p className="text-sm text-secondary mb-6">
                            Enter your email to receive a confirmation code.
                        </p>

                        <div className="flex gap-2 mb-6">
                            <button
                                type="button"
                                onClick={() => setVoteType('upvote')}
                                className={cn(
                                    'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border bg-surface-700/50 text-sm font-medium transition',
                                    voteType === 'upvote'
                                        ? 'border-brand-500 text-brand-300'
                                        : 'border-surface-600 text-secondary hover:text-white'
                                )}
                            >
                                <ArrowUp size={16} />
                                Upvote
                            </button>
                            <button
                                type="button"
                                onClick={() => setVoteType('downvote')}
                                className={cn(
                                    'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border bg-surface-700/50 text-sm font-medium transition',
                                    voteType === 'downvote'
                                        ? 'border-brand-500 text-brand-300'
                                        : 'border-surface-600 text-secondary hover:text-white'
                                )}
                            >
                                <ArrowDown size={16} />
                                Downvote
                            </button>
                        </div>

                        <form onSubmit={handleSendCode} className="space-y-4">
                            <input
                                type="email"
                                placeholder="your@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder:text-tertiary focus:outline-none focus:border-brand-500"
                            />
                            {error && <p className="text-danger-400 text-sm">{error}</p>}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-brand-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-500 transition disabled:opacity-50"
                            >
                                {loading ? 'Sending...' : 'Send Code'}
                            </button>
                        </form>
                    </>
                )}

                {step === 'code' && (
                    <>
                        <h3 className="text-xl font-bold text-white mb-2">Confirm your vote</h3>
                        <p className="text-sm text-secondary mb-6">
                            Enter the 6-digit code sent to <span className="text-white font-medium">{email}</span>
                        </p>

                        <form onSubmit={handleConfirm} className="space-y-4">
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="000000"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                className="w-full px-4 py-3 rounded-xl bg-surface-700 border border-surface-600 text-white placeholder:text-tertiary focus:outline-none focus:border-brand-500 text-center text-2xl tracking-widest"
                            />
                            {error && <p className="text-danger-400 text-sm">{error}</p>}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-brand-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-500 transition disabled:opacity-50"
                            >
                                {loading ? 'Confirming...' : 'Confirm Vote'}
                            </button>
                        </form>
                    </>
                )}

                {step === 'confirmed' && (
                    <div className="text-center py-4">
                        <CircleCheck size={48} className="mx-auto text-success-400 mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">Vote confirmed!</h3>
                        <p className="text-sm text-secondary mb-6">Your vote has been recorded.</p>
                        <button
                            onClick={handleClose}
                            className="bg-surface-600 text-white font-medium px-6 py-2.5 rounded-xl hover:bg-surface-500 transition"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
