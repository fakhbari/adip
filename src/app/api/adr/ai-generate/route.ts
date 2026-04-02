import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { repositoryId } = body;

    if (!repositoryId) {
      return NextResponse.json({ error: "Repository ID is required" }, { status: 400 });
    }

    // Get repository info
    const repository = await db.repository.findUnique({
      where: { id: repositoryId },
    });

    if (!repository) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    // Initialize AI
    const zai = await ZAI.create();

    // Generate ADR using AI
    const systemPrompt = `You are an expert software architect specializing in architecture documentation. 
Your task is to analyze repository information and generate an Architecture Decision Record (ADR).
Generate the response in a structured JSON format with the following fields:
- title: A concise title for the architecture decision
- context: The background and problem statement (2-3 sentences)
- decision: The decision that was made (1-2 sentences)
- consequences: The consequences of this decision (optional, can be null)
- alternatives: Other options considered (optional, can be null)`;

    const userPrompt = `Analyze this repository and suggest a potential architecture decision that might need to be documented:

Repository: ${repository.name}
Description: ${repository.description || "No description available"}
Primary Language: ${repository.language || "Unknown"}
Framework: ${repository.framework || "Unknown"}

Generate an ADR that could be relevant for this repository. If the repository uses specific technologies, 
suggest decisions related to those technologies.`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });

    const response = completion.choices[0]?.message?.content;

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
        context: response || `This repository ${repository.name} uses ${repository.language || "various technologies"} and requires architectural decisions.`,
        decision: "Decision needs to be documented based on code analysis.",
        consequences: null,
        alternatives: null,
      };
    }

    return NextResponse.json(adrData);
  } catch (error) {
    console.error("Error generating ADR:", error);
    return NextResponse.json({
      title: "Architecture Decision Required",
      context: "Analysis of the repository suggests an architecture decision should be documented.",
      decision: "To be determined after manual review.",
      consequences: null,
      alternatives: null,
    });
  }
}
