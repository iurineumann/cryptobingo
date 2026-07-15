-- Migration: cria tabelas newsletters e newsletter_sends para persistência de envios
CREATE TABLE IF NOT EXISTS newsletters (
  id BIGSERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  sent_count INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS newsletter_sends (
  id BIGSERIAL PRIMARY KEY,
  newsletter_id BIGINT NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
  subscriber_email TEXT NOT NULL,
  subscriber_token TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(newsletter_id, subscriber_email)
);
