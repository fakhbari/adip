"""ADIP graph sidecar entry point.

Phase 2.7 minimum: exposes a tiny FastAPI surface compatible with the
TS `VllmProvider` adapter (which speaks OpenAI shape). Real graph
execution and the vLLM driver land as separate modules; this file
just makes the seam compile and lets the TS side wire up without the
sidecar present.

Run:
    uvicorn app.main:app --host 0.0.0.0 --port 8080
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI


app = FastAPI(title="adip-graph", version="0.1.0")


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"ok": True, "service": "adip-graph"}


@app.post("/v1/chat/completions")
def chat_completions(_payload: dict[str, Any]) -> dict[str, Any]:
    """Stub. Real implementation calls vllm.LLM.generate or a LangGraph
    workflow whose final node turns a state dict into an OpenAI-shape
    response. Returning a 501-equivalent shape keeps the TS adapter
    safe — failures are caught by Phase 2.4's runWithSchema retry
    loop and the run falls back to the regex pre-pass.
    """
    return {
        "id": "stub",
        "object": "chat.completion",
        "model": "stub",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "{}"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }
