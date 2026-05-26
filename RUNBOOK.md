# ADIP Runbook

Operations manual. Day-to-day procedures, incident playbooks, recovery flows.
Read `README.md` and `CLAUDE.md` first for context.

---

## Contents

1. [Service inventory](#service-inventory)
2. [Bring up — dev](#bring-up--dev)
3. [Bring up — production](#bring-up--production)
4. [Tear down](#tear-down)
5. [Health + observability endpoints](#health--observability-endpoints)
6. [Routine ops](#routine-ops)
   - [Trigger an analysis](#trigger-an-analysis)
   - [Cancel a stuck analysis](#cancel-a-stuck-analysis)
   - [Manage schedules](#manage-schedules)
   - [Manage VCS connections + AI providers](#manage-vcs-connections--ai-providers)
   - [Rotate the encryption key](#rotate-the-encryption-key)
   - [Rotate admin password / create more users](#rotate-admin-password--create-more-users)
   - [Add a tenant](#add-a-tenant)
   - [Update the ThoughtWorks Radar snapshot](#update-the-thoughtworks-radar-snapshot)
7. [Incident playbooks](#incident-playbooks)
8. [Upgrades](#upgrades)
9. [Backups + restore](#backups--restore)
10. [Test + verification](#test--verification)

---

## Service inventory

| Service        | Process / image                   | Port  | Owns                                    |
|----------------|-----------------------------------|-------|-----------------------------------------|
| Next.js app    | `next start` / `node server.js`   | 3000  | UI, API, queue producer, NextAuth       |
| Worker         | `npm run worker` (one process per replica) | —    | BullMQ consumer, orchestrator, scheduler reconciler |
| WS notifier    | `mini-services/analysis-ws` (tsx) | 3003  | Browser progress events                 |
| Postgres       | `pgvector/pgvector:pg16` (compose) | 5433  | All state + embeddings                  |
| Redis          | `redis:7-alpine` (compose)        | 6380  | BullMQ queue, rate-limit buckets        |
| Python sidecar | `adip-graph/` (optional)          | 8080  | vLLM + LangGraph (only when LOCAL_VLLM) |

Non-default ports (5433 / 6380) prevent collisions with other Postgres/Redis a
developer might run.

---

## Bring up — dev

### One-shot (fresh clone or after `git pull`)

```bash
./scripts/bootstrap.sh
```

Idempotent. Does:

1. `docker compose up -d postgres redis` + waits for `pg_isready` + creates
   `CREATE EXTENSION IF NOT EXISTS vector`.
2. Writes `.env.local` if absent (32-byte random secrets via Node's crypto).
3. `npm install` for root + `mini-services/analysis-ws`.
4. `prisma generate` + `prisma migrate deploy`.
5. `npm run seed:admin` (creates / updates `admin@local`).
6. `npm run secrets:migrate` (encrypts plaintext rows; no-op when none).
7. `npm run build`.
8. Kills any prior PID files, starts the WS service and Next.js standalone
   via `nohup`. PIDs land in `run/`. Logs land in `logs/`.
9. Polls `:3000/api` and `:3003/healthz` until both return 200.

The worker is NOT started by bootstrap. Start it separately when you need to
exercise analysis:

```bash
npm run worker                                # one replica
ADIP_WORKER_CONCURRENCY=4 npm run worker      # one process, four parallel jobs
for i in {1..10}; do npm run worker & done    # ten replicas (proposal target)
```

### Subsequent dev cycle (Next.js hot reload)

```bash
docker compose up -d                           # if not already up
npm run dev                                    # Next.js on :3000 with HMR
( cd mini-services/analysis-ws && npm run dev ) # WS service with --hot
npm run worker
```

---

## Bring up — production

`scripts/bootstrap.sh` is dev-flavoured (it generates fresh secrets). In
production the secrets are external and the orchestration is whatever you use
(Kubernetes, ECS, docker-compose with `restart: always`). Required pieces:

1. **Postgres** with `vector` extension installed. Run
   `CREATE EXTENSION IF NOT EXISTS vector;` once.
2. **Redis** reachable from both the Next.js app and the worker fleet.
3. **Env vars**, all of these set in every process — Next.js, worker, WS:
   - `DATABASE_URL` (Postgres)
   - `REDIS_URL`
   - `ADIP_ENCRYPTION_KEY` (32 bytes; **back this up out-of-band**)
   - `ADIP_INTERNAL_TOKEN` (matches between app and WS)
   - `ADIP_PUBLIC_ORIGIN` (for WS CORS — your public origin)
   - `ADIP_WS_INTERNAL_URL` (e.g. `http://adip-ws:3003`)
   - `NEXT_PUBLIC_WS_URL` (browser-visible WS URL)
   - `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
4. **Migrations**: `npx prisma migrate deploy` once per release before any
   process starts (the worker imports the Prisma client at boot).
5. **Seed admin** once per environment: `ADIP_ADMIN_EMAIL=… ADIP_ADMIN_PASSWORD=… npm run seed:admin`.
6. **Secrets migrate** once after Phase 2 lands or after restoring from a
   pre-encryption backup: `npm run secrets:migrate`.
7. Start order: Postgres → Redis → WS notifier → Next.js → worker(s). The
   janitor (built into the worker) cleans up any `RUNNING` rows left by the
   previous deploy when it boots.

### Scaling

- **Next.js**: horizontally scalable behind any reverse proxy. Stateless.
- **Worker**: scale the deployment / replica count to fit the parallel-analysis
  budget. Each replica defaults to concurrency 1. The "10 parallel workers"
  proposal target = 10 worker pods × concurrency 1.
- **WS notifier**: single-instance is fine for tens of repos. For more, run
  multiple behind a sticky-session proxy (socket.io needs sticky if not using
  the Redis adapter — not yet wired).

---

## Tear down

```bash
# Stop app processes (PIDs left by bootstrap).
kill $(cat run/next.pid run/ws.pid 2>/dev/null) 2>/dev/null

# Stop the docker stack (keeps data volumes).
docker compose down

# Wipe everything including data (irrecoverable).
docker compose down -v
```

---

## Health + observability endpoints

| URL                                    | Auth          | What you see |
|----------------------------------------|---------------|--------------|
| `GET /api`                             | none          | `{ok:true, service:"adip-api"}` + kicks janitor |
| `GET /api/metrics`                     | none          | Prometheus text — counters + histograms |
| `GET /api/auth/providers`              | none          | NextAuth provider list |
| `GET :3003/healthz`                    | none          | `{ok:true}` |
| `POST :3003/notify/{progress,complete,error}` | `X-Internal-Token` | server-to-server WS broadcast |
| Anything else under `/api/**`          | NextAuth      | 401 without a session cookie |

Recommended Prom scrape targets:

```
- targets: ['adip-app:3000']        # path: /api/metrics
- targets: ['adip-worker:9464']     # exposed by prom-client default port if you wire it
- targets: ['adip-ws:9464']         # same
```

---

## Routine ops

### Trigger an analysis

UI: `/repositories`, click a repo, click "Run analysis".

API: `POST /api/repositories/:id/analysis` (with a NextAuth session cookie):

```bash
curl -sS -X POST -b cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"enabledAgents":["tech-radar","c4","openapi"]}' \
  http://localhost:3000/api/repositories/<id>/analysis
```

Returns `{analysisRunId, jobId, status:"QUEUED"}`. The producer enforces "one
RUNNING per repository at a time" transactionally — concurrent requests get
`409 Conflict` with the existing `analysisRunId`.

### Cancel a stuck analysis

```bash
curl -sS -X DELETE -b cookies.txt \
  "http://localhost:3000/api/repositories/<repoId>/analysis?analysisRunId=<runId>"
```

If the worker is still actively running the job, BullMQ's `job.remove()` will
fail; the worker's wall-clock guard (15 min hard cap) will eventually terminate
it. To force-kill the worker process: `pkill -f "scripts/worker.ts"`. The
janitor in the next process to come up will mark the row `FAILED`.

### Manage schedules

`POST /api/settings/schedules` (NextAuth session):

```json
{
  "name": "Full Weekly Scan",
  "type": "full_scan",
  "cronExpression": "0 2 * * 1,4",
  "isActive": true
}
```

The reconciler tick on the worker syncs the new row into BullMQ within
5 minutes. To force the reconciler to run immediately, restart the worker.

`PUT /api/settings/schedules/:id` to flip `isActive` off — the reconciler
removes the repeat job on its next tick.

### Manage VCS connections + AI providers

Use the dashboard `/settings` page or the REST endpoints under
`/api/settings/connections/*` and `/api/settings/ai-providers/*`. Tokens and
API keys are encrypted on write (`encryptOptional` from `src/lib/crypto.ts`);
GET endpoints return `hasAccessToken: boolean` / `hasApiKey: boolean` instead
of the secret value. Tokens are decrypted only when the worker constructs a
VCS client or LLM provider.

### Rotate the encryption key

The encryption key (`ADIP_ENCRYPTION_KEY`) is the master for every secret in
the DB. Rotation is a controlled procedure:

1. Generate the new key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Stop all worker + Next.js processes.
3. Write a one-shot script (template below) that decrypts every secret column
   with the OLD key and re-encrypts with the NEW key, in a single transaction.
4. Update `ADIP_ENCRYPTION_KEY` in every process's env to the new value.
5. Restart Next.js + workers.

Template script (place under `scripts/rotate-encryption-key.ts` when you need
it; not committed because the OLD-key handling is environment-specific):

```ts
import { db } from "../src/lib/db";
import { decrypt, encrypt, isEncrypted } from "../src/lib/crypto";
// Set process.env.ADIP_ENCRYPTION_KEY = NEW_KEY before importing crypto.
// Re-import after decrypting with the old key — or split into two passes.
```

The clean way: split into two scripts, one to decrypt-with-old (writes
plaintext into a temp column or a dump file), one to encrypt-with-new. Be
careful — the temp plaintext is the highest-risk moment of the rotation; do it
on a host with no logging tooling.

### Rotate admin password / create more users

```bash
ADIP_ADMIN_EMAIL=new-admin@org ADIP_ADMIN_PASSWORD='…' npm run seed:admin
```

`seed:admin` is an upsert: same email → updates the password hash + sets role
to `admin`. The script lives at `scripts/seed-admin.ts`; copy + tweak for
non-admin users (set `role: "user"`).

### Add a tenant

A "tenant" is currently a `User.id`. Create the user (sign up via NextAuth or
`seed-admin` clone); every Repository / RepositoryConnection / AIProvider /
Setting they create is automatically tagged with their `tenantId`. Cross-tenant
access returns 404 via `assertOwnership` in the API routes.

The `Organization` model + memberships is planned for a future phase. Until
then, multi-user-per-tenant means sharing the same login.

### Update the ThoughtWorks Radar snapshot

The vendored snapshot at `vendor/thoughtworks-radar/snapshot.json` is the
offline fallback. Update it any time:

```bash
curl -fsSL \
  https://raw.githubusercontent.com/thoughtworks/build-your-own-radar/master/src/data/radar-entries.json \
  > vendor/thoughtworks-radar/snapshot.json
git add vendor/thoughtworks-radar/snapshot.json && git commit
```

When `ADIP_THOUGHTWORKS_OFFLINE=1` is set, only the vendored copy is used.
Otherwise the live fetch is tried first (24h cache).

---

## Incident playbooks

### Worker is hung

**Symptoms**: `AnalysisRun.status = RUNNING` for > 15 minutes,
`adip_analysis_runs_total{status="completed"}` not incrementing,
`adip_queue_jobs_active{state="active"}` stuck at a non-zero value.

**Recovery**:

1. `pkill -f "scripts/worker.ts"` to kill the worker pool.
2. Restart workers: `npm run worker` (× N replicas).
3. The janitor (in the worker's first boot tick) sweeps `RUNNING` rows
   with stale `lastHeartbeatAt` older than 5 minutes and marks them
   `FAILED` with `errors:["server restarted or crashed (janitor swept)"]`.
4. The dashboard reflects FAILED status; UI shows the error.
5. Confirm via `select id, status, lastHeartbeatAt, errors from "AnalysisRun" where status in ('QUEUED','RUNNING');` — should be empty after restart.

### Redis is down

**Symptoms**: `enqueueAnalysis` 500s; worker shows `ECONNREFUSED` repeatedly;
`adip_queue_jobs_active` flatlines.

**Recovery**:

1. `docker compose up -d redis` (dev) or check your prod Redis health.
2. The Next.js app + workers reconnect automatically — BullMQ retries indefinitely (we set `maxRetriesPerRequest: null`).
3. In-flight HTTP calls to `/api/repositories/:id/analysis` will return 500
   while Redis is unreachable; callers should retry.

### Postgres is down

**Symptoms**: every endpoint 500s; logs full of `P1001: Can't reach database server`.

**Recovery**:

1. Bring Postgres back up (`docker compose up -d postgres` in dev).
2. Wait for `pg_isready`. The Prisma singleton reconnects on next query.
3. The WS service does not depend on Postgres — progress events keep flowing
   for any analyses still in worker memory.

### WS notifier down

**Symptoms**: `:3003/healthz` not responding; UI shows no progress; the worker
logs `ws notify failed` warnings but analyses still complete.

**Recovery**:

1. Restart the WS service: `( cd mini-services/analysis-ws && npm run start )`
   or `kill $(cat run/ws.pid)` and re-run `bootstrap.sh`.
2. Analyses continue uninterrupted — WS notify is best-effort. The UI
   reconciles state from the analysis-run DB row when the user navigates.

### LLM provider quota exceeded

**Symptoms**: `adip_llm_tokens_total` plateau; agent logs show 429s or
`AnthropicError` / `OpenAIError`.

**Recovery**:

1. The structured-output helper retries up to 3 times with backoff. If the
   provider is hard-limited, the analysis surfaces a regex-only result
   (no LLM enrichment) and completes successfully.
2. Switch tenants to a different `AIProvider` row (e.g. Anthropic → Ollama)
   via `/settings/ai-providers`. Per-repository override is also available
   via `Repository.aiProviderId`.

### Build fails because Google Fonts unreachable

**Symptoms**: `next build` error `Failed to fetch 'Geist' from Google Fonts`.

**Recovery**: this should not happen — Phase 5a switched to bundled Liberation
fonts at `src/app/fonts/`. If it does, somebody re-added `next/font/google` to
`src/app/layout.tsx`. Revert that import and re-bundle.

### Disk fills up

**Symptoms**: docker complaining about no space; Postgres refusing writes.

**Common culprits**:
- `logs/` — bootstrap writes `next.log` / `ws.log` / `build.log` without rotation.
  Truncate: `truncate -s 0 logs/*.log`.
- BullMQ completed/failed retention: configured to clean after 24h / 7d but
  pathological volumes can still accumulate. Manual flush:
  `docker exec adip-redis redis-cli -n 0 KEYS 'bull:adip-analysis:*' | xargs -r docker exec -i adip-redis redis-cli DEL`.
- Postgres bloat: run `VACUUM FULL` during maintenance windows.

---

## Upgrades

### Routine application upgrade

```bash
git pull
docker compose up -d                          # ensure infra is up
npm install
npx prisma migrate deploy                     # apply any new migrations
npm run build
npm run check                                 # gate: lint + typecheck + tests
# Restart processes in order: WS, Next.js, workers.
```

### Database migration that backfills data

Two-stage: ship the migration first (adds column NULL), then run a backfill
script in a separate deploy, then ship the second migration that adds NOT
NULL. `prisma migrate dev --create-only` writes the SQL without applying;
edit the file to add the backfill, then `prisma migrate deploy`.

### Adding a new agent

1. Add the agent type to `AgentType` in `src/lib/agents/types.ts`.
2. Add a `createAgentConfig` entry in `src/lib/agents/base-agent.ts`.
3. Create `src/lib/agents/<name>-agent.ts` (follow `AsyncAPIAgent` as a template).
4. Register in `agentConstructors` in `src/lib/agents/orchestrator.ts`.
5. Add the prompt templates under `prompts/<name>/<task>.{en,fa}.md`.
6. If the agent produces a new `Document.type`, add the enum value to the
   schema and migrate.

---

## Backups + restore

### Postgres

```bash
# Backup (cron daily; keep 14 days).
docker exec adip-postgres pg_dump -U adip -d adip -Fc > backups/adip-$(date -u +%Y%m%d).dump

# Restore.
docker exec -i adip-postgres pg_restore -U adip -d adip --clean --if-exists < backups/adip-YYYYMMDD.dump
```

### The encryption key

`ADIP_ENCRYPTION_KEY` must be stored in your secrets manager separately from
the DB backup. Restoring a DB without the matching key leaves every secret
column unrecoverable.

### Redis

BullMQ queue state is ephemeral by design — losing it means losing in-flight
jobs. Don't bother backing it up; let the janitor sweep and re-enqueue
manually.

---

## Test + verification

```bash
npm run check                # lint + typecheck + 90 unit tests
npm test                     # unit only (vitest)
npm run test:integration     # requires ADIP_INTEGRATION=1 and a running :3000
```

End-to-end smoke after bootstrap:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/api          # → 200
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/auth/signin  # → 200
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/dashboard    # → 307 (redirect to /auth/signin)
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3003/healthz      # → 200
curl -sS -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3003/notify/progress  # → 401 (no token)

# With the right token:
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  -H "X-Internal-Token: $(grep ^ADIP_INTERNAL_TOKEN .env.local | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"analysisRunId":"x","repositoryId":"y","progress":{}}' \
  http://localhost:3003/notify/progress     # → 200
```

For the queue:

```bash
# View queue state.
docker exec adip-redis redis-cli -n 0 LLEN bull:adip-analysis:wait
docker exec adip-redis redis-cli -n 0 LLEN bull:adip-analysis:active
docker exec adip-redis redis-cli -n 0 LLEN bull:adip-analysis:completed
```

---

## When something goes wrong and you do not know which playbook to read

1. `curl http://localhost:3000/api/metrics | grep -E "analysis_runs|queue_jobs|llm_tokens"` — what is the system actually doing right now?
2. `docker compose ps` — what is running?
3. `tail -200 logs/next.log logs/ws.log logs/build.log` (dev) or your prod log shipper.
4. `select status, count(*) from "AnalysisRun" group by status;` — where are runs piled up?
5. Then pick the relevant playbook above.

If still stuck: capture the metrics snapshot, the last 500 lines of each log,
the Postgres status, and the Redis BullMQ depths; open an incident with that.
