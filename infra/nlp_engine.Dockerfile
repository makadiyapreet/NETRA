FROM python:3.11-slim

WORKDIR /app

# System dependencies for Tesseract OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-hin tesseract-ocr-guj \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY nlp_engine/ ./nlp_engine/
COPY shared/ ./shared/
COPY fixtures/ ./fixtures/

# Default env
ENV MODE=fixture
ENV NLP_SERVICE_HOST=0.0.0.0
ENV NLP_SERVICE_PORT=8000

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "nlp_engine.inference.inference_service:app", \
     "--host", "0.0.0.0", "--port", "8000"]
