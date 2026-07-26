###############################################################################
# NETRA — Ingestion Layer Dockerfile
###############################################################################

FROM python:3.12-slim AS base

# System deps for psycopg2 and confluent-kafka
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev librdkafka-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY ingestion/ ./ingestion/
COPY shared/ ./shared/
COPY tests/ ./tests/

# Expose metrics port
EXPOSE 8000

# Default command: run Celery worker
CMD ["celery", "-A", "ingestion.scheduler.celery_app", "worker", "--beat", "--loglevel=info"]
