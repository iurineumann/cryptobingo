import { useLoaderData } from 'react-router-dom';
import type { Route } from '../app/+types/home';
import { loadSettings } from '../../lib/content';
import type { HomeSettings } from '../../lib/content';
import Seo from '@/components/Seo';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import Roadmap from '@/components/Roadmap';
import StatsBar from '@/components/StatsBar';
import Newsletter from '@/components/Newsletter';
import Footer from '@/components/Footer';

export async function loader(): Promise<HomeSettings> {
  return loadSettings();
}

export default function HomePage() {
  const settings = useLoaderData<typeof loader>();

  return (
    <>
      <Seo title="Bingo On-Chain na WAX" description="Jogue Bingo descentralizado na blockchain WAX. Prêmios em WAX e NFTs, transparência on-chain e comunidade." canonical="" />
      <Header />
      <Hero hero={settings.hero} />
      <Features features={settings.features} />
      <Roadmap />
      <StatsBar />
      <Newsletter />
      <Footer social={settings.social} />
    </>
  );
}
