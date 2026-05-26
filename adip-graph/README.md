# adip-graph

Python sidecar for ADIP. Only required when a tenant configures an
AIProvider of type `CUSTOM` pointed at vLLM, or when LangGraph
workflows are enabled.

The sidecar exposes an OpenAI-shape `/v1/chat/completions` and a
`/healthz`. The TS host (`src/lib/llm/vllm.ts`) talks to it over HTTP.

## Run (dev)

```bash
cd adip-graph
pip install -e .
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

## Run (docker)

```bash
docker build -t adip-graph .
docker run -p 8080:8080 adip-graph
```

## Status

Phase 2.7 ships the stub. Real LangGraph workflows + the vLLM driver
land in a follow-up; the seam is in place so the TS side can adopt
the sidecar without further refactor.
