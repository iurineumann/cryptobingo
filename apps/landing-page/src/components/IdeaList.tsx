import { Lightbulb } from 'lucide-react';
import IdeaCard from './IdeaCard';
import type { Idea } from '@/lib/api';

interface IdeaListProps {
    readonly ideas: Idea[];
    readonly onVote: (id: number, type: 'upvote' | 'downvote') => void;
    readonly loading?: boolean;
}

function Skeleton() {
    return (
        <div className="bg-surface-750 rounded-xl h-32 animate-pulse" />
    );
}

export default function IdeaList({ ideas, onVote, loading }: IdeaListProps) {
    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton />
                <Skeleton />
                <Skeleton />
            </div>
        );
    }

    if (ideas.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <Lightbulb className="text-tertiary mb-4" size={40} />
                <p className="text-secondary text-lg">No ideas yet. Be the first to share!</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {ideas.map((idea) => (
                <IdeaCard key={idea.id} idea={idea} onVote={onVote} />
            ))}
        </div>
    );
}
