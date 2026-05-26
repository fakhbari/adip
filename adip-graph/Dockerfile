# adip-graph sidecar image.
#
# Phase 2.7 minimum: vanilla FastAPI on Python 3.11. Add `[graph,vllm]`
# extras when building for the local-OSS deployment scenario.

FROM python:3.11-slim

WORKDIR /app
COPY pyproject.toml ./
COPY app ./app

RUN pip install --no-cache-dir -e .

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
