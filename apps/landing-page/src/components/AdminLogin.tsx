import { useState, FormEvent } from 'react';
import { cn, validateEmail } from '@/lib/utils';
import { adminLogin, adminConfirm } from '@/lib/api';
import { setAdminToken } from '@/lib/store';

interface AdminLoginProps {
    onLogin: () => void;
}

type Step = 'email' | 'code';

export default function AdminLogin({ onLogin }: AdminLoginProps) {
    const [step, setStep] = useState<Step>('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function maskEmail(e: string): string {
        const [local, domain] = e.split('@');
        const masked = local.length <= 3
            ? local.slice(0, 1) + '***'
            : local.slice(0, 2) + '***' + local.slice(-1);
        return `${masked}@${domain}`;
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
            await adminLogin(email);
            setStep('code');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send code.');
        } finally {
            setLoading(false);
        }
    }

    async function handleVerify(e: FormEvent) {
        e.preventDefault();
        setError(null);
        if (code.length !== 6) {
            setError('Code must be 6 digits.');
            return;
        }
        setLoading(true);
        try {
            const { token } = await adminConfirm(email, code);
            setAdminToken(token);
            onLogin();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Verification failed.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="w-full bg-surface-800 rounded-xl p-8 border border-surface-700/50">
            <h2 className="text-2xl font-bold text-white mb-2">Admin Access</h2>
            <p className="text-sm text-secondary mb-6">
                {step === 'email'
                    ? 'Enter your email to receive a login code.'
                    : `Enter the code sent to ${maskEmail(email)}`}
            </p>

            {step === 'email' && (
                <form onSubmit={handleSendCode} className="space-y-4">
                    <input
                        type="email"
                        placeholder="admin@example.com"
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
            )}

            {step === 'code' && (
                <form onSubmit={handleVerify} className="space-y-4">
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
                        {loading ? 'Verifying...' : 'Verify'}
                    </button>
                </form>
            )}
        </div>
    );
}
