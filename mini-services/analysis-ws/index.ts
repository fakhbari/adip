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

if (!INTERNAL_TOKEN) {
  console.warn(
    "[analysis-ws] ADIP_INTERNAL_TOKEN is not set. /notify/* will be rejected. " +
      "Set it in the environment and restart."
  );
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
  const event = `analysis-${action}` as const;
  io.to(`analysis:${payload.analysisRunId}`).emit(event, payload);
  io.to(`repository:${payload.repositoryId}`).emit(event, payload);

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
