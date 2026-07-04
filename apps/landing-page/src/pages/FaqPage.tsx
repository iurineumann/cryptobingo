import { useTranslation } from 'react-i18next';
import { useLoaderData, useParams } from 'react-router-dom';
import { loadFAQItems } from '../../lib/content';
import type { FAQItem } from '../../lib/content';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';

export async function loader({ params }: { params: { locale?: string } }): Promise<{ items: FAQItem[] }> {
  const locale = params.locale || 'en';
  return { items: loadFAQItems(locale) };
}

export default function FaqPage() {
  const { t } = useTranslation();
  const { items } = useLoaderData<typeof loader>();
  const { locale } = useParams();
  const lang = locale || 'en';

  return (
    <>
      <Seo title={t('faq.title')} description={t('faq.description')} canonical={`/${lang}/faq`} />
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
          {t('faq.title')}
        </h1>
        <p className="text-slate-400 mb-12">
          {t('faq.description')}
        </p>
        <div className="space-y-4">
          {items.map((item) => (
            <details
              key={item.slug}
              className="group bg-surface-800 rounded-xl border border-surface-700/50 overflow-hidden"
            >
              <summary className="flex items-center justify-between p-5 cursor-pointer hover:bg-surface-750 transition-colors list-none">
                <span className="text-white font-medium pr-4">
                  {item.question}
                </span>
                <span className="text-slate-400 group-open:rotate-180 transition-transform shrink-0">
                  ▼
                </span>
              </summary>
              <div className="px-5 pb-5 text-slate-300 leading-relaxed text-sm border-t border-surface-700/50 pt-4 mt-0">
                {item.answer.split('\n').map((p, i) => (
                  <p key={i} className="mb-2 last:mb-0">{p}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
