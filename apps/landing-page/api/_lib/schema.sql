-- Migration: landing page schema
-- Run against Aiven PostgreSQL once manually

CREATE TABLE IF NOT EXISTS subscribers (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    token UUID DEFAULT gen_random_uuid(),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    unsubscribed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ideas (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    author_name VARCHAR(100) NOT NULL,
    author_email VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'implemented')),
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
    id SERIAL PRIMARY KEY,
    idea_id INTEGER REFERENCES ideas(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    vote_type VARCHAR(10) CHECK (vote_type IN ('upvote', 'downvote')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(idea_id, email)
);

CREATE TABLE IF NOT EXISTS confirmations (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('vote', 'admin')),
    metadata JSONB,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token UUID DEFAULT gen_random_uuid(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_log (
    id SERIAL PRIMARY KEY,
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    purpose VARCHAR(50),
    status VARCHAR(20) DEFAULT 'sent',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
CREATE INDEX IF NOT EXISTS idx_ideas_created ON ideas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_votes_idea ON votes(idea_id);
CREATE INDEX IF NOT EXISTS idx_confirmations_email ON confirmations(email);
CREATE INDEX IF NOT EXISTS idx_confirmations_purpose ON confirmations(purpose);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token);
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
