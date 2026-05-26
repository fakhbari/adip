// Analysis WebSocket Service
//
// Provides real-time progress notifications to browsers. The only way for the
// server-side orchestrator to push events is the HTTP `/notify/*` endpoint,
// which requires the `X-Internal-Token` header. Sockets can only subscribe;
// they can never emit broadcast events. (Phase 3 hardening — see plan.)

import { createServer, IncomingMessage, ServerResponse } from "http";
import { Server, Socket } from "socket.io";
import { z } from "zod";
import { validateNotify } from "./notify";

const PORT = Number(process.env.PORT ?? 3003);
const BIND_HOST = process.env.ADIP_WS_BIND_HOST ?? "127.0.0.1";
const PUBLIC_ORIGIN = process.env.ADIP_PUBLIC_ORIGIN ?? "http://localhost:3000";
const INTERNAL_TOKEN = process.env.ADIP_INTERNAL_TOKEN ?? "";

// Polish P3.6 — refuse to start without the internal token. Was a
// warn-and-continue which left /notify/* in a half-broken state.
if (!INTERNAL_TOKEN) {
  // eslint-disable-next-line no-console
  console.error(
    "[analysis-ws] ADIP_INTERNAL_TOKEN is required. Refusing to start. " +
      "Set it in the environment and restart."
  );
  process.exit(1);
}

const httpServer = createServer();
const io = new Server(httpServer, {
  // Use the default socket.io path so the engine's HTTP polling endpoints
  // (`/socket.io/?EIO=…`) don't conflict with our own `/healthz` and
  // `/notify/*` handlers. (Previously path was `/`, which caused socket.io
  // to intercept every GET and double-respond — `ERR_HTTP_HEADERS_SENT`.)
  // Clients connect at `/socket.io/` automatically; if you put Caddy in
  // front, just reverse_proxy the whole site, no path rewriting needed.
  path: "/socket.io/",
  cors: {
    origin: PUBLIC_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ---------------------------------------------------------------------------
// Inbound socket schemas. Anything that doesn't match is dropped.
// ---------------------------------------------------------------------------

const JoinAnalysisSchema = z.object({
  analysisRunId: z.string().min(1).max(200),
  repositoryId: z.string().min(1).max(200),
});

const LeaveAnalysisSchema = z.object({
  analysisRunId: z.string().min(1).max(200),
});

const RepositorySubscribeSchema = z.object({
  repositoryId: z.string().min(1).max(200),
});

// ---------------------------------------------------------------------------
// Room bookkeeping
// ---------------------------------------------------------------------------

const analysisRooms = new Map<string, Set<string>>();

function getOrCreateRoom(analysisRunId: string): Set<string> {
  let room = analysisRooms.get(analysisRunId);
  if (!room) {
    room = new Set();
    analysisRooms.set(analysisRunId, room);
  }
  return room;
}

// ---------------------------------------------------------------------------
// Socket lifecycle
// ---------------------------------------------------------------------------

io.on("connection", (socket: Socket) => {
  console.log(`[analysis-ws] client connected: ${socket.id}`);

  socket.on("join-analysis", (raw: unknown) => {
    const parsed = JoinAnalysisSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(`[analysis-ws] rejected join-analysis from ${socket.id}: malformed payload`);
      return;
    }
    const { analysisRunId, repositoryId } = parsed.data;

    socket.join(`analysis:${analysisRunId}`);
    getOrCreateRoom(analysisRunId).add(socket.id);

    socket.emit("joined-analysis", {
      analysisRunId,
      repositoryId,
      message: `Joined analysis room for run ${analysisRunId}`,
    });
  });

  socket.on("leave-analysis", (raw: unknown) => {
    const parsed = LeaveAnalysisSchema.safeParse(raw);
    if (!parsed.success) return;
    const { analysisRunId } = parsed.data;

    socket.leave(`analysis:${analysisRunId}`);
    const room = analysisRooms.get(analysisRunId);
    if (room) {
      room.delete(socket.id);
      if (room.size === 0) analysisRooms.delete(analysisRunId);
    }
  });

  socket.on("subscribe-repository", (raw: unknown) => {
    const parsed = RepositorySubscribeSchema.safeParse(raw);
    if (!parsed.success) return;
    socket.join(`repository:${parsed.data.repositoryId}`);
    socket.emit("subscribed-repository", {
      repositoryId: parsed.data.repositoryId,
      message: `Subscribed to repository ${parsed.data.repositoryId}`,
    });
  });

  socket.on("unsubscribe-repository", (raw: unknown) => {
    const parsed = RepositorySubscribeSchema.safeParse(raw);
    if (!parsed.success) return;
    socket.leave(`repository:${parsed.data.repositoryId}`);
  });

  // Connection health check. No-op besides echoing.
  socket.on("ping", () => {
    socket.emit("pong", { timestamp: new Date().toISOString() });
  });

  // Note: there are intentionally NO `socket.on('analysis-progress', …)` /
  // `analysis-complete` / `analysis-error` handlers. Previously, any browser
  // tab could emit those events and have the server rebroadcast them. The
  // server-to-server `/notify/*` HTTP path is now the only way to broadcast.

  socket.on("disconnect", () => {
    console.log(`[analysis-ws] client disconnected: ${socket.id}`);
    for (const [analysisRunId, room] of analysisRooms.entries()) {
      if (room.has(socket.id)) {
        room.delete(socket.id);
        if (room.size === 0) analysisRooms.delete(analysisRunId);
      }
    }
  });

  socket.on("error", (error) => {
    console.error(`[analysis-ws] socket error (${socket.id}):`, error);
  });
});

// ---------------------------------------------------------------------------
// Server-to-server notification endpoint. Requires X-Internal-Token.
// The schemas + validation live in notify.ts so they can be unit-tested
// without binding a port.
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // Cap body size at 1 MB to limit DoS surface.
      if (body.length > 1_048_576) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function reply(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// Phase 1.5: progress-event coalescer.
//
// 10 parallel analyses × 5 agents × heartbeats × per-step progress
// callbacks can flood the WS room with hundreds of events per second.
// Browsers do not need every one; the latest in a short window is
// enough. We hold the freshest progress payload per analysisRunId and
// emit it on a fixed cadence (default 200 ms). Completion / error
// events bypass the coalescer and fire immediately so the UI updates
// without delay at terminal state.

const COALESCE_INTERVAL_MS = 200;
type Pending = { payload: { analysisRunId: string; repositoryId: string }; timer: NodeJS.Timeout };
const pendingProgress = new Map<string, Pending>();

function emitNow(event: string, payload: { analysisRunId: string; repositoryId: string }): void {
  io.to(`analysis:${payload.analysisRunId}`).emit(event, payload);
  io.to(`repository:${payload.repositoryId}`).emit(event, payload);
}

function emitCoalescedProgress(payload: { analysisRunId: string; repositoryId: string }): void {
  const existing = pendingProgress.get(payload.analysisRunId);
  if (existing) {
    // Replace payload; let the existing timer fire on schedule.
    existing.payload = payload;
    return;
  }
  const timer = setTimeout(() => {
    const pending = pendingProgress.get(payload.analysisRunId);
    pendingProgress.delete(payload.analysisRunId);
    if (pending) emitNow("analysis-progress", pending.payload);
  }, COALESCE_INTERVAL_MS);
  pendingProgress.set(payload.analysisRunId, { payload, timer });
}

function flushPendingFor(analysisRunId: string): void {
  const pending = pendingProgress.get(analysisRunId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingProgress.delete(analysisRunId);
  emitNow("analysis-progress", pending.payload);
}

// Polish P4.4 — llm-delta batcher. Bypasses the 200 ms progress
// coalescer (the live-log page wants tokens fast) but batches at
// ~16 frames/sec/room so a fast model does not melt the browser.
const LLM_FRAME_MS = 60;
type LlmPending = { frames: Array<{ analysisRunId: string; repositoryId: string; agentType?: string; delta: string; finish?: string }>; timer: NodeJS.Timeout };
const pendingLlm = new Map<string, LlmPending>();

function emitLlmDelta(payload: {
  analysisRunId: string;
  repositoryId: string;
  agentType?: string;
  delta: string;
  finish?: string;
}): void {
  const key = payload.analysisRunId;
  const existing = pendingLlm.get(key);
  if (existing) {
    existing.frames.push(payload);
    return;
  }
  const frames = [payload];
  const timer = setTimeout(() => {
    pendingLlm.delete(key);
    // Concatenate delta strings of consecutive frames so the browser
    // gets a single emit per frame-window (less DOM thrash).
    const merged = frames.reduce<{ analysisRunId: string; repositoryId: string; agentType?: string; delta: string; finish?: string }>(
      (acc, f) => ({ ...acc, delta: acc.delta + f.delta, finish: f.finish ?? acc.finish }),
      { analysisRunId: payload.analysisRunId, repositoryId: payload.repositoryId, agentType: payload.agentType, delta: "" }
    );
    io.to(`analysis:${merged.analysisRunId}`).emit("llm-delta", merged);
    io.to(`repository:${merged.repositoryId}`).emit("llm-delta", merged);
  }, LLM_FRAME_MS);
  pendingLlm.set(key, { frames, timer });
}

httpServer.on("request", async (req, res) => {
  // Health check (no auth needed). Lets `curl :3003/healthz` succeed for liveness probes.
  if (req.method === "GET" && req.url === "/healthz") {
    return reply(res, 200, { ok: true });
  }

  let raw: string;
  try {
    raw = await readBody(req);
  } catch {
    return reply(res, 413, { error: "Body too large" });
  }

  const result = validateNotify({
    method: req.method ?? "",
    url: req.url ?? "",
    headers: req.headers,
    body: raw,
    internalToken: INTERNAL_TOKEN,
  });

  if (!result.ok) {
    return reply(res, result.status, result.body);
  }

  const { action, payload } = result;
  // Phase 1.5: progress is coalesced (200 ms window).
  // Polish P4.4: llm-delta bypasses coalesce but is batched at
  // ≤16 frames/sec/room so the browser does not over-render.
  if (action === "progress") {
    emitCoalescedProgress(payload);
  } else if (action === "llm-delta") {
    emitLlmDelta(payload);
  } else if (action === "agent-event") {
    emitNow("agent-event", payload);
  } else {
    flushPendingFor(payload.analysisRunId);
    emitNow(`analysis-${action}`, payload);
  }

  if (action === "complete") {
    // Clean up the analysis room after a delay so any late join still sees the
    // completion event.
    setTimeout(() => {
      const room = analysisRooms.get(payload.analysisRunId);
      if (room) {
        for (const socketId of room) {
          const s = io.sockets.sockets.get(socketId);
          s?.leave(`analysis:${payload.analysisRunId}`);
        }
        analysisRooms.delete(payload.analysisRunId);
      }
    }, 30000);
  }

  return reply(res, 200, { ok: true });
});

httpServer.listen(PORT, BIND_HOST, () => {
  console.log(
    `[analysis-ws] listening on ${BIND_HOST}:${PORT} (cors=${PUBLIC_ORIGIN}, auth=${
      INTERNAL_TOKEN ? "configured" : "missing"
    })`
  );
});

function shutdown(signal: string) {
  console.log(`[analysis-ws] received ${signal}, shutting down...`);
  httpServer.close(() => {
    console.log("[analysis-ws] closed");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
