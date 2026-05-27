// Prometheus metrics registry. Counters + histograms for the core SLOs
// from the proposal: analysis run rate, LLM token spend, VCS request
// latency, queue depth.
//
// The Next.js `/api/metrics` route and the worker / WS service each expose
// the same registry shape. In a multi-process deploy each process is
// scraped separately; aggregation is the scraper's job.

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

export const analysisRunsTotal = new Counter({
  name: "adip_analysis_runs_total",
  help: "Number of analysis runs by terminal status.",
  labelNames: ["status"] as const,
  registers: [metricsRegistry],
});

export const llmTokensTotal = new Counter({
  name: "adip_llm_tokens_total",
  help: "LLM tokens consumed by provider/model and direction.",
  labelNames: ["provider", "model", "direction"] as const,
  registers: [metricsRegistry],
});

export const vcsRequestSeconds = new Histogram({
  name: "adip_vcs_request_seconds",
  help: "VCS HTTP request latency.",
  labelNames: ["provider", "operation", "status_class"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [metricsRegistry],
});

export const queueJobsActive = new Gauge({
  name: "adip_queue_jobs_active",
  help: "Active jobs by queue and state.",
  labelNames: ["queue", "state"] as const,
  registers: [metricsRegistry],
});

export const agentDurationSeconds = new Histogram({
  name: "adip_agent_duration_seconds",
  help: "Per-agent wall-clock duration.",
  labelNames: ["agent_type", "status"] as const,
  buckets: [1, 5, 15, 30, 60, 120, 300, 600, 900],
  registers: [metricsRegistry],
});

// Polish P6.3 — per-dependency gauges. Set from a periodic poll either in
// the Next.js process (db pool) or in the WS service (clients). The
// queue-depth gauge is updated each worker tick.
//
// NOTE: dbPool{Active,Idle} are sourced from Prisma's `$metrics.json()` if
// the `metrics` preview feature is enabled in schema.prisma; otherwise both
// stay at 0. The `/api/metrics` route attempts a best-effort sync each
// scrape (see src/app/api/metrics/route.ts). Enabling the preview is a
// follow-up migration — keep the gauges so the dashboard does not need a
// later metric-name change.
export const dbPoolActive = new Gauge({
  name: "adip_db_pool_active",
  help: "Active database connections in the pool.",
  registers: [metricsRegistry],
});

export const dbPoolIdle = new Gauge({
  name: "adip_db_pool_idle",
  help: "Idle database connections in the pool.",
  registers: [metricsRegistry],
});

export const wsClientsTotal = new Gauge({
  name: "adip_ws_clients_total",
  help: "Currently connected WebSocket clients.",
  registers: [metricsRegistry],
});

export const notificationDeliveriesTotal = new Counter({
  name: "adip_notification_deliveries_total",
  help: "Notification deliveries by channel and status.",
  labelNames: ["channel", "status"] as const,
  registers: [metricsRegistry],
});
