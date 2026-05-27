// Audit log helper.
//
// Polish Phase E (P5.2). Every mutation-shaped API route call
// site MUST go through `logActivity` — the TypeScript signature
// refuses callers without a TenantContext (which carries tenantId
// + userId), so audit coverage is enforced by the compiler.
//
// `logActivitySystem` is the escape hatch for code paths that run
// outside an HTTP request (janitor, scheduler, worker bootstrap).
// Those rows land with `tenantId: null` and a fixed `userId: "system"`.
//
// Writes are best-effort: a failure to record an audit row never
// blocks the action itself. The failure is logged via Pino so it is
// still visible in monitoring.

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { TenantContext } from "@/lib/tenant";

const log = logger("audit");

/**
 * Concrete action strings are kept as a string union here so a typo at
 * a call site is caught at compile time. Extend the union when new
 * mutation kinds appear — the audit-sweep tests (P5.3) check that
 * every new kind shows up in at least one row.
 */
export type AuditAction =
  // Auth
  | "signin.success"
  | "signin.failure"
  | "signout"
  | "password.change"
  | "password.reset"
  | "user.invite.accepted"
  // Settings
  | "connection.create"
  | "connection.update"
  | "connection.delete"
  | "ai-provider.create"
  | "ai-provider.update"
  | "ai-provider.delete"
  | "ai-provider.rotate-key"
  | "encryption-key.rotate"
  | "webhook.set"
  | "schedule.create"
  | "schedule.update"
  | "schedule.delete"
  | "schedule.toggle"
  // Repositories + analysis
  | "repository.create"
  | "repository.update"
  | "repository.delete"
  | "analysis.start"
  | "analysis.cancel"
  // Admin (users)
  | "user.invite"
  | "user.role.change"
  | "user.deactivate"
  | "user.reactivate"
  // Documents
  | "document.edit"
  | "document.regenerate"
  // Notifications (Polish P6.4)
  | "notification.retry";

export type LogActivityArgs = {
  ctx: TenantContext;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  /** Free-form JSON payload — caller is responsible for not leaking secrets. */
  details?: Record<string, unknown>;
};

/**
 * Record a tenant-scoped, user-attributed audit row. Best-effort: a
 * write failure never propagates.
 */
export async function logActivity(args: LogActivityArgs): Promise<void> {
  try {
    await db.activityLog.create({
      data: {
        tenantId: args.ctx.tenantId,
        userId: args.ctx.session.user.id,
        action: args.action,
        entityType: args.entityType,
        entityId: args.entityId,
        details: args.details ? JSON.stringify(args.details) : null,
      },
    });
  } catch (err) {
    log.warn(
      {
        action: args.action,
        entityType: args.entityType,
        entityId: args.entityId,
        err: err instanceof Error ? err.message : String(err),
      },
      "audit write failed"
    );
  }
}

/**
 * Record a system-emitted audit row — janitor sweeps, schedule fanouts,
 * worker boot. tenantId is null; userId is the literal "system".
 */
export async function logActivitySystem(args: {
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.activityLog.create({
      data: {
        tenantId: null,
        userId: "system",
        action: args.action,
        entityType: args.entityType,
        entityId: args.entityId,
        details: args.details ? JSON.stringify(args.details) : null,
      },
    });
  } catch (err) {
    log.warn(
      {
        action: args.action,
        entityType: args.entityType,
        err: err instanceof Error ? err.message : String(err),
      },
      "system audit write failed"
    );
  }
}
