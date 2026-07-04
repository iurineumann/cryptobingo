import { useTranslation } from 'react-i18next';
import { useLoaderData, useParams } from 'react-router-dom';
import { loadSettings } from '../../lib/content';
import type { HomeSettings } from '../../lib/content';
import Seo from '@/components/Seo';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import TrustBar from '@/components/TrustBar';
import HowItWorks from '@/components/HowItWorks';
import Features from '@/components/Features';
import Roadmap from '@/components/Roadmap';
import StatsBar from '@/components/StatsBar';
import Newsletter from '@/components/Newsletter';
import Footer from '@/components/Footer';

export async function loader({ params }: { params: { locale?: string } }): Promise<HomeSettings> {
  const locale = params.locale || 'en';
  return loadSettings(locale);
}

export default function HomePage() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const lang = locale || 'en';
  const settings = useLoaderData<typeof loader>();

  return (
    <>
      <Seo title={t('seo.home_title')} description={t('seo.home_desc')} canonical={`/${lang}`} />
      <Header />
      <main id="main-content">
        <Hero hero={settings.hero} />
        <TrustBar />
        <HowItWorks />
        <Features features={settings.features} />
        <Roadmap />
        <StatsBar />
      </main>
      <Newsletter />
      <Footer social={settings.social} />
    </>
  );
}
