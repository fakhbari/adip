import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

interface TechnologyInput {
  name: string;
  quadrant?: string;
  ring?: string;
  category?: string;
  description?: string;
  is_new?: boolean;
}

interface ImportData {
  version?: string;
  date?: string;
  technologies: TechnologyInput[];
}

interface ImportResult {
  success: boolean;
  added: number;
  updated: number;
  technologies: string[];
  errors: string[];
  version?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source, data } = body as { source: "thoughtworks" | "gartner"; data: ImportData };

    if (!source || !data) {
      return NextResponse.json(
        { success: false, added: 0, updated: 0, technologies: [], errors: ["Missing source or data"] },
        { status: 400 }
      );
    }

    if (!Array.isArray(data.technologies)) {
      return NextResponse.json(
        { success: false, added: 0, updated: 0, technologies: [], errors: ["Invalid data format: technologies must be an array"] },
        { status: 400 }
      );
    }

    const result: ImportResult = {
      success: true,
      added: 0,
      updated: 0,
      technologies: [],
      errors: [],
      version: data.version,
    };

    // Map ring values to standard format
    const mapRing = (ring: string | undefined): string => {
      if (!ring) return "ASSESS";
      const normalizedRing = ring.toLowerCase();
      switch (normalizedRing) {
        case "adopt":
        case "mainstream":
        case "productivity":
          return "ADOPT";
        case "trial":
        case "emerging":
          return "TRIAL";
        case "assess":
        case "experimental":
          return "ASSESS";
        case "hold":
        case "deprecated":
        case "obsolete":
          return "HOLD";
        default:
          return "ASSESS";
      }
    };

    // Map quadrant values to standard format
    const mapQuadrant = (quadrant: string | undefined): string => {
      if (!quadrant) return "TECHNIQUES";
      const normalizedQuadrant = quadrant.toLowerCase();
      if (normalizedQuadrant.includes("language") || normalizedQuadrant.includes("framework")) {
        return "LANGUAGES_FRAMEWORKS";
      }
      if (normalizedQuadrant.includes("platform") || normalizedQuadrant.includes("infrastructure")) {
        return "PLATFORMS";
      }
      if (normalizedQuadrant.includes("tool") || normalizedQuadrant.includes("software")) {
        return "TOOLS";
      }
      if (normalizedQuadrant.includes("technique") || normalizedQuadrant.includes("method")) {
        return "TECHNIQUES";
      }
      return "TECHNIQUES";
    };

    // Process each technology
    for (const tech of data.technologies) {
      if (!tech.name) {
        result.errors.push(`Skipping technology without name`);
        continue;
      }

      try {
        // Check if technology already exists (case-insensitive for SQLite)
        let technology = await db.technology.findFirst({
          where: {
            OR: [
              { name: tech.name },
              { name: { equals: tech.name.toLowerCase() } },
              { name: { equals: tech.name.toUpperCase() } },
            ],
          },
        });

        const ring = mapRing(tech.ring);
        const quadrant = mapQuadrant(tech.quadrant);

        if (!technology) {
          // Create new technology
          technology = await db.technology.create({
            data: {
              name: tech.name,
              category: tech.category || "Unknown",
              description: tech.description || null,
            },
          });

          // Create radar item for external source
          await db.radarItem.create({
            data: {
              technologyId: technology.id,
              ring: ring as "ADOPT" | "TRIAL" | "ASSESS" | "HOLD",
              quadrant: quadrant as "TECHNIQUES" | "TOOLS" | "PLATFORMS" | "LANGUAGES_FRAMEWORKS",
              reason: `Imported from ${source}`,
              organizationPos: null, // Not in organization yet
              thoughtworksPos: source === "thoughtworks" ? ring : null,
              gartnerPos: source === "gartner" ? ring : null,
              isActive: true,
            },
          });

          // Create gap analysis entry
          await db.gapAnalysis.create({
            data: {
              technologyName: tech.name,
              category: tech.category || "Unknown",
              orgPosition: null, // Not using this technology
              twPosition: source === "thoughtworks" ? ring : null,
              gartnerPosition: source === "gartner" ? ring : null,
              gapType: "opportunity", // New technology to consider
              recommendation: `Consider evaluating ${tech.name} for future adoption. Source: ${source}`,
            },
          });

          result.added++;
          result.technologies.push(tech.name);
        } else {
          // Update existing technology radar item
          const existingRadarItem = await db.radarItem.findFirst({
            where: {
              technologyId: technology.id,
              isActive: true,
            },
          });

          if (existingRadarItem) {
            await db.radarItem.update({
              where: { id: existingRadarItem.id },
              data: {
                thoughtworksPos: source === "thoughtworks" ? ring : existingRadarItem.thoughtworksPos,
                gartnerPos: source === "gartner" ? ring : existingRadarItem.gartnerPos,
              },
            });
          } else {
            await db.radarItem.create({
              data: {
                technologyId: technology.id,
                ring: ring as "ADOPT" | "TRIAL" | "ASSESS" | "HOLD",
                quadrant: quadrant as "TECHNIQUES" | "TOOLS" | "PLATFORMS" | "LANGUAGES_FRAMEWORKS",
                reason: `Imported from ${source}`,
                organizationPos: null,
                thoughtworksPos: source === "thoughtworks" ? ring : null,
                gartnerPos: source === "gartner" ? ring : null,
                isActive: true,
              },
            });
          }

          // Update gap analysis
          const existingGap = await db.gapAnalysis.findFirst({
            where: { technologyName: tech.name },
          });

          if (existingGap) {
            const twPos = source === "thoughtworks" ? ring : existingGap.twPosition;
            const gartnerPos = source === "gartner" ? ring : existingGap.gartnerPosition;
            const orgPos = existingGap.orgPosition;

            // Calculate gap type
            let gapType = existingGap.gapType;
            if (!orgPos) {
              gapType = "opportunity";
            } else if (twPos && orgPos.toLowerCase() !== twPos.toLowerCase()) {
              gapType = "behind";
            } else {
              gapType = "aligned";
            }

            await db.gapAnalysis.update({
              where: { id: existingGap.id },
              data: {
                twPosition: twPos,
                gartnerPosition: gartnerPos,
                gapType,
              },
            });
          } else {
            await db.gapAnalysis.create({
              data: {
                technologyName: tech.name,
                category: tech.category || technology.category,
                orgPosition: null,
                twPosition: source === "thoughtworks" ? ring : null,
                gartnerPosition: source === "gartner" ? ring : null,
                gapType: "opportunity",
                recommendation: `Consider evaluating ${tech.name} for future adoption. Source: ${source}`,
              },
            });
          }

          result.updated++;
          result.technologies.push(tech.name);
        }
      } catch (techError) {
        console.error(`Error processing technology ${tech.name}:`, techError);
        result.errors.push(`Failed to process ${tech.name}: ${techError instanceof Error ? techError.message : "Unknown error"}`);
      }
    }

    // Log activity
    await db.activityLog.create({
      data: {
        action: "external_radar_import",
        entityType: "settings",
        details: JSON.stringify({
          source,
          added: result.added,
          updated: result.updated,
          version: result.version,
        }),
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error importing external radar data:", error);
    return NextResponse.json(
      {
        success: false,
        added: 0,
        updated: 0,
        technologies: [],
        errors: [error instanceof Error ? error.message : "Failed to import external radar data"],
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Get import status
    const activityLogs = await db.activityLog.findMany({
      where: { action: "external_radar_import" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const status = {
      thoughtworks: {
        lastImport: null as Date | null,
        technologyCount: 0,
        version: null as string | null,
      },
      gartner: {
        lastImport: null as Date | null,
        technologyCount: 0,
        version: null as string | null,
      },
    };

    for (const log of activityLogs) {
      try {
        const details = JSON.parse(log.details || "{}");
        if (details.source === "thoughtworks" && !status.thoughtworks.lastImport) {
          status.thoughtworks.lastImport = log.createdAt;
          status.thoughtworks.technologyCount = (details.added || 0) + (details.updated || 0);
          status.thoughtworks.version = details.version || null;
        }
        if (details.source === "gartner" && !status.gartner.lastImport) {
          status.gartner.lastImport = log.createdAt;
          status.gartner.technologyCount = (details.added || 0) + (details.updated || 0);
          status.gartner.version = details.version || null;
        }
      } catch {
        // Skip invalid entries
      }
    }

    // Count technologies with external positions
    const radarItems = await db.radarItem.findMany({
      where: { isActive: true },
      select: {
        thoughtworksPos: true,
        gartnerPos: true,
      },
    });

    status.thoughtworks.technologyCount = radarItems.filter((r) => r.thoughtworksPos).length;
    status.gartner.technologyCount = radarItems.filter((r) => r.gartnerPos).length;

    return NextResponse.json(status);
  } catch (error) {
    console.error("Error fetching external radar status:", error);
    return NextResponse.json(
      {
        thoughtworks: { lastImport: null, technologyCount: 0, version: null },
        gartner: { lastImport: null, technologyCount: 0, version: null },
      },
      { status: 500 }
    );
  }
}
