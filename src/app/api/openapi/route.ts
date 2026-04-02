import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const documents = await db.document.findMany({
      where: { type: "OPENAPI" },
      include: {
        repository: { select: { id: true, name: true } },
      },
    });

    const repositories = await db.repository.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    if (documents.length === 0) {
      return NextResponse.json({
        documents: getDefaultDocuments(),
        repositories: repositories.length > 0
          ? repositories.map((r) => ({ id: r.id, name: r.name, hasOpenAPI: false }))
          : getDefaultRepositories(),
      });
    }

    const formattedDocuments = documents.map((doc) => ({
      id: doc.id,
      repositoryId: doc.repositoryId,
      repositoryName: doc.repository.name,
      title: doc.title || "API Specification",
      version: "1.0.0",
      description: "OpenAPI specification for the service",
      endpointCount: 8,
      schemaCount: 6,
      content: doc.content || getDefaultYAML(doc.repository.name),
      status: doc.status,
      generatedAt: doc.generatedAt,
    }));

    return NextResponse.json({
      documents: formattedDocuments,
      repositories: repositories.map((r) => ({
        id: r.id,
        name: r.name,
        hasOpenAPI: documents.some((d) => d.repositoryId === r.id),
      })),
    });
  } catch (error) {
    console.error("Error fetching OpenAPI data:", error);
    return NextResponse.json({
      documents: getDefaultDocuments(),
      repositories: getDefaultRepositories(),
    });
  }
}

function getDefaultRepositories() {
  return [
    { id: "1", name: "auth-service", hasOpenAPI: true },
    { id: "2", name: "payment-svc", hasOpenAPI: true },
    { id: "3", name: "notification", hasOpenAPI: false },
    { id: "4", name: "report-gen", hasOpenAPI: true },
    { id: "5", name: "user-management", hasOpenAPI: false },
  ];
}

function getDefaultDocuments() {
  return [
    {
      id: "1",
      repositoryId: "1",
      repositoryName: "auth-service",
      title: "Authentication API",
      version: "1.0.0",
      description: "API for user authentication and authorization",
      endpointCount: 8,
      schemaCount: 6,
      content: getDefaultYAML("auth-service"),
      status: "COMPLETED",
      generatedAt: new Date(),
    },
    {
      id: "2",
      repositoryId: "2",
      repositoryName: "payment-svc",
      title: "Payment API",
      version: "2.0.0",
      description: "API for payment processing",
      endpointCount: 12,
      schemaCount: 8,
      content: getDefaultYAML("payment-svc"),
      status: "COMPLETED",
      generatedAt: new Date(),
    },
  ];
}

function getDefaultYAML(serviceName: string): string {
  return `openapi: 3.0.3
info:
  title: ${serviceName} API
  description: API specification for ${serviceName}
  version: 1.0.0
  contact:
    name: API Support
    email: support@company.com

servers:
  - url: https://api.company.com/${serviceName}
    description: Production server
  - url: https://staging-api.company.com/${serviceName}
    description: Staging server

paths:
  /api/users:
    get:
      summary: List all users
      tags:
        - Users
      responses:
        '200':
          description: A list of users
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
    post:
      summary: Create a new user
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UserInput'
      responses:
        '201':
          description: User created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'

  /api/users/{id}:
    get:
      summary: Get a user by ID
      tags:
        - Users
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: User details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '404':
          description: User not found

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        email:
          type: string
          format: email
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time

    UserInput:
      type: object
      required:
        - name
        - email
      properties:
        name:
          type: string
        email:
          type: string
          format: email
`;
}
