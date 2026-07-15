# Exporter próprio de métricas de email_log (db cryptobingo).
# Substitui o postgres-exporter com queries custom (não carregava na v0.15.0).
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY exporter.py .
# psycopg2 precisa de libpq em runtime
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

ENV PORT=9188 POLL_INTERVAL=15
EXPOSE 9188
CMD ["python", "exporter.py"]
