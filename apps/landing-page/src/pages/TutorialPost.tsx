import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';

export default function TutorialPost() {
  const { t } = useTranslation();
  const { locale, slug } = useParams();
  const lang = locale || 'en';

  return (
    <>
      <Seo title={t('seo.tutorials_title')} description="" canonical={`/${lang}/tutorials/${slug}`} />
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-8">{slug}</h1>
        <p className="text-slate-400">{t('tutorials.coming_soon')}</p>
      </main>
      <Footer />
    </>
  );
}
