import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const documents = await db.document.findMany({
      where: {
        type: { in: ["C4_CONTEXT", "C4_CONTAINER", "C4_COMPONENT"] },
      },
      include: {
        repository: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const repositories = await db.repository.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    // Group documents by repository
    const documentsByRepo = new Map<string, typeof documents>();
    documents.forEach((doc) => {
      const repoId = doc.repositoryId;
      if (!documentsByRepo.has(repoId)) {
        documentsByRepo.set(repoId, []);
      }
      documentsByRepo.get(repoId)!.push(doc);
    });

    // Build document list
    const formattedDocuments = repositories.map((repo) => {
      const repoDocs = documentsByRepo.get(repo.id) || [];
      const hasC4Context = repoDocs.some((d) => d.type === "C4_CONTEXT");
      const hasC4Container = repoDocs.some((d) => d.type === "C4_CONTAINER");
      const hasC4Component = repoDocs.some((d) => d.type === "C4_COMPONENT");

      const contextDoc = repoDocs.find((d) => d.type === "C4_CONTEXT");
      const containerDoc = repoDocs.find((d) => d.type === "C4_CONTAINER");
      const componentDoc = repoDocs.find((d) => d.type === "C4_COMPONENT");

      return {
        id: repo.id,
        repositoryId: repo.id,
        repositoryName: repo.name,
        level: hasC4Component ? 3 : hasC4Container ? 2 : hasC4Context ? 1 : 0,
        content: contextDoc?.content || containerDoc?.content || componentDoc?.content || "",
        components: generateDefaultComponents(repo.name),
        generatedAt: contextDoc?.generatedAt || containerDoc?.generatedAt || componentDoc?.generatedAt,
        status: hasC4Context ? "COMPLETED" : "PENDING",
      };
    });

    // If no documents, return defaults
    if (documents.length === 0) {
      return NextResponse.json({
        documents: getDefaultDocuments(),
        repositories: repositories.length > 0
          ? repositories.map((r) => ({ id: r.id, name: r.name, hasC4: false }))
          : getDefaultRepositories(),
      });
    }

    return NextResponse.json({
      documents: formattedDocuments,
      repositories: repositories.map((r) => ({
        id: r.id,
        name: r.name,
        hasC4: documentsByRepo.has(r.id),
      })),
    });
  } catch (error) {
    console.error("Error fetching C4 data:", error);
    return NextResponse.json({
      documents: getDefaultDocuments(),
      repositories: getDefaultRepositories(),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { repositoryId, level, content } = body;

    const documentType = level === 1 ? "C4_CONTEXT" : level === 2 ? "C4_CONTAINER" : "C4_COMPONENT";

    const document = await db.document.create({
      data: {
        repositoryId,
        type: documentType,
        status: "COMPLETED",
        content,
        generatedAt: new Date(),
        generatedBy: "ADIP",
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        action: "C4_GENERATED",
        entityType: "DOCUMENT",
        entityId: document.id,
        details: JSON.stringify({ repositoryId, level }),
      },
    });

    return NextResponse.json(document);
  } catch (error) {
    console.error("Error creating C4 document:", error);
    return NextResponse.json({ error: "Failed to create C4 document" }, { status: 500 });
  }
}

function generateDefaultComponents(repoName: string) {
  return [
    {
      id: "1",
      name: "Web Application",
      type: "container",
      level: 2,
      description: "Frontend web application",
      technology: "React, TypeScript",
      relationships: [
        { target: "API Server", label: "HTTP/REST" },
      ],
    },
    {
      id: "2",
      name: "API Server",
      type: "container",
      level: 2,
      description: "Backend API server",
      technology: "Node.js, Express",
      relationships: [
        { target: "Database", label: "SQL" },
      ],
    },
    {
      id: "3",
      name: "Database",
      type: "container",
      level: 2,
      description: "Primary data store",
      technology: "PostgreSQL",
      relationships: [],
    },
    {
      id: "4",
      name: "Auth Controller",
      type: "component",
      level: 3,
      description: "Handles authentication logic",
      technology: "TypeScript",
      relationships: [
        { target: "User Service", label: "uses" },
      ],
    },
    {
      id: "5",
      name: "User Service",
      type: "component",
      level: 3,
      description: "User management business logic",
      technology: "TypeScript",
      relationships: [
        { target: "Database", label: "queries" },
      ],
    },
  ];
}

function getDefaultRepositories() {
  return [
    { id: "1", name: "auth-service", hasC4: true },
    { id: "2", name: "payment-svc", hasC4: true },
    { id: "3", name: "notification", hasC4: false },
    { id: "4", name: "report-gen", hasC4: true },
    { id: "5", name: "user-management", hasC4: false },
  ];
}

function getDefaultDocuments() {
  return [
    {
      id: "1",
      repositoryId: "1",
      repositoryName: "auth-service",
      level: 3,
      content: `# C4 Architecture Documentation - auth-service

## Level 1: System Context

### System Context Diagram

\`\`\`mermaid
graph TB
    User[User]
    AuthSystem[Auth Service]
    PaymentSystem[Payment Service]
    NotificationSystem[Notification Service]
    
    User --> AuthSystem
    PaymentSystem --> AuthSystem
    NotificationSystem --> AuthSystem
\`\`\`

### Description

The Authentication Service is responsible for managing user authentication and authorization across the platform. It handles user login, session management, and token-based authentication.

### Users
- **End Users**: Authenticate via web and mobile applications
- **System Administrators**: Manage users and permissions

### External Systems
- **Payment Service**: Validates user sessions for transactions
- **Notification Service**: Receives user preferences for notifications

## Level 2: Containers

\`\`\`mermaid
graph TB
    subgraph Auth Service
        WebApp[Web App<br/>React]
        MobileApp[Mobile App<br/>React Native]
        API[API Server<br/>Node.js]
        DB[(Database<br/>PostgreSQL)]
        Cache[(Cache<br/>Redis)]
    end
    
    WebApp --> API
    MobileApp --> API
    API --> DB
    API --> Cache
\`\`\`

### Containers

| Container | Technology | Description |
|-----------|------------|-------------|
| Web App | React, TypeScript | Frontend SPA for user authentication |
| Mobile App | React Native | Mobile application for iOS and Android |
| API Server | Node.js, Express | RESTful API for authentication operations |
| Database | PostgreSQL | Primary data store for users and sessions |
| Cache | Redis | Session cache for fast token validation |

## Level 3: Components

### API Server Components

\`\`\`mermaid
graph TB
    subgraph API Server
        AuthController[Auth Controller]
        UserController[User Controller]
        SessionService[Session Service]
        TokenService[Token Service]
        UserRepository[User Repository]
    end
    
    AuthController --> SessionService
    AuthController --> TokenService
    UserController --> UserRepository
    SessionService --> UserRepository
\`\`\`

| Component | Description |
|-----------|-------------|
| Auth Controller | Handles login, logout, and token refresh endpoints |
| User Controller | Manages user CRUD operations |
| Session Service | Session lifecycle management |
| Token Service | JWT token generation and validation |
| User Repository | Database operations for user data |
`,
      components: generateDefaultComponents("auth-service"),
      generatedAt: new Date(),
      status: "COMPLETED",
    },
    {
      id: "2",
      repositoryId: "2",
      repositoryName: "payment-svc",
      level: 2,
      content: `# C4 Architecture Documentation - payment-svc

## Level 1: System Context

The Payment Service handles all financial transactions within the platform.

## Level 2: Containers

\`\`\`mermaid
graph TB
    subgraph Payment Service
        API[Payment API<br/>Java/Spring Boot]
        Worker[Payment Worker<br/>Java]
        DB[(Database<br/>PostgreSQL)]
        MQ[Message Queue<br/>Kafka]
    end
    
    API --> DB
    Worker --> DB
    API --> MQ
    Worker --> MQ
\`\`\`
`,
      components: generateDefaultComponents("payment-svc"),
      generatedAt: new Date(),
      status: "COMPLETED",
    },
  ];
}
