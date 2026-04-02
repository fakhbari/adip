/**
 * ADIP Orchestrator Service
 * 
 * This mini-service handles repository analysis using multi-agent architecture.
 * It communicates with the main app via WebSocket (Socket.io).
 * 
 * Port: 3003
 */

import { createServer } from "http";
import { Server } from "socket.io";
import ZAI from "z-ai-web-dev-sdk";

const PORT = 3003;

// Types
interface AnalysisJob {
  id: string;
  repositoryId: string;
  types: string[];
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  currentStep: string;
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  results: AnalysisResult[];
}

interface AnalysisResult {
  type: string;
  status: "success" | "failed" | "skipped";
  data?: any;
  error?: string;
}

interface AIProviderConfig {
  id: string;
  type: "OPENAI" | "ANTHROPIC" | "AZURE_OPENAI" | "LOCAL_OLLAMA" | "CUSTOM";
  apiKey: string | null;
  baseUrl: string | null;
  modelName: string;
  maxTokens: number;
  temperature: number;
}

// In-memory job storage (in production, use Redis or database)
const jobs = new Map<string, AnalysisJob>();

// ZAI instance (will be initialized with provider config)
let zaiInstance: ZAI | null = null;

// Create HTTP server and Socket.io
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*", // In production, restrict to your domain
    methods: ["GET", "POST"],
  },
});

// Helper: Get AI provider from main app database
async function getAIProvider(providerId: string | null): Promise<AIProviderConfig | null> {
  try {
    // First try to get the specified provider
    if (providerId) {
      const response = await fetch(`http://localhost:3000/api/settings/ai-providers/${providerId}`);
      if (response.ok) {
        return await response.json();
      }
    }
    
    // If no provider specified or not found, get the default
    const response = await fetch(`http://localhost:3000/api/settings/ai-providers`);
    if (response.ok) {
      const providers = await response.json();
      const defaultProvider = providers.find((p: AIProviderConfig & { isDefault: boolean }) => p.isDefault);
      if (defaultProvider) {
        return defaultProvider;
      }
      // Return first active provider if no default
      const activeProvider = providers.find((p: AIProviderConfig & { isActive: boolean }) => p.isActive);
      if (activeProvider) {
        return activeProvider;
      }
    }
    return null;
  } catch (error) {
    console.error("Failed to get AI provider:", error);
    return null;
  }
}

// Helper: Create ZAI instance and chat completion
async function createChatCompletion(
  provider: AIProviderConfig,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  // For now, we use a single ZAI instance with the provider's config
  // The ZAI SDK uses its own API key and base URL configuration
  zaiInstance = await ZAI.create();
  
  const response = await zaiInstance.chat.completions.create({
    model: provider.modelName,
    messages,
    stream: false,
  });

  return response.choices?.[0]?.message?.content || "";
}

// Agent: Tech Radar - Extract technologies from repository
async function runTechRadarAgent(
  provider: AIProviderConfig,
  repositoryData: any,
  jobId: string,
  socket: any
): Promise<AnalysisResult> {
  try {
    socket.emit("job:progress", {
      jobId,
      step: "tech-radar",
      progress: 10,
      message: "Starting technology detection...",
    });

    // Build prompt for tech detection
    const systemPrompt = `You are a technology detection expert. Analyze the repository information and identify all technologies, frameworks, libraries, and tools being used. Return only valid JSON.`;

    const userPrompt = `Analyze this repository and identify all technologies:

Repository: ${repositoryData.name}
Description: ${repositoryData.description || "N/A"}
Languages: ${repositoryData.languages?.join(", ") || "Unknown"}
Detected Files: ${JSON.stringify(repositoryData.detectedFiles || [], null, 2)}
Structure: ${JSON.stringify(repositoryData.structure || {}, null, 2)}

Return a JSON array of technologies in this exact format:
[{"name": "Technology Name", "category": "Framework|Library|Tool|Language|Platform|Database", "version": "version or null", "sourceFile": "detection source", "quadrant": "techniques|tools|platforms|languages-frameworks", "ring": "adopt|trial|assess|hold"}]

Only return the JSON array, no other text.`;

    const response = await createChatCompletion(provider, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    // Parse the response
    let technologies = [];
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        technologies = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Failed to parse tech radar response:", parseError);
    }

    socket.emit("job:progress", {
      jobId,
      step: "tech-radar",
      progress: 25,
      message: `Detected ${technologies.length} technologies`,
    });

    return {
      type: "tech-radar",
      status: "success",
      data: technologies,
    };
  } catch (error) {
    console.error("Tech Radar Agent error:", error);
    return {
      type: "tech-radar",
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Agent: C4 Model - Extract architecture
async function runC4Agent(
  provider: AIProviderConfig,
  repositoryData: any,
  jobId: string,
  socket: any
): Promise<AnalysisResult> {
  try {
    socket.emit("job:progress", {
      jobId,
      step: "c4",
      progress: 30,
      message: "Analyzing system architecture (C4 model)...",
    });

    const systemPrompt = `You are a software architect specializing in C4 model documentation. Analyze repositories and generate C4 model documentation in JSON format. Return only valid JSON.`;

    const userPrompt = `Generate C4 model documentation for this repository:

Repository: ${repositoryData.name}
Description: ${repositoryData.description || "N/A"}
Languages: ${repositoryData.languages?.join(", ") || "Unknown"}
Detected Containers: ${JSON.stringify(repositoryData.containers || [], null, 2)}
Technologies: ${JSON.stringify(repositoryData.technologies || [], null, 2)}

Generate Level 1 (System Context) and Level 2 (Container) in this format:
{"level1": {"system": {"name": "System Name", "description": "Description", "users": [{"name": "User Type", "description": "Description"}], "externalSystems": [{"name": "External System", "description": "Description", "relationship": "Description"}]}}, "level2": {"containers": [{"name": "Container Name", "type": "Web Application|API|Database|Message Queue", "description": "Description", "technology": "Technologies", "relationships": [{"target": "Other Container", "protocol": "HTTP/gRPC", "description": "Description"}]}]}}

Only return the JSON object.`;

    const response = await createChatCompletion(provider, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    let c4Data = null;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        c4Data = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Failed to parse C4 response:", parseError);
    }

    socket.emit("job:progress", {
      jobId,
      step: "c4",
      progress: 50,
      message: "C4 model analysis complete",
    });

    return {
      type: "c4",
      status: "success",
      data: c4Data,
    };
  } catch (error) {
    console.error("C4 Agent error:", error);
    return {
      type: "c4",
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Agent: ADR - Architecture Decision Records
async function runADRAgent(
  provider: AIProviderConfig,
  repositoryData: any,
  jobId: string,
  socket: any
): Promise<AnalysisResult> {
  try {
    socket.emit("job:progress", {
      jobId,
      step: "adr",
      progress: 55,
      message: "Detecting architecture decisions...",
    });

    const systemPrompt = `You are a software architect specializing in Architecture Decision Records (ADR). Suggest ADRs based on repository information. Return only valid JSON.`;

    const userPrompt = `Suggest Architecture Decision Records for this repository:

Repository: ${repositoryData.name}
Description: ${repositoryData.description || "N/A"}
Technologies: ${JSON.stringify(repositoryData.technologies || [], null, 2)}
Structure: ${JSON.stringify(repositoryData.structure || {}, null, 2)}

Generate ADRs in this format:
[{"number": 1, "title": "Short Title", "status": "proposed|accepted|deprecated", "context": "Background and problem statement", "decision": "The decision made", "consequences": "Consequences", "alternatives": "Other options considered"}]

Only return the JSON array.`;

    const response = await createChatCompletion(provider, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    let adrs = [];
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        adrs = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Failed to parse ADR response:", parseError);
    }

    socket.emit("job:progress", {
      jobId,
      step: "adr",
      progress: 70,
      message: `Found ${adrs.length} potential ADRs`,
    });

    return {
      type: "adr",
      status: "success",
      data: adrs,
    };
  } catch (error) {
    console.error("ADR Agent error:", error);
    return {
      type: "adr",
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Main: Run analysis job
async function runAnalysisJob(
  jobId: string,
  repositoryId: string,
  analysisTypes: string[],
  aiProviderId: string | null,
  socket: any
) {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = "running";
  job.startedAt = new Date();
  job.currentStep = "initializing";

  socket.emit("job:started", { jobId, repositoryId });

  try {
    // Get AI provider config
    socket.emit("job:progress", {
      jobId,
      step: "init",
      progress: 5,
      message: "Loading AI provider configuration...",
    });

    const provider = await getAIProvider(aiProviderId);
    if (!provider) {
      throw new Error("AI provider not found or not configured. Please add an AI provider in Settings.");
    }

    // Fetch repository data from main app
    socket.emit("job:progress", {
      jobId,
      step: "fetch",
      progress: 10,
      message: "Fetching repository data...",
    });

    const repoResponse = await fetch(`http://localhost:3000/api/repositories/${repositoryId}`);
    if (!repoResponse.ok) {
      throw new Error("Failed to fetch repository data");
    }
    const repositoryData = await repoResponse.json();

    // Run agents based on requested types
    for (const type of analysisTypes) {
      let result: AnalysisResult;

      switch (type) {
        case "tech-radar":
          result = await runTechRadarAgent(provider, repositoryData, jobId, socket);
          break;
        case "c4":
          result = await runC4Agent(provider, repositoryData, jobId, socket);
          break;
        case "adr":
          result = await runADRAgent(provider, repositoryData, jobId, socket);
          break;
        default:
          result = {
            type,
            status: "skipped",
            error: `Unknown analysis type: ${type}`,
          };
      }

      job.results.push(result);
    }

    // Save results to main app database
    socket.emit("job:progress", {
      jobId,
      step: "save",
      progress: 90,
      message: "Saving results...",
    });

    await fetch(`http://localhost:3000/api/repositories/${repositoryId}/analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        results: job.results,
      }),
    });

    // Mark job as complete
    job.status = "completed";
    job.completedAt = new Date();
    job.progress = 100;
    job.currentStep = "completed";

    socket.emit("job:completed", {
      jobId,
      repositoryId,
      results: job.results,
    });

  } catch (error) {
    console.error("Analysis job error:", error);
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Unknown error";
    job.completedAt = new Date();

    socket.emit("job:failed", {
      jobId,
      repositoryId,
      error: job.error,
    });
  }
}

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Start analysis job
  socket.on("analysis:start", async (data) => {
    const { repositoryId, types, aiProviderId } = data;

    // Create job
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const job: AnalysisJob = {
      id: jobId,
      repositoryId,
      types,
      status: "queued",
      progress: 0,
      currentStep: "queued",
      startedAt: null,
      completedAt: null,
      error: null,
      results: [],
    };

    jobs.set(jobId, job);

    // Acknowledge job creation
    socket.emit("job:created", { jobId, repositoryId });

    // Run analysis asynchronously
    runAnalysisJob(jobId, repositoryId, types, aiProviderId, socket);
  });

  // Get job status
  socket.on("job:status", (data) => {
    const { jobId } = data;
    const job = jobs.get(jobId);

    if (job) {
      socket.emit("job:status", job);
    } else {
      socket.emit("job:not-found", { jobId });
    }
  });

  // Cancel job
  socket.on("job:cancel", (data) => {
    const { jobId } = data;
    const job = jobs.get(jobId);

    if (job && (job.status === "queued" || job.status === "running")) {
      job.status = "failed";
      job.error = "Cancelled by user";
      job.completedAt = new Date();
      socket.emit("job:cancelled", { jobId });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Orchestrator service running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});
