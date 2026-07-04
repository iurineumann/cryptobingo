import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';

export default function WhitepaperPage() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const lang = locale || 'en';

  return (
    <>
      <Seo title={t('seo.whitepaper_title')} description={t('seo.whitepaper_desc')} canonical={`/${lang}/whitepaper`} />
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-8">
          {t('seo.whitepaper_title')}
        </h1>
        <p className="text-slate-400">{t('whitepaper.coming_soon')}</p>
      </main>
      <Footer />
    </>
  );
}
