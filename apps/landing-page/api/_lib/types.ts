export interface Subscriber {
  id: number;
  email: string;
  token: string;
  active: boolean;
  created_at: string;
  unsubscribed_at: string | null;
}

export interface Idea {
  id: number;
  title: string;
  description: string;
  author_name: string;
  author_email: string;
  status: 'pending' | 'approved' | 'rejected' | 'implemented';
  upvotes: number;
  downvotes: number;
  created_at: string;
}

export interface Vote {
  id: number;
  idea_id: number;
  email: string;
  vote_type: 'upvote' | 'downvote';
  created_at: string;
}

export interface Confirmation {
  id: number;
  email: string;
  code: string;
  purpose: 'vote' | 'admin';
  metadata: Record<string, unknown> | null;
  expires_at: string;
  used: boolean;
  created_at: string;
}

export interface AdminSession {
  id: number;
  email: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface EmailLog {
  id: number;
  to_email: string;
  subject: string | null;
  purpose: string | null;
  status: string;
  created_at: string;
}

export interface SiteStats {
  total_ideas: number;
  total_votes: number;
  total_subscribers: number;
  approved_ideas: number;
  top_idea: { id: number; title: string; upvotes: number } | null;
}

export interface Newsletter {
  id: number;
  subject: string;
  body: string;
  created_at: string;
  sent_at: string | null;
  sent_count: number;
}

export interface NewsletterRecipient {
  email: string;
  token: string | null;
  received: boolean;
}
