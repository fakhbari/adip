# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ADIP (ArchDoc Intelligence Platform) — a Next.js 16 / Postgres / Redis / BullMQ
application that ingests git repositories and auto-generates SAW_102-conformant
architecture documentation: C4, ADR, OpenAPI, AsyncAPI, Context Map, Data
Catalog, plus a Technology Radar with ThoughtWorks gap analysis. Outputs are
rendered in Persian by default. The vision document is `upload/ADIP-Proposal-v1.0.md`.

## Runtime & commands

Runtime is **Node + npm** (Bun was dropped in the hardening phase). Local dev
infra is brought up by docker-compose. See `RUNBOOK.md` for the full ops manual.

```bash
# End-to-end: docker stack + deps + migrations + admin seed + build + start.
./scripts/bootstrap.sh

# Day-to-day
npm run dev                  # Next.js on :3000
npm run worker               # BullMQ consumer (run multiple replicas for 10× parallelism)
npm run build && npm start   # standalone production server

npm run lint
npm run typecheck
npm test                     # vitest, unit suite
npm run test:integration     # ADIP_INTEGRATION=1 + a running stack
npm run check                # lint + typecheck + unit tests

npm run db:migrate           # prisma migrate dev
npm run db:push              # quick schema push (dev only)
npm run secrets:migrate      # encrypt any plaintext accessToken / apiKey in DB
npm run seed:admin           # idempotent admin user upsert
```

`docker compose up -d` brings up Postgres (`pgvector/pgvector:pg16`) on **:5433**
and Redis on **:6380** — non-default ports so they do not collide with anything
the developer already runs.

## Architecture (high level)

```
Browser → Next.js (UI + API + NextAuth middleware + queue producer)
              │
              ▼  enqueue
         Redis (BullMQ)
              │  pull
              ▼
       adip-worker (Node × N) — AgentOrchestrator + LLM adapter + WS notify
              │
              ▼
       Postgres + pgvector ← audit / state / embeddings
              │
              ▼
       analysis-ws (socket.io :3003, bearer-authed /notify/*, 200ms coalesce)
```

Optional Python sidecar (`adip-graph/`) for vLLM/LangGraph — only built when a
tenant configures `AIProvider.type = CUSTOM` pointed at vLLM.

## Architecture (where things live)

### Routes

`src/app/<view>/page.tsx` — eight App Router pages: `/dashboard`, `/repositories`,
`/radar`, `/adr`, `/c4`, `/openapi`, `/context-map`, `/settings`. Root `/` redirects
to `/dashboard`. `/auth/signin`, `/auth/signout` are public; everything else is
gated by `src/middleware.ts`. `/api/**` is gated except `/api`, `/api/metrics`,
`/api/auth/**`.

### API

`src/app/api/**/route.ts`. Every handler that touches a tenant-scoped resource
calls `requireTenant(request)` from `src/lib/tenant.ts` first and threads the
tenantId into Prisma via `withTenant(where, ctx)` or `assertOwnership(row, ctx)`.

### Multi-agent pipeline

`src/lib/agents/`. `BaseAgent` provides timeout-wrapped `execute()`, progress
callbacks, public `getType()/getName()/getPriority()` accessors. Seven concrete
agents: `TechRadarAgent`, `C4Agent`, `ADRAgent`, `OpenAPIAgent`, `AsyncAPIAgent`,
`DataCatalogAgent`, `ContextMapAgent`. The orchestrator (`orchestrator.ts`):

1. Loads repository + AIProvider, **decrypts** `accessToken` and `apiKey`.
2. Builds a VCS client and fetches the file tree (paginated + truncation-safe).
3. Fetches filtered files into a `RepoFileCache` (256MB / 1MB per-file budget).
4. Computes `incrementalScope` by diffing against the previous `RepoSnapshot`.
5. Builds the `LLMProvider` adapter (Anthropic / OpenAI / Ollama / vLLM).
6. Runs agents sequentially by `priority`; per-agent timeout, hard 15-min wall-clock.
7. Persists results in a single `db.$transaction`; appends versioned `Document`
   rows; updates `RepoSnapshot`.

The orchestrator is invoked from `scripts/worker.ts` (BullMQ consumer), not
inline. The Next.js POST `/api/repositories/[id]/analysis` is now a producer that
calls `enqueueAnalysis(...)` and returns 202-style immediately.

### LLM layer

`src/lib/llm/`:

- `provider.ts` interface, `anthropic.ts` / `openai.ts` / `ollama.ts` / `vllm.ts`
  implementations, `index.ts` factory.
- `prompt-registry.ts` reads `prompts/<agent>/<task>.<locale>.md` with a tiny
  `{{var}}` interpolator. EN + FA shipped for every template.
- `structured.ts` wraps `provider.chat()` with fence-stripping JSON extraction,
  Zod schema validation, and up-to-3 re-prompts on malformed output.
- `usage-tracker.ts` writes `LLMUsage` rows + Prom counters.
- `tools.ts` ToolRegistry scaffold (per-agent tool bindings land case-by-case).

### RAG

`src/lib/rag/`: windowed `chunker.ts` (sha1-hashed chunks) + `InMemoryRetriever`
that embeds via the provider adapter. Persistent pgvector storage is a
Phase 2.3b follow-up; in-memory is fine for the analysis lifetime.

### VCS

`src/lib/vcs/`: GitHub / GitLab / Bitbucket clients. All three share
`fetch-with-retry.ts` (exponential backoff + Retry-After). All three implement
`getFullTree` with pagination + truncation handling and `getDiff(from, to)` for
incremental analysis.

### Persian / i18n

`src/lib/i18n/locale-renderer.ts` translates Document content at the sink stage.
`mermaid-fa.ts` injects `&lrm;` (U+200E) between Mermaid syntax and Persian
labels to avoid RTL collapse.

### Crypto / secrets

`src/lib/crypto.ts`: AES-256-GCM with `v1:` prefix. `encryptOptional` /
`decryptOptional` used at every secret-touching site. Key from
`ADIP_ENCRYPTION_KEY` (32 bytes hex or base64). One-shot migration script
at `scripts/migrate-encrypt-secrets.ts`.

### Observability

`src/lib/logger.ts` Pino root + child factory; redacts `accessToken` / `apiKey` /
`password` / `x-internal-token` automatically. `src/lib/metrics.ts` registers
`adip_analysis_runs_total`, `adip_llm_tokens_total`, `adip_vcs_request_seconds`,
`adip_queue_jobs_active`, `adip_agent_duration_seconds`. `/api/metrics` exposes
the registry in Prometheus format.

### Scheduler

`src/lib/scheduler/reconciler.ts`: every 5 minutes the worker syncs DB
`ScheduleConfig` rows to BullMQ `repeat` jobs. The handler fans out per-repo
`analyze-repo` jobs into the main queue.

### WS notifier

`mini-services/analysis-ws/index.ts`: socket.io on :3003. `/notify/*` requires
`X-Internal-Token` (`ADIP_INTERNAL_TOKEN`). Progress events are coalesced into
one emit per 200 ms per `analysisRunId`; complete/error events flush + emit
immediately.

## Database

Postgres 16 + `pgvector` extension via `pgvector/pgvector:pg16`. Prisma manages
the schema. Migrations live in `prisma/migrations/`. Run
`prisma migrate deploy` in prod, `prisma migrate dev` in dev.

JSON-shaped String columns (`Repository.languages` / `frameworks`,
`Document.metadata`, etc.) stay as `String?` for now; parse via
`src/lib/repo-fields.ts` helpers, never inline.

## Required env vars

See `.env.example`. Key ones:

- `DATABASE_URL` — Postgres URL.
- `REDIS_URL` — for BullMQ.
- `ADIP_ENCRYPTION_KEY` — 32-byte hex/base64. Loss = data unrecoverable.
- `ADIP_INTERNAL_TOKEN` — shared between Next.js host and WS service.
- `ADIP_PUBLIC_ORIGIN` — CORS for WS.
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — NextAuth.
- `ADIP_ADMIN_EMAIL`, `ADIP_ADMIN_PASSWORD` — for `seed:admin`.

## Strict TypeScript + ESLint

`next.config.ts` has `ignoreBuildErrors: false` and `reactStrictMode: true`.
ESLint defaults from `eslint-config-next` are restored; `no-explicit-any` is a
warning (not an error) because the codebase still has legacy `any` sites in
agent payload boundaries. Path alias: `@/*` → `./src/*`.

## Where to look first

- Want to add an agent → `src/lib/agents/<name>-agent.ts` + register in
  `orchestrator.ts agentConstructors` + add `createAgentConfig` entry + add
  `prompts/<name>/<task>.{en,fa}.md`.
- Want to add an LLM provider → `src/lib/llm/<name>.ts` + factory branch in
  `src/lib/llm/index.ts` + Prisma `AIProviderType` enum.
- Want to add a route → place under `src/app/api/...`. First line of the handler
  must be `const ctx = await requireTenant(request); if (ctx instanceof NextResponse) return ctx;`.

## Plan + Runbook

The 23-phase Completion Plan that took ADIP from MVP to current state lives at
`/home/<user>/.claude/plans/review-all-codes-improve-adaptive-truffle.md`.

Day-to-day operations procedures live in `RUNBOOK.md`.
