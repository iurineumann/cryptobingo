import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Idea } from '@/lib/api';

const statusStyles: Record<Idea['status'], string> = {
    pending: 'bg-yellow-500/10 text-yellow-400',
    approved: 'bg-green-500/10 text-green-400',
    rejected: 'bg-red-500/10 text-red-400',
    implemented: 'bg-brand-500/10 text-brand-300',
};

interface IdeaCardProps {
    idea: Idea;
    onVote: (id: number, type: 'upvote' | 'downvote') => void;
    isVoting?: boolean;
}

export default function IdeaCard({ idea, onVote, isVoting }: IdeaCardProps) {
    function createdDate() {
        return new Date(idea.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    return (
        <div className="bg-surface-800 rounded-xl p-5 border border-surface-700/50 shadow-card">
            <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-white">{idea.title}</h3>
                <span className={cn('inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', statusStyles[idea.status])}>
                    {idea.status.replace('_', ' ')}
                </span>
            </div>
            <p className="text-sm text-secondary mt-2 line-clamp-3">{idea.description}</p>
            <p className="text-xs text-tertiary mt-3">by {idea.author_name}</p>
            <div className="flex justify-between items-center mt-4">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        disabled={isVoting}
                        onClick={() => onVote(idea.id, 'upvote')}
                        className={cn(
                            'flex items-center gap-1.5 text-sm text-tertiary transition',
                            'hover:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                    >
                        <ThumbsUp size={16} />
                        {idea.upvotes}
                    </button>
                    <button
                        type="button"
                        disabled={isVoting}
                        onClick={() => onVote(idea.id, 'downvote')}
                        className={cn(
                            'flex items-center gap-1.5 text-sm text-tertiary transition',
                            'hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                    >
                        <ThumbsDown size={16} />
                        {idea.downvotes}
                    </button>
                </div>
                <span className="text-xs text-tertiary">{createdDate()}</span>
            </div>
        </div>
    );
}
