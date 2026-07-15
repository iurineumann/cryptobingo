-- Migration: adiciona colunas status e error_msg à tabela email_log (db cryptobingo)
-- Contexto: tabela estava vazia, colunas já devem existir se recriada. Safe para reaplicar.

ALTER TABLE email_log
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS error_msg TEXT;

-- Garantir que coluna type foi renomeada para purpose (pode ser tabela nova)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_log' AND column_name = 'type'
  ) THEN
    ALTER TABLE email_log RENAME COLUMN type TO purpose;
  END IF;
END $$;

-- Garantir que coluna recipient foi renomeada para to_email
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'email_log' AND column_name = 'recipient'
  ) THEN
    ALTER TABLE email_log RENAME COLUMN recipient TO to_email;
  END IF;
END $$;

-- Índice para queries do postgres-exporter
CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log (status);
CREATE INDEX IF NOT EXISTS idx_email_log_purpose ON email_log (purpose);
