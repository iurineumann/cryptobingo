import { query, queryOne } from './db.js';
import type {
  Idea, Vote, Confirmation, AdminSession, Subscriber, SiteStats,
  Newsletter, NewsletterRecipient,
} from './types.js';

export async function getStats(): Promise<SiteStats> {
  const rows = await query<{
    total_ideas: number;
    total_votes: number;
    total_subscribers: number;
    approved_ideas: number;
  }>(
    `SELECT
      (SELECT COUNT(*) FROM ideas)::int AS total_ideas,
      (SELECT COUNT(*) FROM votes)::int AS total_votes,
      (SELECT COUNT(*) FROM subscribers WHERE active = true)::int AS total_subscribers,
      (SELECT COUNT(*) FROM ideas WHERE status = 'approved')::int AS approved_ideas`
  );
  const top = await queryOne<{ id: number; title: string; upvotes: number }>(
    `SELECT id, title, upvotes FROM ideas ORDER BY upvotes DESC LIMIT 1`
  );
  return { ...rows[0], top_idea: top ?? null };
}

export async function getIdeas(sort: string = 'newest'): Promise<Idea[]> {
  const order =
    sort === 'top'
      ? 'ORDER BY (upvotes - downvotes) DESC, created_at DESC'
      : 'ORDER BY created_at DESC';
  return query<Idea>(`SELECT * FROM ideas ${order}`);
}

export async function createIdea(data: {
  title: string;
  description: string;
  author_name: string;
  author_email: string;
}): Promise<Idea> {
  const idea = await queryOne<Idea>(
    `INSERT INTO ideas (title, description, author_name, author_email)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.title, data.description, data.author_name, data.author_email]
  );
  if (!idea) throw new Error('Failed to create idea');
  return idea;
}

export async function getIdeaById(id: number): Promise<Idea | null> {
  return queryOne<Idea>('SELECT * FROM ideas WHERE id = $1', [id]);
}

export async function updateIdeaStatus(
  id: number,
  status: string
): Promise<Idea | null> {
  return queryOne<Idea>(
    `UPDATE ideas SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );
}

export async function createConfirmation(data: {
  email: string;
  code: string;
  purpose: 'vote' | 'admin';
  metadata?: Record<string, unknown>;
}): Promise<Confirmation> {
  const c = await queryOne<Confirmation>(
    `INSERT INTO confirmations (email, code, purpose, metadata, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '15 minutes') RETURNING *`,
    [data.email, data.code, data.purpose, data.metadata ?? null]
  );
  if (!c) throw new Error('Failed to create confirmation');
  return c;
}

export async function consumeConfirmation(
  email: string,
  code: string,
  purpose: string
): Promise<Confirmation | null> {
  return queryOne<Confirmation>(
    `UPDATE confirmations
     SET used = true
     WHERE email = $1 AND code = $2 AND purpose = $3
       AND used = false AND expires_at > NOW()
     RETURNING *`,
    [email, code, purpose]
  );
}

export async function upsertVote(
  ideaId: number,
  email: string,
  type: 'upvote' | 'downvote'
): Promise<void> {
  await query(
    `INSERT INTO votes (idea_id, email, vote_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (idea_id, email)
     DO UPDATE SET vote_type = $3, created_at = NOW()`,
    [ideaId, email, type]
  );
  await query(
    `UPDATE ideas
     SET upvotes = (SELECT COUNT(*) FROM votes WHERE idea_id = $1 AND vote_type = 'upvote')::int,
         downvotes = (SELECT COUNT(*) FROM votes WHERE idea_id = $1 AND vote_type = 'downvote')::int
     WHERE id = $1`,
    [ideaId]
  );
}

export async function getExistingVote(
  ideaId: number,
  email: string
): Promise<Vote | null> {
  return queryOne<Vote>(
    'SELECT * FROM votes WHERE idea_id = $1 AND email = $2',
    [ideaId, email]
  );
}

export async function createAdminSession(
  email: string
): Promise<AdminSession> {
  const s = await queryOne<AdminSession>(
    `INSERT INTO admin_sessions (email, expires_at)
     VALUES ($1, NOW() + INTERVAL '24 hours') RETURNING *`,
    [email]
  );
  if (!s) throw new Error('Failed to create session');
  return s;
}

export async function getAdminSessionByToken(
  token: string
): Promise<AdminSession | null> {
  // Token malformado (não-UUID) é falha de autenticação, não erro de banco.
  // Valida antes de consultar para não disparar string_to_uuid no PG (500).
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      token
    );
  if (!uuid) return null;
  return queryOne<AdminSession>(
    `SELECT * FROM admin_sessions
     WHERE token = $1 AND expires_at > NOW()`,
    [token]
  );
}

export async function subscribe(
  email: string
): Promise<Subscriber> {
  const existing = await queryOne<Subscriber>(
    `SELECT * FROM subscribers WHERE email = $1`,
    [email]
  );
  if (existing) {
    if (!existing.active) {
      await query(
        `UPDATE subscribers SET active = true, unsubscribed_at = NULL WHERE email = $1`,
        [email]
      );
    }
    return { ...existing, active: true, unsubscribed_at: null };
  }
  const s = await queryOne<Subscriber>(
    `INSERT INTO subscribers (email) VALUES ($1) RETURNING *`,
    [email]
  );
  if (!s) throw new Error('Failed to subscribe');
  return s;
}

export async function unsubscribe(
  token: string
): Promise<boolean> {
  const result = await query(
    `UPDATE subscribers
     SET active = false, unsubscribed_at = NOW()
     WHERE token = $1 AND active = true`,
    [token]
  );
  return (result as unknown as { rowCount: number }).rowCount > 0;
}

export async function getActiveSubscribers(): Promise<Subscriber[]> {
  return query<Subscriber>(
    `SELECT * FROM subscribers WHERE active = true`
  );
}

export async function getSubscribersPage(
  limit: number,
  offset: number
): Promise<{ subscribers: Subscriber[]; total: number }> {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const safeOffset = Math.max(0, offset);
  const subscribers = await query<Subscriber>(
    `SELECT * FROM subscribers ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [safeLimit, safeOffset]
  );
  const count = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM subscribers`
  );
  return { subscribers, total: count?.count ?? 0 };
}

export async function logEmail(
  to: string,
  subject: string,
  purpose: string,
  status: string = 'sent',
  errorMsg?: string | null,
): Promise<void> {
  await query(
    `INSERT INTO email_log (to_email, subject, purpose, status, error_msg) VALUES ($1, $2, $3, $4, $5)`,
    [to, subject, purpose, status, errorMsg ?? null],
  );
}

export async function saveNewsletter(
  subject: string,
  body: string
): Promise<number> {
  const row = await queryOne<{ id: number }>(
    `INSERT INTO newsletters (subject, body, sent_at, sent_count)
     VALUES ($1, $2, NOW(), 0) RETURNING id`,
    [subject, body]
  );
  if (!row) throw new Error('Failed to save newsletter');
  return row.id;
}

export async function getNewsletters(): Promise<Newsletter[]> {
  return query<Newsletter>(
    `SELECT id, subject, body, created_at, sent_at, sent_count
     FROM newsletters ORDER BY sent_at DESC NULLS LAST, created_at DESC`
  );
}

export async function getNewsletterRecipients(
  newsletterId: number
): Promise<NewsletterRecipient[]> {
  return query<NewsletterRecipient>(
    `SELECT s.email, s.token,
            CASE WHEN ns.id IS NOT NULL THEN true ELSE false END AS received
     FROM subscribers s
     LEFT JOIN newsletter_sends ns
       ON ns.newsletter_id = $1 AND ns.subscriber_email = s.email
     WHERE s.active = true
     ORDER BY s.email`,
    [newsletterId]
  );
}

export async function recordNewsletterSend(
  newsletterId: number,
  email: string,
  token: string | null,
  status: string
): Promise<void> {
  await query(
    `INSERT INTO newsletter_sends (newsletter_id, subscriber_email, subscriber_token, status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (newsletter_id, subscriber_email)
     DO UPDATE SET status = EXCLUDED.status, sent_at = NOW()`,
    [newsletterId, email, token, status]
  );
}

export async function updateNewsletterSentCount(
  newsletterId: number,
  count: number
): Promise<void> {
  await query(
    `UPDATE newsletters SET sent_count = $1 WHERE id = $2`,
    [count, newsletterId]
  );
}

export async function getNewsletterById(
  id: number
): Promise<Newsletter | null> {
  return queryOne<Newsletter>(
    `SELECT id, subject, body, created_at, sent_at, sent_count
     FROM newsletters WHERE id = $1`,
    [id]
  );
}

export async function getPendingRecipients(
  newsletterId: number
): Promise<{ email: string; token: string | null }[]> {
  return query<{ email: string; token: string | null }>(
    `SELECT s.email, s.token
     FROM subscribers s
     WHERE s.active = true
       AND NOT EXISTS (
         SELECT 1 FROM newsletter_sends ns
         WHERE ns.newsletter_id = $1 AND ns.subscriber_email = s.email
       )
     ORDER BY s.email`,
    [newsletterId]
  );
}
