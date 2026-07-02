import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import Roadmap from '@/components/Roadmap';
import StatsBar from '@/components/StatsBar';
import Newsletter from '@/components/Newsletter';
import Footer from '@/components/Footer';

export default function HomePage() {
    return (
        <>
            <Header />
            <Hero />
            <Features />
            <Roadmap />
            <StatsBar />
            <Newsletter />
            <Footer />
        </>
    );
}
