import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { trackEvent } from '@/services/analytics';
import type { FAQEntry } from '../../lib/content';

interface FAQSectionProps {
  items: FAQEntry[];
  title?: string;
  locale?: string;
  storageKey?: string;
}

interface FAQSchema {
  '@context': string;
  '@type': string;
  mainEntity: Array<{
    '@type': string;
    name: string;
    acceptedAnswer: {
      '@type': string;
      text: string;
    };
  }>;
}

function loadOpenItems(key: string): Set<number> {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return new Set();
    return new Set(JSON.parse(saved));
  } catch {
    return new Set();
  }
}

function saveOpenItems(key: string, items: Set<number>) {
  try {
    localStorage.setItem(key, JSON.stringify([...items]));
  } catch {
  }
}

export function FAQSection({ items, locale, storageKey }: FAQSectionProps) {
  const { t } = useTranslation();
  const key = storageKey || 'faq-open-default';

  const [openItems, setOpenItems] = useState<Set<number>>(() => loadOpenItems(key));

  useEffect(() => {
    saveOpenItems(key, openItems);
  }, [openItems, key]);

  const toggle = useCallback((idx: number, question: string) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      const isOpen = next.has(idx);
      if (isOpen) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      trackEvent('faq_toggle', { question, action: isOpen ? 'close' : 'open', locale });
      return next;
    });
  }, [locale]);

  const schema: FAQSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <section data-testid="faq-section" className="mt-12 pt-8 border-t border-gray-800">
      <h2 className="text-2xl font-bold text-white mb-6">{t('faq.title')}</h2>
      <script
        data-testid="faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <dl className="space-y-4">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="border border-gray-700 rounded-lg overflow-hidden"
          >
            <dt>
              <button
                data-testid="faq-question"
                onClick={() => toggle(idx, item.question)}
                className="w-full flex items-center justify-between px-5 py-4 text-left text-white font-medium hover:bg-surface-800 transition-colors"
                aria-expanded={openItems.has(idx)}
              >
                <span>{item.question}</span>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    openItems.has(idx) ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </dt>
            {openItems.has(idx) && (
              <dd
                data-testid={`faq-answer-${idx}`}
                className="px-5 pb-4 text-gray-400 leading-relaxed"
              >
                {item.answer}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}
