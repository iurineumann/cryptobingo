import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { validateEmail } from '@/lib/utils';
import { subscribe } from '@/lib/api';

export default function Newsletter() {
    const { t, i18n } = useTranslation();
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

    const liveRegion = status === 'error' ? message : '';

    return (
        <section className="py-20 bg-surface-900" aria-labelledby="newsletter-title">
            <div className="max-w-xl mx-auto px-4 text-center">
                <h2 id="newsletter-title" className="text-2xl sm:text-3xl font-bold text-white mb-3">
                    {t('newsletter.title')}
                </h2>
                <p className="text-secondary mb-8">
                    {t('newsletter.description')}
                </p>
                {status === 'success' ? (
                    <div className="bg-surface-800 rounded-xl border border-brand-500/20 p-8 max-w-md mx-auto" data-testid="newsletter-success" role="status" aria-live="polite">
                        <div className="w-16 h-16 bg-brand-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">🎉</span>
                        </div>
                        <p className="text-white font-semibold text-lg mb-2">{t('newsletter.thanks')}</p>
                        <p className="text-brand-300 text-sm font-medium mb-6">{t('newsletter.reward')}</p>
                        <a
                            href={i18n.language === 'pt' ? '/pt' : i18n.language === 'zh' ? '/zh' : '/'}
                            data-testid="newsletter-cta"
                            className="inline-flex items-center gap-2 bg-accent-400 text-surface-900 font-semibold px-6 py-3 rounded-xl hover:bg-accent-300 transition"
                        >
                            {t('newsletter.cta')}
                        </a>
                    </div>
                ) : (
                    <form
                        onSubmit={handleSubmit}
                        className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
                        aria-label={t('newsletter.title')}
                    >
                        <input
                            type="email"
                            placeholder={t('newsletter.placeholder')}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            aria-label={t('newsletter.placeholder')}
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
                    <p className="text-danger-400 text-sm mt-4" role="alert">{message}</p>
                )}
                <div aria-live="polite" aria-atomic="true" className="sr-only">{liveRegion}</div>
            </div>
        </section>
    );
}
