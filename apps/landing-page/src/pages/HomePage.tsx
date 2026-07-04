import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLoaderData, useParams, useLocation } from 'react-router-dom';
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
import { useAnalytics } from '@/hooks/useAnalytics';
import { useScrollDepth } from '@/hooks/useScrollDepth';
import { usePageTiming } from '@/hooks/usePageTiming';
import { useSectionVisibility } from '@/hooks/useSectionVisibility';

export async function loader({ params }: { params: { locale?: string } }): Promise<HomeSettings> {
  const locale = params.locale || 'en';
  return loadSettings(locale);
}

export default function HomePage() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const lang = locale || 'en';
  const settings = useLoaderData<typeof loader>();
  const location = useLocation();
  const { trackEvent } = useAnalytics(lang);

  const heroRef = useRef<HTMLDivElement>(null);
  const trustRef = useRef<HTMLDivElement>(null);
  const howRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const roadmapRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  useScrollDepth(trackEvent, location.pathname, lang);
  usePageTiming(trackEvent, location.pathname, lang);
  useSectionVisibility(
    trackEvent,
    [heroRef, trustRef, howRef, featuresRef, roadmapRef, statsRef],
    ['hero', 'trust_bar', 'how_it_works', 'features', 'roadmap', 'stats_bar'],
    lang,
  );

  return (
    <>
      <Seo title={t('seo.home_title')} description={t('seo.home_desc')} canonical={`/${lang}`} />
      <Header />
      <main id="main-content">
        <div ref={heroRef}><Hero hero={settings.hero} /></div>
        <div ref={trustRef}><TrustBar /></div>
        <div ref={howRef}><HowItWorks /></div>
        <div ref={featuresRef}><Features features={settings.features} /></div>
        <div ref={roadmapRef}><Roadmap /></div>
        <div ref={statsRef}><StatsBar /></div>
      </main>
      <Newsletter />
      <Footer social={settings.social} />
    </>
  );
}
