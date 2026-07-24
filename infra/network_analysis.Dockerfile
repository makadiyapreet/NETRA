FROM python:3.11-slim

WORKDIR /app

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY network_analysis/ ./network_analysis/
COPY shared/ ./shared/
COPY fixtures/ ./fixtures/

# Default env
ENV MODE=fixture
ENV NETWORK_SERVICE_HOST=0.0.0.0
ENV NETWORK_SERVICE_PORT=8001

EXPOSE 8001

CMD ["python", "-m", "uvicorn", "network_analysis.api.network_service:app", \
     "--host", "0.0.0.0", "--port", "8001"]
