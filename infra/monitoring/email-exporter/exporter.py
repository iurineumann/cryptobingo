#!/usr/bin/env python3
"""Exporter Prometheus mínimo para métricas de email_log (db cryptobingo).

Substitui o postgres-exporter com queries custom (que não carregava na v0.15.0).
Expõe as séries esperadas pelo dashboard infra-email-app:
  pg_cryptobingo_email_log_total
  pg_cryptobingo_email_log_by_status{status=...}
  pg_cryptobingo_email_log_by_purpose{purpose=...}
  pg_cryptobingo_email_log_by_status_purpose{status=..., purpose=...}
  pg_cryptobingo_email_log_failed_recent
  pg_cryptobingo_email_log_sent_today

Conexão via env: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD.
"""
import os
import time

import psycopg2
from prometheus_client import Gauge, start_http_server

POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "15"))
PORT = int(os.getenv("PORT", "9188"))

DB = dict(
    host=os.getenv("PGHOST", "postgres"),
    port=os.getenv("PGPORT", "5432"),
    dbname=os.getenv("PGDATABASE", "cryptobingo"),
    user=os.getenv("PGUSER", "cryptobingo"),
    password=os.getenv("PGPASSWORD", ""),
)

M_TOTAL = Gauge("pg_cryptobingo_email_log_total", "Total de e-mails no email_log")
M_BY_STATUS = Gauge(
    "pg_cryptobingo_email_log_by_status",
    "Contagem de e-mails por status",
    ["status"],
)
M_BY_PURPOSE = Gauge(
    "pg_cryptobingo_email_log_by_purpose",
    "Contagem de e-mails por propósito",
    ["purpose"],
)
M_BY_STATUS_PURPOSE = Gauge(
    "pg_cryptobingo_email_log_by_status_purpose",
    "Contagem de e-mails por status e propósito",
    ["status", "purpose"],
)
M_FAILED_RECENT = Gauge(
    "pg_cryptobingo_email_log_failed_recent",
    "E-mails com falha na última hora",
)
M_SENT_TODAY = Gauge(
    "pg_cryptobingo_email_log_sent_today",
    "E-mails enviados hoje",
)


def _query(sql, params=None):
    with psycopg2.connect(**DB) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()


def collect():
    try:
        total = _query("SELECT COALESCE(count(*), 0) FROM email_log")[0][0]
        M_TOTAL.set(total)
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] total: {exc}", flush=True)
        M_TOTAL.set(0)

    try:
        for status, cnt in _query(
            "SELECT status, COALESCE(count(*), 0) FROM email_log GROUP BY status"
        ):
            M_BY_STATUS.labels(status or "unknown").set(cnt)
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] by_status: {exc}", flush=True)

    try:
        for purpose, cnt in _query(
            "SELECT purpose, COALESCE(count(*), 0) FROM email_log GROUP BY purpose"
        ):
            M_BY_PURPOSE.labels(purpose or "unknown").set(cnt)
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] by_purpose: {exc}", flush=True)

    try:
        for status, purpose, cnt in _query(
            "SELECT status, purpose, COALESCE(count(*), 0) FROM email_log "
            "GROUP BY status, purpose"
        ):
            M_BY_STATUS_PURPOSE.labels(status or "unknown", purpose or "unknown").set(cnt)
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] by_status_purpose: {exc}", flush=True)

    try:
        failed = _query(
            "SELECT COALESCE(count(*), 0) FROM email_log "
            "WHERE status = 'failed' AND created_at > NOW() - INTERVAL '1 hour'"
        )[0][0]
        M_FAILED_RECENT.set(failed)
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] failed_recent: {exc}", flush=True)

    try:
        sent = _query(
            "SELECT COALESCE(count(*), 0) FROM email_log "
            "WHERE status = 'sent' AND created_at > CURRENT_DATE"
        )[0][0]
        M_SENT_TODAY.set(sent)
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] sent_today: {exc}", flush=True)


def main():
    start_http_server(PORT)
    print(f"[info] email-exporter ouvindo em :{PORT}", flush=True)
    while True:
        collect()
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
