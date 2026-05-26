import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createLLMProvider } from "@/lib/llm";
import { decryptOptional } from "@/lib/crypto";
import { mapErrorToResponse } from "@/lib/api-errors";

/**
 * Pull the first language / framework from the JSON-string columns Prisma
 * stores on `Repository`. Returns "Unknown" rather than throwing — generation
 * should keep going on a corrupt or missing JSON blob.
 */
function pickFirstFromJsonArray(raw: string | null | undefined): string {
  if (!raw) return "Unknown";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "string") {
      return parsed[0];
    }
  } catch {
    // Malformed JSON — fall through.
  }
  return "Unknown";
}

/**
 * Strip characters that could break out of the fenced block we feed to the
 * LLM. We don't sanitize prompts in the traditional sense (there's no
 * authoritative answer) but we do refuse triple-backticks and remove control
 * chars to reduce prompt-injection surface.
 */
// eslint-disable-next-line no-control-regex
function safeForPrompt(value: string): string {
  return value.replace(/```/g, "ʼʼʼ").replace(/[\x00-\x1f]/g, " ");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { repositoryId } = body;

    if (!repositoryId || typeof repositoryId !== "string") {
      return NextResponse.json({ error: "Repository ID is required" }, { status: 400 });
    }

    const repository = await db.repository.findUnique({
      where: { id: repositoryId },
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // Schema fields are JSON-encoded String columns (`languages`, `frameworks`),
    // NOT `language` / `framework` singular as the previous code claimed.
    // Reading the non-existent singular fields produced `undefined` and the
    // prompt got the literal "Unknown" through hidden coercion. Fix that here.
    const language = pickFirstFromJsonArray(repository.languages);
    const framework = pickFirstFromJsonArray(repository.frameworks);

    // Phase 2.1: route through the LLMProvider adapter instead of the
    // hardcoded z-ai-web-dev-sdk. Picks the tenant's default AIProvider
    // when the repository does not pin one.
    const aiRow =
      (repository.aiProviderId
        ? await db.aIProvider.findUnique({ where: { id: repository.aiProviderId } })
        : null) ??
      (await db.aIProvider.findFirst({ where: { isDefault: true, isActive: true } }));
    if (!aiRow) {
      return NextResponse.json(
        { error: "No AI provider configured" },
        { status: 400 }
      );
    }
    const llm = createLLMProvider({ ...aiRow, apiKey: decryptOptional(aiRow.apiKey) });

    const systemPrompt = `You are an expert software architect specializing in architecture documentation.
Your task is to analyze repository information and generate an Architecture Decision Record (ADR).
Generate the response in a structured JSON format with the following fields:
- title: A concise title for the architecture decision
- context: The background and problem statement (2-3 sentences)
- decision: The decision that was made (1-2 sentences)
- consequences: The consequences of this decision (optional, can be null)
- alternatives: Other options considered (optional, can be null)`;

    // Fence repository metadata in a code block so the LLM treats it as data,
    // not as further instructions. (Defence in depth — prompt injection is
    // still possible via the description, but at least we don't make it easy.)
    const userPrompt = `Analyze this repository and suggest a potential architecture decision that might need to be documented:

\`\`\`yaml
name: ${safeForPrompt(repository.name)}
description: ${safeForPrompt(repository.description || "No description available")}
language: ${safeForPrompt(language)}
framework: ${safeForPrompt(framework)}
\`\`\`

Generate an ADR that could be relevant for this repository. If the repository uses specific technologies,
suggest decisions related to those technologies.`;

    const completion = await llm.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { meta: { repositoryId } }
    );
    const response = completion.content;

    // Parse the response as JSON
    let adrData;
    try {
      // Try to extract JSON from the response
      const jsonMatch = response?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        adrData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch {
      // Fallback to default structure
      adrData = {
        title: `Architecture Decision for ${repository.name}`,
        context:
          response ||
          `This repository ${repository.name} uses ${language !== "Unknown" ? language : "various technologies"} and requires architectural decisions.`,
        decision: "Decision needs to be documented based on code analysis.",
        consequences: null,
        alternatives: null,
      };
    }

    return NextResponse.json(adrData);
  } catch (error) {
    // Polish P3.6 — the hardcoded fallback ADR previously masked LLM
    // failures (timeouts, bad API keys, quota). The frontend now sees
    // a real 500 with a logged requestId and can show a "regenerate"
    // toast instead of silently storing a stub document.
    return mapErrorToResponse(error);
  }
}
