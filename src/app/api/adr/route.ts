import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapErrorToResponse } from "@/lib/api-errors";
import { requireTenant, assertOwnership } from "@/lib/tenant";
import { logActivity } from "@/lib/audit";

export async function GET(_request: NextRequest) {
  try {
    const adrs = await db.aDR.findMany({
      include: { repository: { select: { name: true } } },
      orderBy: [{ repositoryId: "asc" }, { number: "asc" }],
    });

    const repositories = await db.repository.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const formattedADRs = adrs.map((adr) => ({
      id: adr.id,
      number: adr.number,
      title: adr.title,
      status: adr.status,
      repositoryName: adr.repository.name,
      context: adr.context,
      decision: adr.decision,
      consequences: adr.consequences,
      alternatives: adr.alternatives,
      createdAt: adr.createdAt,
      updatedAt: adr.updatedAt,
    }));

    const stats = {
      total: adrs.length,
      proposed: adrs.filter((a) => a.status === "PROPOSED").length,
      accepted: adrs.filter((a) => a.status === "ACCEPTED").length,
      deprecated: adrs.filter((a) => a.status === "DEPRECATED" || a.status === "SUPERSEDED").length,
    };

    // Polish Phase C (P2.9): no mock-data fallback.
    return NextResponse.json({
      adrs: formattedADRs,
      stats,
      repositories,
    });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = await request.json();
    const { repositoryId, title, context, decision, consequences, alternatives } = body;

    // Polish P5.3 — confirm tenant ownership of the repo before adding an ADR.
    const repo = await db.repository.findUnique({ where: { id: repositoryId }, select: { tenantId: true } });
    const own = assertOwnership(repo, ctx);
    if (own) return own;

    // Get the next ADR number for this repository
    const lastADR = await db.aDR.findFirst({
      where: { repositoryId },
      orderBy: { number: "desc" },
    });

    const number = (lastADR?.number || 0) + 1;

    const adr = await db.aDR.create({
      data: {
        repositoryId,
        number,
        title,
        context,
        decision,
        consequences,
        alternatives,
        status: "PROPOSED",
      },
      include: {
        repository: {
          select: { name: true },
        },
      },
    });

    await logActivity({
      ctx,
      action: "document.edit",
      entityType: "ADR",
      entityId: adr.id,
      details: { title, repositoryId },
    });

    return NextResponse.json({
      id: adr.id,
      number: adr.number,
      title: adr.title,
      status: adr.status,
      repositoryName: adr.repository.name,
      context: adr.context,
      decision: adr.decision,
      consequences: adr.consequences,
      alternatives: adr.alternatives,
      createdAt: adr.createdAt,
      updatedAt: adr.updatedAt,
    });
  } catch (error) {
    console.error("Error creating ADR:", error);
    return NextResponse.json({ error: "Failed to create ADR" }, { status: 500 });
  }
}

function getDefaultRepositories() {
  return [
    { id: "1", name: "auth-service" },
    { id: "2", name: "payment-svc" },
    { id: "3", name: "notification" },
    { id: "4", name: "report-gen" },
    { id: "5", name: "user-management" },
  ];
}

function getDefaultADRData(repositories: { id: string; name: string }[]) {
  const adrs = [
    {
      id: "1",
      number: 1,
      title: "Use PostgreSQL as Primary Database",
      status: "ACCEPTED",
      repositoryName: "auth-service",
      context: "The authentication service requires a reliable, ACID-compliant database for storing user credentials and session data. We evaluated several options including PostgreSQL, MySQL, and MongoDB.",
      decision: "We will use PostgreSQL as the primary database for the authentication service. PostgreSQL provides strong ACID guarantees, excellent performance for read-heavy workloads, and built-in support for JSON data types.",
      consequences: "The team needs to be proficient in PostgreSQL administration. We will need to set up connection pooling using PgBouncer for production workloads.",
      alternatives: "MySQL was considered but lacks some advanced features. MongoDB was rejected due to consistency concerns for authentication data.",
      createdAt: new Date("2024-01-15"),
      updatedAt: new Date("2024-01-15"),
    },
    {
      id: "2",
      number: 2,
      title: "Implement Event-Driven Architecture with Kafka",
      status: "ACCEPTED",
      repositoryName: "payment-svc",
      context: "The payment service needs to communicate with multiple downstream services for transaction processing, notifications, and reporting. We need a reliable messaging system.",
      decision: "We will implement Apache Kafka as the message broker for event-driven communication between services. This allows for reliable event streaming and replay capabilities.",
      consequences: "Operations team needs to manage Kafka cluster. Messages need proper schema versioning.",
      alternatives: "RabbitMQ was considered but lacks the throughput we need. AWS SQS was rejected to avoid vendor lock-in.",
      createdAt: new Date("2024-02-10"),
      updatedAt: new Date("2024-02-10"),
    },
    {
      id: "3",
      number: 3,
      title: "Adopt TypeScript for All New Services",
      status: "PROPOSED",
      repositoryName: "notification",
      context: "We currently have a mix of JavaScript and TypeScript codebases. For better maintainability and developer experience, we need to standardize on a single language.",
      decision: "All new services will be written in TypeScript. Existing JavaScript services will be gradually migrated when significant changes are made.",
      consequences: "Team needs TypeScript training. Build process will be slightly more complex but worth the type safety benefits.",
      alternatives: "Continue with mixed codebase - rejected due to maintenance overhead.",
      createdAt: new Date("2024-03-01"),
      updatedAt: new Date("2024-03-01"),
    },
    {
      id: "4",
      number: 1,
      title: "Use Redis for Caching Layer",
      status: "ACCEPTED",
      repositoryName: "report-gen",
      context: "Report generation involves expensive database queries. We need a caching layer to improve performance.",
      decision: "Redis will be used as the caching layer with a TTL-based invalidation strategy.",
      consequences: "Need to handle cache invalidation properly. Additional infrastructure to manage.",
      alternatives: "Memcached was considered but Redis provides more data structures.",
      createdAt: new Date("2024-02-20"),
      updatedAt: new Date("2024-02-20"),
    },
    {
      id: "5",
      number: 4,
      title: "Migrate from REST to GraphQL",
      status: "PROPOSED",
      repositoryName: "auth-service",
      context: "Mobile clients are making multiple REST calls to fetch related data. This leads to over-fetching and under-fetching issues.",
      decision: "We propose implementing GraphQL API alongside existing REST APIs for mobile clients.",
      consequences: "Need to implement GraphQL server and train the team. REST APIs will be maintained for backward compatibility.",
      alternatives: "Continue with REST and implement API composition layer - rejected due to complexity.",
      createdAt: new Date("2024-03-05"),
      updatedAt: new Date("2024-03-05"),
    },
  ];

  const stats = {
    total: adrs.length,
    proposed: adrs.filter((a) => a.status === "PROPOSED").length,
    accepted: adrs.filter((a) => a.status === "ACCEPTED").length,
    deprecated: adrs.filter((a) => a.status === "DEPRECATED" || a.status === "SUPERSEDED").length,
  };

  return {
    adrs,
    stats,
    repositories: repositories.length > 0 ? repositories : getDefaultRepositories(),
  };
}
