import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { validateEmail } from '@/lib/utils';
import { subscribe } from '@/lib/api';

export default function Newsletter() {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<
        'idle' | 'loading' | 'success' | 'error'
    >('idle');
    const [message, setMessage] = useState('');

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!validateEmail(email)) {
            setStatus('error');
            setMessage(t('newsletter.invalid_email'));
            return;
        }
        setStatus('loading');
        try {
            await subscribe(email);
            setStatus('success');
            setMessage(t('newsletter.thanks'));
        } catch (err) {
            setStatus('error');
            setMessage(
                err instanceof Error ? err.message : t('newsletter.error')
            );
        }
    }

    return (
        <section className="py-20 bg-surface-900">
            <div className="max-w-xl mx-auto px-4 text-center">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                    {t('newsletter.title')}
                </h2>
                <p className="text-secondary mb-8">
                    {t('newsletter.description')}
                </p>
                {status === 'success' ? (
                    <p className="text-success-400 font-medium">
                        {message}
                    </p>
                ) : (
                    <form
                        onSubmit={handleSubmit}
                        className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
                    >
                        <input
                            type="email"
                            placeholder={t('newsletter.placeholder')}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="flex-1 px-4 py-3 rounded-xl bg-surface-800 border border-surface-600 text-white placeholder:text-tertiary focus:outline-none focus:border-brand-500"
                        />
                        <button
                            type="submit"
                            disabled={status === 'loading'}
                            className="bg-accent-400 text-surface-900 font-semibold px-6 py-3 rounded-xl hover:bg-accent-300 transition disabled:opacity-50 whitespace-nowrap"
                        >
                            {status === 'loading' ? t('newsletter.sending') : t('newsletter.submit')}
                        </button>
                    </form>
                )}
                {status === 'error' && (
                    <p className="text-danger-400 text-sm mt-4">{message}</p>
                )}
            </div>
        </section>
    );
}
