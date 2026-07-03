import { useState, useEffect } from 'react';
import Seo from '@/components/Seo';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StatsBar from '@/components/StatsBar';
import IdeaList from '@/components/IdeaList';
import IdeaSubmitForm from '@/components/IdeaSubmitForm';
import VoteModal from '@/components/VoteModal';
import { getIdeas, type Idea } from '@/lib/api';

export default function IdeasPage() {
    const [ideas, setIdeas] = useState<Idea[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [showVoteModal, setShowVoteModal] = useState(false);
    const [voteIdeaId, setVoteIdeaId] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getIdeas()
            .then((data) => {
                if (!cancelled) setIdeas(data);
            })
            .catch((err) => {
                if (!cancelled) setError(err.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [refreshKey]);

    function handleVoteClick(ideaId: number) {
        setVoteIdeaId(ideaId);
        setShowVoteModal(true);
    }

    function handleVoteClose() {
        setShowVoteModal(false);
        setVoteIdeaId(null);
    }

    function handleSubmitSuccess() {
        setRefreshKey((k) => k + 1);
    }

    function renderIdeas() {
        if (loading) return <p className="text-secondary">Loading ideas...</p>;
        if (error) return <p className="text-red-400">{error}</p>;
        return <IdeaList ideas={ideas} onVote={handleVoteClick} loading={loading} />;
    }

    return (
        <>
            <Seo title="Fórum de Ideias" description="Compartilhe ideias para o CryptoBingo e vote em propostas da comunidade. As ideias mais populares viram realidade." canonical="/ideas" />
            <Header />
            <StatsBar />
            <main className="mx-auto max-w-6xl px-4 py-16">
                <h1 className="text-4xl font-bold text-primary">Ideas Forum</h1>
                <p className="mt-3 max-w-2xl text-lg text-secondary">
                    Share your ideas for CryptoBingo and vote on proposals from the
                    community. The most popular ideas make it onto our roadmap.
                </p>
                <div className="mt-12">
                    <IdeaSubmitForm onSubmit={handleSubmitSuccess} />
                </div>
                <section className="mt-16">
                    {renderIdeas()}
                </section>
            </main>
            {showVoteModal && voteIdeaId !== null && (
                <VoteModal
                    isOpen={showVoteModal}
                    ideaId={voteIdeaId}
                    onClose={handleVoteClose}
                />
            )}
            <Footer />
        </>
    );
}
