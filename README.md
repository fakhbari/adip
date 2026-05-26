# ADIP — ArchDoc Intelligence Platform

AI-driven architecture documentation for the enterprise. ADIP connects to your
Bitbucket / GitLab / GitHub repositories, runs a multi-agent analysis pipeline,
and produces SAW_102-conformant documents:

- **C4** (System Context + Containers) with Mermaid diagrams
- **ADRs** in MADR format (drafted from git history + dependency churn)
- **OpenAPI** + **AsyncAPI** specifications synthesised from source
- **Context Maps** with DDD pattern classification (OHS / ACL / etc.)
- **Data Catalog** ERD + dictionary from migrations and ORM models
- **Technology Radar** with live ThoughtWorks gap analysis

Output is rendered in Persian (Farsi) by default; English is a per-repository
override. Documents land in the ADIP dashboard with full version history; no
PRs are opened against source repos (dashboard is the single sink).

The full design is in [`upload/ADIP-Proposal-v1.0.md`](upload/ADIP-Proposal-v1.0.md).

## Stack

| Layer        | Technology |
|--------------|------------|
| App          | Next.js 16 (App Router) + TypeScript + Tailwind + shadcn/ui |
| Auth         | NextAuth.js (Credentials provider; GitHub OAuth ready) |
| State        | Postgres 16 + pgvector + Prisma |
| Queue        | Redis + BullMQ |
| Worker       | Separate Node process via `npm run worker`, scales horizontally |
| WS notifier  | socket.io mini-service on `:3003`, bearer-authed `/notify/*` |
| LLM          | Provider adapter (Anthropic, OpenAI, Ollama, vLLM) |
| RAG          | pgvector + in-memory retriever |
| Observability| Pino structured logs + Prometheus `/api/metrics` |
| Optional     | Python sidecar (`adip-graph/`) for vLLM + LangGraph |

## Quickstart

Requirements: Docker, Node ≥ 22, npm.

```bash
./scripts/bootstrap.sh
```

The script:
1. Brings up Postgres + Redis via `docker compose up -d`.
2. Generates a fresh `.env.local` (32-byte AES key, internal WS token,
   NextAuth secret).
3. `npm install` for both the root and the WS mini-service.
4. Runs `prisma migrate deploy`.
5. Seeds an admin user (`admin@local` / `admin` by default — change in prod).
6. Encrypts any pre-existing plaintext secrets in the DB (idempotent).
7. Builds the Next.js standalone output.
8. Starts the WS mini-service on `:3003`, the Next.js app on `:3000`.
9. Waits for both `/api` and `/healthz` to return 200.

Sign in at <http://localhost:3000/auth/signin> with the seeded admin user.

The worker process is not started by `bootstrap.sh` — start it (and as many
replicas as you want) separately:

```bash
npm run worker
# Or for the proposal's "10 parallel workers":
for i in {1..10}; do npm run worker & done
```

## Documentation

| Document                                            | What for                          |
|-----------------------------------------------------|-----------------------------------|
| [`RUNBOOK.md`](RUNBOOK.md)                          | Operations: dev/prod, ops tasks, incident playbooks |
| [`CLAUDE.md`](CLAUDE.md)                            | Map of the codebase for editors + AI assistants |
| [`upload/ADIP-Proposal-v1.0.md`](upload/ADIP-Proposal-v1.0.md) | Original vision document (Persian) |
| [`.env.example`](.env.example)                      | All environment variables, with comments |
| [`adip-graph/README.md`](adip-graph/README.md)      | Python sidecar (optional, vLLM scenario) |

## Project layout

```
src/
├── app/                                # Next.js routes (UI + API)
│   ├── (8 page routes)/page.tsx        # /dashboard, /repositories, /radar, …
│   ├── api/                            # REST handlers; all tenant-scoped
│   └── auth/{signin,signout}/page.tsx
├── components/
│   ├── radar/D3Radar.tsx               # D3 radar visualisation
│   ├── layout/dashboard-layout.tsx     # nav shell (usePathname-driven)
│   └── ui/…                            # shadcn primitives
├── lib/
│   ├── agents/                         # 7 agents + BaseAgent + orchestrator
│   ├── llm/                            # provider adapter, prompt registry, structured output
│   ├── rag/                            # chunker + retriever
│   ├── vcs/                            # GitHub / GitLab / Bitbucket clients
│   ├── i18n/                           # Persian sink renderer + Mermaid &lrm;
│   ├── external/                       # ThoughtWorks fetch + gap analysis
│   ├── notifications/                  # Slack + Teams webhooks + dispatcher
│   ├── parsers/                        # Compose + Kubernetes YAML parsers
│   ├── scheduler/                      # BullMQ repeat-job reconciler
│   ├── crypto.ts                       # AES-256-GCM secret encryption
│   ├── tenant.ts                       # requireTenant / withTenant / assertOwnership
│   ├── queue.ts                        # BullMQ producer
│   ├── janitor.ts                      # sweeps stuck AnalysisRun rows
│   ├── logger.ts                       # Pino root + redaction
│   └── metrics.ts                      # Prom-client registry
├── middleware.ts                       # NextAuth perimeter
prisma/
├── schema.prisma
└── migrations/
mini-services/analysis-ws/              # socket.io progress notifier
adip-graph/                             # optional Python LangGraph + vLLM sidecar
prompts/                                # SAW_102-aware LLM templates (EN + FA)
scripts/
├── bootstrap.sh                        # one-shot dev bringup
├── worker.ts                           # BullMQ consumer process
├── seed-admin.ts                       # idempotent admin user
└── migrate-encrypt-secrets.ts          # encrypt legacy plaintext rows
vendor/thoughtworks-radar/              # offline-safe TW Radar snapshot
__tests__/
├── unit/                               # vitest, 90 tests, no :3000 needed
└── integration/                        # ADIP_INTEGRATION=1, hits :3000
docker-compose.yml                      # Postgres + Redis for dev/test
```

## Status

Both the hardening pass (security, correctness, build, tests) and the
Completion Plan (Postgres, BullMQ, multi-tenancy, LLM adapter, RAG, all 7
agents, scheduler, observability, notifications, D3 radar, parsers, ThoughtWorks
gap analysis, Python sidecar scaffold) are landed. `npm run check` is green
(90/90 unit tests). Production hardening items not yet shipped are tracked in
the plan file under "carry-forward".

## License

Internal project — license TBD.
