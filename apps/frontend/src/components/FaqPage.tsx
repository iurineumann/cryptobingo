// apps/frontend/src/components/FaqPage.tsx
// Página de perguntas frequentes — estática, i18n, sem autenticação. Ref: ADR-024.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface FaqEntry {
    question: string;
    answer:   string;
}

export default function FaqPage() {
    const { t } = useTranslation();
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const items: FaqEntry[] = t('faq.items', { returnObjects: true }) as FaqEntry[];

    return (
        <div
            data-testid="faq-page"
            style={{ maxWidth: '760px', margin: '0 auto', padding: '2rem 1rem' }}
        >
            <h1
                data-testid="faq-title"
                style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--cb-text-primary)' }}
            >
                {t('faq.title')}
            </h1>
            <p style={{ color: 'var(--cb-text-secondary)', marginBottom: '2rem' }}>
                {t('faq.subtitle')}
            </p>

            <div data-testid="faq-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {Array.isArray(items) && items.map((item, idx) => (
                    <div
                        key={idx}
                        data-testid={`faq-item-${idx}`}
                        style={{
                            border: '1px solid var(--cb-border)',
                            borderRadius: '0.5rem',
                            overflow: 'hidden',
                            background: 'var(--cb-bg-card)',
                        }}
                    >
                        <button
                            data-testid={`faq-question-${idx}`}
                            onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                            aria-expanded={openIndex === idx}
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '1rem 1.25rem',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '0.95rem',
                                color: 'var(--cb-text-primary)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '1rem',
                            }}
                        >
                            <span>{item.question}</span>
                            <span style={{ flexShrink: 0, fontSize: '1.1rem', color: 'var(--cb-text-secondary)' }}>
                                {openIndex === idx ? '−' : '+'}
                            </span>
                        </button>

                        {openIndex === idx && (
                            <div
                                data-testid={`faq-answer-${idx}`}
                                style={{
                                    padding: '0 1.25rem 1rem',
                                    color: 'var(--cb-text-secondary)',
                                    lineHeight: '1.6',
                                    fontSize: '0.9rem',
                                }}
                            >
                                {item.answer}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
