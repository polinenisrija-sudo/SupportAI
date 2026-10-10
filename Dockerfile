# ---- build the dashboard ----
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- API + static dashboard + widget ----
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 SUPPORTAI_DATA=/data FASTEMBED_CACHE_PATH=/models
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/app backend/app
COPY widget widget
COPY data data
COPY --from=web /web/dist frontend/dist
# Pre-download embedding + reranker models into the image so first start is instant.
RUN cd backend && python -c "from fastembed import TextEmbedding; from fastembed.rerank.cross_encoder import TextCrossEncoder; TextEmbedding('BAAI/bge-small-en-v1.5'); TextCrossEncoder('Xenova/ms-marco-MiniLM-L-6-v2')"
VOLUME /data
EXPOSE 8000
WORKDIR /app/backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
