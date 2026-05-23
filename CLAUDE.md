# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ADIP (ArchDoc Intelligence Platform) — a Next.js 16 app that connects to git repositories,
analyzes them with a multi-agent pipeline, and auto-generates architecture documentation:
Technology Radar, C4 models, ADRs, OpenAPI specs, and DDD Context Maps.

## Runtime & commands

Runtime is **Bun**, not Node. The package manager is `bun`.

```bash
bun install
bun run dev          # Next.js dev server on port 3000 (tees to dev.log)
bun run build        # next build + copies .next/static & public into .next/standalone
bun start            # runs the standalone production server
bun run lint         # eslint

bun run db:push      # apply prisma schema to the SQLite db (no migration files)
bun run db:generate  # regenerate Prisma client
bun run db:migrate   # create + apply a dev migration
bun run db:reset     # drop and recreate the db

bun test                              # run all tests in __tests__/ (bun:test)
bun test __tests__/api.test.ts        # run one test file
```

The API test files (`api.test.ts`, `additional-api.test.ts`) hit `http://localhost:3000`,
so the dev server must be running before `bun test`. `dashboard-utils.test.ts` is pure-unit.

The WebSocket mini-service is started separately (`bun run dev` in `mini-services/analysis-ws/`,
or use `.zscripts/dev.sh` which launches both). Analysis progress will not appear without it.

## Build will not catch type/lint errors

`next.config.ts` sets `typescript.ignoreBuildErrors: true` and `reactStrictMode: false`.
`eslint.config.mjs` disables almost every rule (including `no-unused-vars`, `no-explicit-any`).
A passing build/lint says little — verify changes by running them. Path alias: `@/*` → `./src/*`.

## Database

SQLite via Prisma (`prisma/schema.prisma`, ~14 models). The schema uses no relational
features SQLite lacks; JSON-shaped fields (languages, frameworks, relationships, metadata,
errors) are stored as `String` columns holding `JSON.stringify`'d values — parse on read.
Connection is `DATABASE_URL` (a `file:` URL); no `.env` is committed. `src/lib/db.ts`
exports a singleton `db` (global-cached in non-production).

## Architecture

### Frontend is a single client page

`src/app/page.tsx` is one `"use client"` component holding an `activeView` state string.
It swaps between 8 feature components (dashboard, repositories, radar, adr, c4, openapi,
context-map, settings) — there is **no per-page routing**. Navigation is the sidebar in
`src/components/layout/dashboard-layout.tsx`. Each feature page lives under
`src/components/<feature>/` and fetches from its matching API route.

### API routes

`src/app/api/**/route.ts` — one route group per feature, plus
`repositories/[id]/analysis/` (start/cancel/list analysis runs). Standard Next.js
App Router handlers; dynamic `params` are a Promise (`await params`).

### Multi-agent analysis pipeline (`src/lib/agents/`)

The core of the app. An analysis is run by `AgentOrchestrator` (`orchestrator.ts`):

1. Loads repository + AI provider context from the DB.
2. Builds a VCS client and fetches a filtered file set (dependency/config/ADR/API/docs
   files always; source files sampled, max 50).
3. Runs each enabled agent **sequentially**, ordered by `priority`.
4. Persists each agent's result back into the DB (`Technology`, `RadarItem`, `Document`,
   `ADR`, …) and updates the `AnalysisRun` row.

Agents extend `BaseAgent` (`base-agent.ts`): it provides timeout-wrapped `execute()`,
progress reporting, and file helpers; subclasses implement `analyze()`. Concrete agents:
`TechRadarAgent`, `C4Agent`, `ADRAgent`, `OpenAPIAgent` (`asyncapi` reuses `OpenAPIAgent`).
Agent registration and default priority/timeout live in `createAgentConfig()`.

Entry points: `runAnalysis()` (helper) and `POST /api/repositories/[id]/analysis`.
Both kick off `orchestrator.execute()` **without awaiting it** — analysis runs in the
background and reports via WebSocket.

### VCS layer (`src/lib/vcs/`)

`createVCSClient()` / `createPublicVCSClient()` build a `GitHubClient`, `GitLabClient`,
or `BitbucketClient` from a connection record (or for an unauthenticated public repo).
All implement the `VCSClient` interface. `parseRepositoryUrl()` extracts owner/repo from
a URL; `FILE_PATTERNS` defines which files the orchestrator fetches.

### Real-time progress (WebSocket)

`mini-services/analysis-ws/index.ts` is a standalone socket.io server on **port 3003**,
separate from Next.js. The orchestrator pushes progress to it via HTTP
`POST localhost:3003/notify/{progress|complete|error}`. The browser connects through the
Caddy gateway path `/?XTransformPort=3003` — see `src/hooks/use-analysis-websocket.ts`,
which also starts the analysis via the REST API. Do not change the socket.io `path: '/'`.

### AI provider integration

AI calls use the `z-ai-web-dev-sdk` (`ZAI.create()`), e.g. `api/adr/ai-generate/route.ts`.
The `AIProvider` DB model stores per-repo or default provider config; analysis resolves
the repository's provider or falls back to the `isDefault` one.

## Deployment scripts (`.zscripts/`)

These target the Z.ai cloud build environment and **hardcode the path `/home/z/my-project`** —
they will not run as-is locally. `build.sh` builds Next.js standalone + bundles each
`mini-services/*` with `bun build`, then tars everything; `start.sh` launches the standalone
server, the mini-services, and Caddy. `Caddyfile` reverse-proxies `:81` → `:3000` (and to an
arbitrary port via the `XTransformPort` query param, used for the WebSocket service).
