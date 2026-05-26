import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapErrorToResponse } from "@/lib/api-errors";

export async function GET(_request: NextRequest) {
  try {
    const technologies = await db.radarItem.findMany({
      where: { isActive: true },
      include: { technology: true },
    });

    const gapAnalysis = await db.gapAnalysis.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Polish Phase C (P2.9): no mock-data fallback. Empty DB returns
    // an empty radar; frontend renders the empty state.

    const formattedTechnologies = technologies.map((item) => ({
      id: item.id,
      name: item.technology.name,
      ring: item.ring.toLowerCase(),
      quadrant: item.quadrant.toLowerCase(),
      category: item.technology.category,
      description: item.technology.description,
      organizationPos: item.organizationPos,
      thoughtworksPos: item.thoughtworksPos,
      gartnerPos: item.gartnerPos,
      gapStatus: item.gapStatus,
      isActive: item.isActive,
    }));

    const stats = {
      total: technologies.length,
      adopt: technologies.filter((t) => t.ring === "ADOPT").length,
      trial: technologies.filter((t) => t.ring === "TRIAL").length,
      assess: technologies.filter((t) => t.ring === "ASSESS").length,
      hold: technologies.filter((t) => t.ring === "HOLD").length,
      technicalDebt: gapAnalysis.filter((g) => g.gapType === "technical_debt").length,
      opportunities: gapAnalysis.filter((g) => g.gapType === "opportunity").length,
    };

    const formattedGapAnalysis = gapAnalysis.map((g) => ({
      id: g.id,
      technologyName: g.technologyName,
      category: g.category,
      orgPosition: g.orgPosition,
      twPosition: g.twPosition,
      gartnerPosition: g.gartnerPosition,
      gapType: g.gapType,
      recommendation: g.recommendation,
    }));

    return NextResponse.json({
      technologies: formattedTechnologies,
      gapAnalysis: formattedGapAnalysis,
      stats,
    });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

function getDefaultRadarData() {
  const technologies = [
    // Adopt
    { id: "1", name: "TypeScript", ring: "adopt", quadrant: "languages_frameworks", category: "Language", description: "Typed JavaScript superset", organizationPos: "adopt", thoughtworksPos: "adopt", gartnerPos: null, gapStatus: "aligned", isActive: true },
    { id: "2", name: "React", ring: "adopt", quadrant: "languages_frameworks", category: "Framework", description: "UI component library", organizationPos: "adopt", thoughtworksPos: "adopt", gartnerPos: null, gapStatus: "aligned", isActive: true },
    { id: "3", name: "PostgreSQL", ring: "adopt", quadrant: "platforms", category: "Database", description: "Relational database", organizationPos: "adopt", thoughtworksPos: "adopt", gartnerPos: null, gapStatus: "aligned", isActive: true },
    { id: "4", name: "Docker", ring: "adopt", quadrant: "tools", category: "Containerization", description: "Container platform", organizationPos: "adopt", thoughtworksPos: "adopt", gartnerPos: null, gapStatus: "aligned", isActive: true },
    { id: "5", name: "Kubernetes", ring: "adopt", quadrant: "platforms", category: "Orchestration", description: "Container orchestration", organizationPos: "adopt", thoughtworksPos: "adopt", gartnerPos: null, gapStatus: "aligned", isActive: true },
    { id: "6", name: "Git", ring: "adopt", quadrant: "tools", category: "Version Control", description: "Distributed version control", organizationPos: "adopt", thoughtworksPos: "adopt", gartnerPos: null, gapStatus: "aligned", isActive: true },
    { id: "7", name: "REST APIs", ring: "adopt", quadrant: "techniques", category: "Architecture", description: "RESTful API design", organizationPos: "adopt", thoughtworksPos: "adopt", gartnerPos: null, gapStatus: "aligned", isActive: true },
    
    // Trial
    { id: "8", name: "Next.js", ring: "trial", quadrant: "languages_frameworks", category: "Framework", description: "React framework", organizationPos: "trial", thoughtworksPos: "adopt", gartnerPos: null, gapStatus: "behind", isActive: true },
    { id: "9", name: "GraphQL", ring: "trial", quadrant: "techniques", category: "API", description: "Query language for APIs", organizationPos: "trial", thoughtworksPos: "adopt", gartnerPos: null, gapStatus: "behind", isActive: true },
    { id: "10", name: "Redis", ring: "trial", quadrant: "platforms", category: "Cache", description: "In-memory data store", organizationPos: "trial", thoughtworksPos: "adopt", gartnerPos: null, gapStatus: "behind", isActive: true },
    { id: "11", name: "Terraform", ring: "trial", quadrant: "tools", category: "IaC", description: "Infrastructure as Code", organizationPos: "trial", thoughtworksPos: "adopt", gartnerPos: null, gapStatus: "behind", isActive: true },
    { id: "12", name: "Kafka", ring: "trial", quadrant: "platforms", category: "Messaging", description: "Event streaming platform", organizationPos: "trial", thoughtworksPos: "adopt", gartnerPos: null, gapStatus: "behind", isActive: true },
    
    // Assess
    { id: "13", name: "Rust", ring: "assess", quadrant: "languages_frameworks", category: "Language", description: "Systems programming language", organizationPos: "assess", thoughtworksPos: "trial", gartnerPos: null, gapStatus: "behind", isActive: true },
    { id: "14", name: "WebAssembly", ring: "assess", quadrant: "techniques", category: "Runtime", description: "Binary instruction format", organizationPos: "assess", thoughtworksPos: "trial", gartnerPos: null, gapStatus: "behind", isActive: true },
    { id: "15", name: "Edge Computing", ring: "assess", quadrant: "platforms", category: "Infrastructure", description: "Distributed computing paradigm", organizationPos: "assess", thoughtworksPos: "trial", gartnerPos: null, gapStatus: "behind", isActive: true },
    { id: "16", name: "Bun", ring: "assess", quadrant: "tools", category: "Runtime", description: "JavaScript runtime", organizationPos: "assess", thoughtworksPos: "assess", gartnerPos: null, gapStatus: "aligned", isActive: true },
    { id: "17", name: "Kotlin", ring: "assess", quadrant: "languages_frameworks", category: "Language", description: "JVM language", organizationPos: "assess", thoughtworksPos: "adopt", gartnerPos: null, gapStatus: "behind", isActive: true },
    
    // Hold
    { id: "18", name: "Java 8", ring: "hold", quadrant: "languages_frameworks", category: "Language", description: "Legacy Java version", organizationPos: "hold", thoughtworksPos: "hold", gartnerPos: null, gapStatus: "technical_debt", isActive: true },
    { id: "19", name: "jQuery", ring: "hold", quadrant: "languages_frameworks", category: "Library", description: "DOM manipulation library", organizationPos: "hold", thoughtworksPos: "hold", gartnerPos: null, gapStatus: "aligned", isActive: true },
    { id: "20", name: "Monolith", ring: "hold", quadrant: "techniques", category: "Architecture", description: "Monolithic architecture", organizationPos: "hold", thoughtworksPos: "hold", gartnerPos: null, gapStatus: "technical_debt", isActive: true },
  ];

  const gapAnalysis = [
    { id: "1", technologyName: "Java 8", category: "Language", orgPosition: "hold", twPosition: "hold", gartnerPosition: null, gapType: "technical_debt", recommendation: "Upgrade to Java 17 or later" },
    { id: "2", technologyName: "Monolith", category: "Architecture", orgPosition: "hold", twPosition: "hold", gartnerPosition: null, gapType: "technical_debt", recommendation: "Consider microservices migration" },
    { id: "3", technologyName: "Kotlin", category: "Language", orgPosition: "assess", twPosition: "adopt", gartnerPosition: null, gapType: "behind", recommendation: "Evaluate for new projects" },
    { id: "4", technologyName: "Next.js", category: "Framework", orgPosition: "trial", twPosition: "adopt", gartnerPosition: null, gapType: "behind", recommendation: "Consider for new React projects" },
    { id: "5", technologyName: "GraphQL", category: "API", orgPosition: "trial", twPosition: "adopt", gartnerPosition: null, gapType: "behind", recommendation: "Evaluate for complex data requirements" },
    { id: "6", technologyName: "Rust", category: "Language", orgPosition: "assess", twPosition: "trial", gartnerPosition: null, gapType: "opportunity", recommendation: "Consider for performance-critical systems" },
    { id: "7", technologyName: "Edge Computing", category: "Infrastructure", orgPosition: "assess", twPosition: "trial", gartnerPosition: null, gapType: "opportunity", recommendation: "Explore for low-latency requirements" },
  ];

  const stats = {
    total: technologies.length,
    adopt: technologies.filter((t) => t.ring === "adopt").length,
    trial: technologies.filter((t) => t.ring === "trial").length,
    assess: technologies.filter((t) => t.ring === "assess").length,
    hold: technologies.filter((t) => t.ring === "hold").length,
    technicalDebt: gapAnalysis.filter((g) => g.gapType === "technical_debt").length,
    opportunities: gapAnalysis.filter((g) => g.gapType === "opportunity").length,
  };

  return {
    technologies,
    gapAnalysis,
    stats,
  };
}
