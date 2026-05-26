import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapErrorToResponse } from "@/lib/api-errors";

export async function GET(_request: NextRequest) {
  try {
    const documents = await db.document.findMany({
      where: { type: "CONTEXT_MAP" },
      include: { repository: { select: { id: true, name: true } } },
    });

    const repositories = await db.repository.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const formattedDocuments = documents.map((doc) => ({
      id: doc.id,
      repositoryId: doc.repositoryId,
      repositoryName: doc.repository.name,
      content: doc.content ?? "",
      contexts: [],
      status: doc.status,
      generatedAt: doc.generatedAt,
    }));

    // Polish Phase C (P2.9): no mock-data fallback.
    return NextResponse.json({
      documents: formattedDocuments,
      repositories: repositories.map((r) => ({
        id: r.id,
        name: r.name,
        hasContextMap: documents.some((d) => d.repositoryId === r.id),
      })),
    });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

function getDefaultRepositories() {
  return [
    { id: "1", name: "auth-service", hasContextMap: true },
    { id: "2", name: "payment-svc", hasContextMap: false },
    { id: "3", name: "notification", hasContextMap: false },
    { id: "4", name: "report-gen", hasContextMap: true },
    { id: "5", name: "user-management", hasContextMap: false },
  ];
}

function getDefaultDocuments() {
  return [
    {
      id: "1",
      repositoryId: "1",
      repositoryName: "auth-service",
      content: getDefaultMarkdown("auth-service"),
      contexts: getDefaultContexts(),
      status: "COMPLETED",
      generatedAt: new Date(),
    },
  ];
}

function getDefaultContexts() {
  return [
    {
      id: "1",
      name: "Identity Context",
      description: "Handles user authentication, authorization, and identity management",
      domainType: "Core Domain",
      relationships: [
        { target: "Notification Context", pattern: "OHS" },
        { target: "Payment Context", pattern: "ACL" },
      ],
    },
    {
      id: "2",
      name: "Notification Context",
      description: "Manages sending notifications via email, SMS, and push",
      domainType: "Supporting Domain",
      relationships: [
        { target: "Identity Context", pattern: "CF" },
      ],
    },
    {
      id: "3",
      name: "Payment Context",
      description: "Handles payment processing and transactions",
      domainType: "Core Domain",
      relationships: [
        { target: "Identity Context", pattern: "OHS" },
        { target: "Notification Context", pattern: "SK" },
      ],
    },
  ];
}

function getDefaultMarkdown(serviceName: string): string {
  return `# Context Map - ${serviceName}

## Overview

This document describes the bounded contexts and their relationships for the ${serviceName} service, following Domain-Driven Design (DDD) principles.

## Bounded Contexts

### Identity Context
**Domain Type:** Core Domain

**Description:** Handles user authentication, authorization, and identity management. This is the central context for all user-related operations.

**Key Responsibilities:**
- User registration and authentication
- Session management
- Role and permission management
- Token-based authorization (JWT)

**Relationships:**
- **Open Host Service (OHS)** to Notification Context
- **Anti-Corruption Layer (ACL)** to Payment Context

### Notification Context
**Domain Type:** Supporting Domain

**Description:** Manages sending notifications via multiple channels including email, SMS, and push notifications.

**Key Responsibilities:**
- Email notifications
- SMS alerts
- Push notifications
- Notification templates
- Delivery tracking

**Relationships:**
- **Conformist (CF)** to Identity Context

### Payment Context
**Domain Type:** Core Domain

**Description:** Handles payment processing, transaction management, and financial operations.

**Key Responsibilities:**
- Payment processing
- Transaction management
- Refund handling
- Payment method management
- Invoice generation

**Relationships:**
- **Open Host Service (OHS)** to Identity Context
- **Shared Kernel (SK)** to Notification Context

## Context Relationship Patterns

| Pattern | Abbreviation | Description |
|---------|-------------|-------------|
| Open Host Service | OHS | A context that provides a well-defined API for other contexts to use |
| Anti-Corruption Layer | ACL | A layer that translates between different models |
| Conformist | CF | A context that conforms to another context's model |
| Shared Kernel | SK | A shared subset of the domain model |

## Mermaid Diagram

\`\`\`mermaid
graph TB
    subgraph Identity Context
        IAM[Identity & Access Management]
    end
    
    subgraph Notification Context
        NOTIF[Notification Service]
    end
    
    subgraph Payment Context
        PAY[Payment Service]
    end
    
    IAM -->|OHS| NOTIF
    IAM -->|ACL| PAY
    NOTIF -->|CF| IAM
    PAY -->|OHS| IAM
    PAY -->|SK| NOTIF
\`\`\`

## Recommendations

1. **Event-Driven Communication:** Consider implementing event-driven communication between contexts using a message broker (Kafka/RabbitMQ)
2. **API Gateway:** Use an API Gateway to manage and route requests to different contexts
3. **Shared Language:** Establish a shared language for common concepts across contexts
`;
}
