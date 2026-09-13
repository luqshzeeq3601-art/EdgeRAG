# Multi-stage Dockerfile for EdgeRAG: React SPA + FastAPI Backend

# Stage 1: Build React SPA
FROM node:22-slim AS frontend-builder
WORKDIR /build

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Production Python Backend Runtime
FROM python:3.11-slim AS runtime

# Install system utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install backend dependencies
COPY backend/pyproject.toml /app/backend/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -e /app/backend

# Copy backend application source
COPY backend /app/backend

# Copy built frontend static bundle from stage 1
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Runtime paths and offline flags
ENV PYTHONUNBUFFERED=1 \
    EDGERAG_OLLAMA_BASE_URL="http://host.docker.internal:11434" \
    EDGERAG_DATABASE_PATH="/app/data/db/edgerag.sqlite3" \
    EDGERAG_DOCUMENT_STORAGE_PATH="/app/data/documents" \
    EDGERAG_VECTOR_INDEX_PATH="/app/data/indexes/edgerag.faiss" \
    EDGERAG_STATIC_FILES_PATH="/app/frontend/dist" \
    HF_HOME="/app/.hf-cache"

WORKDIR /app/backend

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
