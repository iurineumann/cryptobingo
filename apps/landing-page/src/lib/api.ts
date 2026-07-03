import { validateEmail } from './utils';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Request failed');
    return body;
}

export type IdeaStatus = 'pending' | 'approved' | 'rejected' | 'implemented';

export interface Idea {
    id: number;
    title: string;
    description: string;
    author_name: string;
    author_email: string;
    upvotes: number;
    downvotes: number;
    status: IdeaStatus;
    created_at: string;
}

export interface Stats {
    total_ideas: number;
    total_votes: number;
    total_subscribers: number;
    approved_ideas: number;
    top_idea: { id: number; title: string; upvotes: number } | null;
}

export interface VoteResponse {
    message: string;
    code_expires_at?: string;
}

export interface ConfirmResponse {
    message: string;
}

export interface SubscribeResponse {
    message: string;
    token: string;
}

export interface AdminLoginResponse {
    message: string;
}

export interface AdminConfirmResponse {
    token: string;
    expires_at: string;
}

export async function getStats(): Promise<Stats> {
    return apiRequest<Stats>('/stats');
}

export async function getIdeas(sort?: string): Promise<Idea[]> {
    const qs = sort ? `?sort=${encodeURIComponent(sort)}` : '';
    return apiRequest<Idea[]>(`/ideas${qs}`);
}

export async function createIdea(data: {
    title: string;
    description: string;
    author_name: string;
    author_email: string;
}): Promise<Idea> {
    if (!validateEmail(data.author_email)) throw new Error('Invalid email');
    return apiRequest<Idea>('/ideas', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function requestVote(
    idea_id: number,
    email: string,
    vote_type: 'upvote' | 'downvote'
): Promise<VoteResponse> {
    if (!validateEmail(email)) throw new Error('Invalid email');
    return apiRequest<VoteResponse>('/ideas/vote', {
        method: 'POST',
        body: JSON.stringify({ idea_id, email, vote_type }),
    });
}

export async function confirmVote(
    email: string,
    code: string
): Promise<ConfirmResponse> {
    return apiRequest<ConfirmResponse>('/votes/confirm', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
    });
}

export async function subscribe(email: string): Promise<SubscribeResponse> {
    if (!validateEmail(email)) throw new Error('Invalid email');
    return apiRequest<SubscribeResponse>('/subscribe', {
        method: 'POST',
        body: JSON.stringify({ email }),
    });
}

export function getAdminToken(): string | null {
    return localStorage.getItem('cb_admin_token');
}

export async function adminLogin(email: string): Promise<AdminLoginResponse> {
    if (!validateEmail(email)) throw new Error('Invalid email');
    return apiRequest<AdminLoginResponse>('/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email }),
    });
}

export async function adminConfirm(
    email: string,
    code: string
): Promise<AdminConfirmResponse> {
    const result = await apiRequest<AdminConfirmResponse>('/admin/confirm', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
    });
    localStorage.setItem('cb_admin_token', result.token);
    return result;
}

export async function adminUpdateIdeaStatus(
    ideaId: number,
    status: IdeaStatus
): Promise<Idea> {
    const token = getAdminToken();
    if (!token) throw new Error('Not authenticated');
    return apiRequest<Idea>(`/admin/ideas/${ideaId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
}

export async function adminSendNewsletter(
    subject: string,
    body: string
): Promise<{ sent: number; failed: number }> {
    const token = getAdminToken();
    if (!token) throw new Error('Not authenticated');
    return apiRequest<{ sent: number; failed: number }>('/admin/newsletter', {
        method: 'POST',
        body: JSON.stringify({ subject, body }),
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    });
}
