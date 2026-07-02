import { useState, type FormEvent } from 'react';
import { createIdea } from '@/lib/api';
import { cn } from '@/lib/utils';

interface IdeaSubmitFormProps {
    readonly onSubmit: () => void;
}

interface FormData {
    author_name: string;
    author_email: string;
    title: string;
    description: string;
}

const initialForm: FormData = {
    author_name: '',
    author_email: '',
    title: '',
    description: '',
};

export default function IdeaSubmitForm({ onSubmit }: IdeaSubmitFormProps) {
    const [form, setForm] = useState<FormData>(initialForm);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function setField(field: keyof FormData, value: string) {
        setForm((prev) => ({ ...prev, [field]: value }));
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setSuccess(false);

        const trimmed = {
            author_name: form.author_name.trim(),
            author_email: form.author_email.trim(),
            title: form.title.trim(),
            description: form.description.trim(),
        };

        if (!trimmed.author_name || !trimmed.author_email || !trimmed.title || !trimmed.description) {
            setError('All fields are required.');
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.author_email)) {
            setError('Please enter a valid email address.');
            return;
        }

        setLoading(true);

        try {
            await createIdea(trimmed);
            setSuccess(true);
            setForm(initialForm);
            onSubmit();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    }

    if (success) {
        return (
            <div className="bg-surface-800 rounded-xl p-6 border border-surface-700/50">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-500/10 text-green-400 shrink-0">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </span>
                        <p className="text-green-400 text-sm font-medium">
                            Idea submitted! Check your email to verify.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSuccess(false)}
                        className="text-tertiary hover:text-white transition text-sm"
                    >
                        OK
                    </button>
                </div>
            </div>
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="bg-surface-800 rounded-xl p-6 border border-surface-700/50"
        >
            <h3 className="text-lg font-semibold text-white mb-4">Submit an Idea</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                    type="text"
                    placeholder="Your name"
                    value={form.author_name}
                    onChange={(e) => setField('author_name', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-surface-900 border border-surface-600 text-white placeholder:text-tertiary focus:outline-none focus:border-brand-500 text-sm"
                />
                <input
                    type="email"
                    placeholder="Your email"
                    value={form.author_email}
                    onChange={(e) => setField('author_email', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-surface-900 border border-surface-600 text-white placeholder:text-tertiary focus:outline-none focus:border-brand-500 text-sm"
                />
                <input
                    type="text"
                    placeholder="Idea title"
                    value={form.title}
                    onChange={(e) => setField('title', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-surface-900 border border-surface-600 text-white placeholder:text-tertiary focus:outline-none focus:border-brand-500 text-sm col-span-full"
                />
                <textarea
                    rows={3}
                    placeholder="Describe your idea..."
                    value={form.description}
                    onChange={(e) => setField('description', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-surface-900 border border-surface-600 text-white placeholder:text-tertiary focus:outline-none focus:border-brand-500 text-sm col-span-full resize-none"
                />
            </div>

            {error && (
                <div className="mt-4 flex items-center gap-2 text-red-400 text-sm">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className={cn(
                    'mt-5 bg-brand-600 text-white px-6 py-2.5 rounded-lg font-medium transition',
                    'hover:bg-brand-500 disabled:opacity-50'
                )}
            >
                {loading ? 'Submitting...' : 'Submit Idea'}
            </button>
        </form>
    );
}
