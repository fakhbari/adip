// OpenAPI Agent - Detects API endpoints and generates OpenAPI specification

import { BaseAgent, createAgentConfig } from "./base-agent";
import { 
  AgentResult, 
  AnalysisContext, 
  OpenAPIResult,
  DetectedEndpoint,
  DetectedSchema,
} from "./types";

// HTTP method patterns
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

// API route patterns for different frameworks
const ROUTE_PATTERNS = {
  // Next.js App Router
  nextJsAppRouter: {
    pattern: /app\/api\/(.+)\/route\.(ts|js)/,
    extract: (match: RegExpMatchArray) => {
      const path = match[1];
      return path.split("/").map(p => 
        p.startsWith("[") && p.endsWith("]") ? `{${p.slice(1, -1)}}` : p
      ).join("/");
    },
  },
  // Next.js Pages Router
  nextJsPages: {
    pattern: /pages\/api\/(.+)\.(ts|js)/,
    extract: (match: RegExpMatchArray) => {
      const path = match[1];
      return path.split("/").map(p => 
        p.startsWith("[") && p.endsWith("]") ? `{${p.slice(1, -1)}}` : p
      ).join("/");
    },
  },
  // Express/Fastify
  express: {
    pattern: /(?:app|router|fastify)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    extract: (match: RegExpExecArray) => ({ method: match[1], path: match[2] }),
  },
  // NestJS
  nestJs: {
    pattern: /@(Get|Post|Put|Patch|Delete)\s*\(\s*['"`]?([^'"`\)]*)['"`]?\s*\)/g,
    extract: (match: RegExpExecArray) => ({ method: match[1].toLowerCase(), path: match[2] || "/" }),
  },
  // Python FastAPI
  fastApi: {
    pattern: /@(app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    extract: (match: RegExpExecArray) => ({ method: match[2], path: match[3] }),
  },
  // Python Flask
  flask: {
    pattern: /@app\.route\s*\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?/g,
    extract: (match: RegExpExecArray) => ({ 
      path: match[1], 
      methods: match[2] ? match[2].replace(/['"\s]/g, "").split(",") : ["get"] 
    }),
  },
  // Go Gin/Echo
  goRouter: {
    pattern: /\.(GET|POST|PUT|PATCH|DELETE)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    extract: (match: RegExpExecArray) => ({ method: match[1].toLowerCase(), path: match[2] }),
  },
};

// Schema/Type patterns
const SCHEMA_PATTERNS = {
  typescript: /(?:interface|type)\s+(\w+)\s*(?:<[^>]+>)?\s*(?:=|{)/g,
  zod: /z\.object\s*\(\s*{([^}]+)}\s*\)/g,
  pydantic: /class\s+(\w+)\s*\([^)]*BaseModel[^)]*\)/g,
  java: /public\s+class\s+(\w+)\s*(?:DTO|Request|Response|Entity)/g,
};

export class OpenAPIAgent extends BaseAgent {
  constructor() {
    super(createAgentConfig("openapi"));
  }

  async analyze(context: AnalysisContext): Promise<AgentResult> {
    const startTime = Date.now();
    const endpoints: DetectedEndpoint[] = [];
    const schemas: DetectedSchema[] = [];

    this.updateProgress(5, "Scanning for API route files...");

    // Get all API-related files
    const apiFiles = this.getAPIFiles(context);

    this.updateProgress(20, "Detecting API endpoints...");

    // Detect endpoints from route files
    for (const [path, content] of apiFiles) {
      const detectedEndpoints = this.detectEndpoints(path, content);
      endpoints.push(...detectedEndpoints);
    }

    this.updateProgress(50, "Analyzing request/response schemas...");

    // Detect schemas from model/entity files
    for (const [path, content] of context.fileContents) {
      if (this.isSchemaFile(path)) {
        const detectedSchemas = this.detectSchemas(path, content);
        schemas.push(...detectedSchemas);
      }
    }

    this.updateProgress(70, "Generating OpenAPI specification...");

    // Generate OpenAPI spec
    const openapiSpec = this.generateOpenAPISpec(
      context.repository.name,
      context.repository.description || undefined,
      endpoints,
      schemas
    );

    this.updateProgress(90, "Finalizing results...");

    this.filesAnalyzed = apiFiles.size + schemas.length;

    const result: OpenAPIResult = {
      endpoints,
      schemas,
      openapiSpec,
      confidence: this.calculateConfidence(endpoints, schemas),
    };

    return {
      agentType: "openapi",
      status: "success",
      data: result,
      duration: Date.now() - startTime,
      filesAnalyzed: this.filesAnalyzed,
    };
  }

  // Get API-related files
  private getAPIFiles(context: AnalysisContext): Map<string, string> {
    const apiFiles = new Map<string, string>();

    for (const [path, content] of context.fileContents) {
      const isAPI = 
        // Next.js App Router
        /app\/api\/.+\/route\.(ts|js)/.test(path) ||
        // Next.js Pages Router
        /pages\/api\/.+\.(ts|js)/.test(path) ||
        // Express/Fastify/NestJS
        /routes?\//.test(path) ||
        /controllers?\//.test(path) ||
        /handlers?\//.test(path) ||
        // Python
        /main\.py$/.test(path) ||
        /routes?\.py$/.test(path) ||
        /views\.py$/.test(path) ||
        // Go
        /main\.go$/.test(path) ||
        /routes?\.go$/.test(path) ||
        /handlers?\.go$/.test(path);

      if (isAPI && content) {
        apiFiles.set(path, content);
      }
    }

    return apiFiles;
  }

  // Check if file is a schema/model file
  private isSchemaFile(path: string): boolean {
    return (
      /models?\//.test(path) ||
      /entities?\//.test(path) ||
      /schemas?\//.test(path) ||
      /types?\//.test(path) ||
      /dtos?\//.test(path) ||
      /dto\./.test(path) ||
      /schema\./.test(path) ||
      /model\./.test(path) ||
      /entity\./.test(path) ||
      /types?\./.test(path)
    );
  }

  // Detect endpoints from file
  private detectEndpoints(path: string, content: string): DetectedEndpoint[] {
    const endpoints: DetectedEndpoint[] = [];

    // Try Next.js App Router pattern
    const nextAppMatch = path.match(ROUTE_PATTERNS.nextJsAppRouter.pattern);
    if (nextAppMatch) {
      const routePath = ROUTE_PATTERNS.nextJsAppRouter.extract(nextAppMatch);
      
      // Check for exported HTTP methods
      for (const method of HTTP_METHODS) {
        const exportPattern = new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\s*\\(|export\\s+const\\s+${method}\\s*=`, "i");
        if (exportPattern.test(content)) {
          endpoints.push({
            path: `/${routePath}`,
            method: method.toUpperCase(),
            controller: path,
            handler: method,
          });
        }
      }
    }

    // Try Next.js Pages Router pattern
    const nextPagesMatch = path.match(ROUTE_PATTERNS.nextJsPages.pattern);
    if (nextPagesMatch) {
      const routePath = ROUTE_PATTERNS.nextJsPages.extract(nextPagesMatch);
      
      // Default handler
      if (content.includes("export default") || content.includes("export const config")) {
        // Check for specific methods
        const hasSpecificMethod = HTTP_METHODS.some(m => 
          new RegExp(`req\\.method\\s*(?:===?|!==?)\\s*['"]${m.toUpperCase()}['"]`, "i").test(content)
        );

        if (hasSpecificMethod) {
          for (const method of HTTP_METHODS) {
            if (new RegExp(`req\\.method\\s*(?:===?|!==?)\\s*['"]${m.toUpperCase()}['"]`, "i").test(content)) {
              endpoints.push({
                path: `/api/${routePath}`,
                method: method.toUpperCase(),
                controller: path,
              });
            }
          }
        } else {
          endpoints.push({
            path: `/api/${routePath}`,
            method: "GET", // Assume GET as default
            controller: path,
          });
        }
      }
    }

    // Try Express/Fastify pattern
    let expressMatch;
    const expressRegex = new RegExp(ROUTE_PATTERNS.express.pattern.source, "g");
    while ((expressMatch = expressRegex.exec(content)) !== null) {
      const { method, path: routePath } = ROUTE_PATTERNS.express.extract(expressMatch);
      endpoints.push({
        path: routePath,
        method: method.toUpperCase(),
        controller: path,
      });
    }

    // Try NestJS pattern
    let nestMatch;
    const nestRegex = new RegExp(ROUTE_PATTERNS.nestJs.pattern.source, "g");
    while ((nestMatch = nestRegex.exec(content)) !== null) {
      const { method, path: routePath } = ROUTE_PATTERNS.nestJs.extract(nestMatch);
      // Need to find the controller base path
      const controllerMatch = content.match(/@Controller\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
      const basePath = controllerMatch ? controllerMatch[1] : "";
      endpoints.push({
        path: `${basePath}${routePath}`,
        method: method.toUpperCase(),
        controller: path,
      });
    }

    // Try FastAPI pattern
    let fastApiMatch;
    const fastApiRegex = new RegExp(ROUTE_PATTERNS.fastApi.pattern.source, "g");
    while ((fastApiMatch = fastApiRegex.exec(content)) !== null) {
      const { method, path: routePath } = ROUTE_PATTERNS.fastApi.extract(fastApiMatch);
      endpoints.push({
        path: routePath,
        method: method.toUpperCase(),
        controller: path,
      });
    }

    // Try Flask pattern
    let flaskMatch;
    const flaskRegex = new RegExp(ROUTE_PATTERNS.flask.pattern.source, "g");
    while ((flaskMatch = flaskRegex.exec(content)) !== null) {
      const { path: routePath, methods } = ROUTE_PATTERNS.flask.extract(flaskMatch);
      for (const method of methods) {
        endpoints.push({
          path: routePath,
          method: method.toUpperCase(),
          controller: path,
        });
      }
    }

    // Try Go router pattern
    let goMatch;
    const goRegex = new RegExp(ROUTE_PATTERNS.goRouter.pattern.source, "g");
    while ((goMatch = goRegex.exec(content)) !== null) {
      const { method, path: routePath } = ROUTE_PATTERNS.goRouter.extract(goMatch);
      endpoints.push({
        path: routePath,
        method: method.toUpperCase(),
        controller: path,
      });
    }

    // Deduplicate
    const uniqueEndpoints = new Map<string, DetectedEndpoint>();
    for (const endpoint of endpoints) {
      const key = `${endpoint.method}:${endpoint.path}`;
      if (!uniqueEndpoints.has(key)) {
        uniqueEndpoints.set(key, endpoint);
      }
    }

    return Array.from(uniqueEndpoints.values());
  }

  // Detect schemas from file
  private detectSchemas(path: string, content: string): DetectedSchema[] {
    const schemas: DetectedSchema[] = [];

    // TypeScript interfaces/types
    let tsMatch;
    const tsRegex = new RegExp(SCHEMA_PATTERNS.typescript.source, "g");
    while ((tsMatch = tsRegex.exec(content)) !== null) {
      const name = tsMatch[1];
      // Extract properties (simplified)
      const properties = this.extractTypeScriptProperties(content, tsMatch.index);
      
      schemas.push({
        name,
        type: "object",
        properties,
      });
    }

    // Zod schemas
    let zodMatch;
    const zodRegex = new RegExp(SCHEMA_PATTERNS.zod.source, "g");
    while ((zodMatch = zodRegex.exec(content)) !== null) {
      const propsContent = zodMatch[1];
      const properties = this.extractZodProperties(propsContent);
      
      schemas.push({
        name: `Schema${schemas.length + 1}`,
        type: "object",
        properties,
      });
    }

    // Pydantic models
    let pydanticMatch;
    const pydanticRegex = new RegExp(SCHEMA_PATTERNS.pydantic.source, "g");
    while ((pydanticMatch = pydanticRegex.exec(content)) !== null) {
      const name = pydanticMatch[1];
      const properties = this.extractPydanticProperties(content, pydanticMatch.index);
      
      schemas.push({
        name,
        type: "object",
        properties,
      });
    }

    return schemas;
  }

  // Extract TypeScript interface properties
  private extractTypeScriptProperties(content: string, startIndex: number): Record<string, { type: string; description?: string }> {
    const properties: Record<string, { type: string; description?: string }> = {};
    
    // Find the interface block
    const interfaceStart = content.indexOf("{", startIndex);
    if (interfaceStart === -1) return properties;

    let braceCount = 1;
    let i = interfaceStart + 1;
    const endChars = [";", ","];

    while (i < content.length && braceCount > 0) {
      const char = content[i];
      if (char === "{") braceCount++;
      if (char === "}") braceCount--;

      // Look for property definitions
      const propMatch = content.slice(i).match(/^\s*(\w+)\s*(\?)?\s*:\s*([^;,\n]+)/);
      if (propMatch) {
        const name = propMatch[1];
        const type = propMatch[3].trim().replace(/[;,].*$/, "").trim();
        properties[name] = { type: this.normalizeType(type) };
        i += propMatch[0].length;
      } else {
        i++;
      }
    }

    return properties;
  }

  // Extract Zod schema properties
  private extractZodProperties(content: string): Record<string, { type: string; description?: string }> {
    const properties: Record<string, { type: string; description?: string }> = {};

    // Match zod property patterns like: name: z.string()
    const propPattern = /(\w+)\s*:\s*z\.(\w+)/g;
    let match;

    while ((match = propPattern.exec(content)) !== null) {
      const name = match[1];
      const zodType = match[2];
      properties[name] = { type: this.zodToType(zodType) };
    }

    return properties;
  }

  // Extract Pydantic model properties
  private extractPydanticProperties(content: string, startIndex: number): Record<string, { type: string; description?: string }> {
    const properties: Record<string, { type: string; description?: string }> = {};

    // Find the class body
    const classStart = content.indexOf(":", startIndex);
    if (classStart === -1) return properties;

    // Match property patterns like: name: str or name: str = Field(...)
    const propPattern = /(\w+)\s*:\s*(\w+)/g;
    const contentSlice = content.slice(classStart, classStart + 2000); // Limit search
    let match;

    while ((match = propPattern.exec(contentSlice)) !== null) {
      const name = match[1];
      const pyType = match[2];
      
      // Skip Python keywords and built-ins
      if (["class", "def", "if", "else", "return", "self", "cls"].includes(name)) continue;
      
      properties[name] = { type: this.pythonToType(pyType) };
    }

    return properties;
  }

  // Normalize type string
  private normalizeType(type: string): string {
    const typeLower = type.toLowerCase();
    
    if (typeLower.includes("string")) return "string";
    if (typeLower.includes("number") || typeLower.includes("int") || typeLower.includes("float")) return "number";
    if (typeLower.includes("boolean") || typeLower.includes("bool")) return "boolean";
    if (typeLower.includes("date")) return "string";
    if (typeLower.includes("array") || type.includes("[]")) return "array";
    if (typeLower.includes("object")) return "object";
    
    return type;
  }

  // Convert Zod type to OpenAPI type
  private zodToType(zodType: string): string {
    const mapping: Record<string, string> = {
      string: "string",
      number: "number",
      boolean: "boolean",
      object: "object",
      array: "array",
      date: "string",
      uuid: "string",
      email: "string",
      url: "string",
    };
    
    return mapping[zodType.toLowerCase()] || "string";
  }

  // Convert Python type to OpenAPI type
  private pythonToType(pyType: string): string {
    const mapping: Record<string, string> = {
      str: "string",
      int: "integer",
      float: "number",
      bool: "boolean",
      dict: "object",
      list: "array",
      datetime: "string",
      date: "string",
    };
    
    return mapping[pyType.toLowerCase()] || "string";
  }

  // Generate OpenAPI specification
  private generateOpenAPISpec(
    name: string,
    description: string | undefined,
    endpoints: DetectedEndpoint[],
    schemas: DetectedSchema[]
  ): string {
    const spec: any = {
      openapi: "3.0.3",
      info: {
        title: `${name} API`,
        description: description || `API specification for ${name}`,
        version: "1.0.0",
      },
      paths: {},
      components: {
        schemas: {},
      },
    };

    // Add paths
    for (const endpoint of endpoints) {
      const path = endpoint.path.replace(/:(\w+)/g, "{$1}"); // Convert :param to {param}
      
      if (!spec.paths[path]) {
        spec.paths[path] = {};
      }

      spec.paths[path][endpoint.method.toLowerCase()] = {
        summary: endpoint.description || `${endpoint.method} ${path}`,
        responses: {
          "200": {
            description: "Successful response",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      };
    }

    // Add schemas
    for (const schema of schemas) {
      spec.components.schemas[schema.name] = {
        type: schema.type,
        properties: schema.properties,
      };
    }

    return JSON.stringify(spec, null, 2);
  }

  // Calculate confidence score
  private calculateConfidence(endpoints: DetectedEndpoint[], schemas: DetectedSchema[]): number {
    let score = 0.3;

    if (endpoints.length > 0) score += 0.3;
    if (endpoints.length > 5) score += 0.1;
    if (endpoints.length > 10) score += 0.1;
    if (schemas.length > 0) score += 0.1;
    if (schemas.length > 5) score += 0.1;

    return Math.min(score, 1.0);
  }
}
