"use client";

// D3-based Technology Radar visualisation. Phase 3.5.
//
// Renders 4 quadrants × 4 rings × N tech dots. Drag-to-detail tooltip
// surfaces the tech name + ring + quadrant + rationale on hover. The
// `twOverlay` prop overlays the ThoughtWorks position as a lighter
// dot so the user can eyeball the gap.

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

export type RadarTech = {
  name: string;
  quadrant: "techniques" | "tools" | "platforms" | "languages-frameworks";
  ring: "adopt" | "trial" | "assess" | "hold";
  /** Optional comparison ring from ThoughtWorks; rendered as a faded dot. */
  twRing?: "adopt" | "trial" | "assess" | "hold";
  rationale?: string;
};

const QUADRANTS = ["techniques", "tools", "platforms", "languages-frameworks"] as const;
const RINGS = ["adopt", "trial", "assess", "hold"] as const;

const QUADRANT_LABELS: Record<(typeof QUADRANTS)[number], string> = {
  techniques: "Techniques",
  tools: "Tools",
  platforms: "Platforms",
  "languages-frameworks": "Languages & Frameworks",
};

// Each quadrant gets a sector of the circle.
const QUADRANT_ANGLES: Record<(typeof QUADRANTS)[number], { start: number; end: number }> = {
  techniques: { start: -Math.PI / 2, end: 0 },
  tools: { start: 0, end: Math.PI / 2 },
  platforms: { start: Math.PI / 2, end: Math.PI },
  "languages-frameworks": { start: Math.PI, end: 1.5 * Math.PI },
};

export function D3Radar({ data, size = 640 }: { data: RadarTech[]; size?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<RadarTech | null>(null);

  const radii = useMemo(() => {
    const r = size / 2 - 24;
    return {
      adopt: r * 0.25,
      trial: r * 0.5,
      assess: r * 0.75,
      hold: r,
    };
  }, [size]);

  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const center = size / 2;
    const g = svg.append("g").attr("transform", `translate(${center},${center})`);

    // Rings.
    for (const ring of RINGS) {
      g.append("circle")
        .attr("r", radii[ring])
        .attr("fill", "none")
        .attr("stroke", "currentColor")
        .attr("stroke-opacity", 0.2);
      g.append("text")
        .attr("x", 0)
        .attr("y", -radii[ring] - 2)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("fill", "currentColor")
        .attr("opacity", 0.6)
        .text(ring);
    }

    // Quadrant axes.
    g.append("line").attr("x1", -radii.hold).attr("x2", radii.hold).attr("y1", 0).attr("y2", 0)
      .attr("stroke", "currentColor").attr("stroke-opacity", 0.3);
    g.append("line").attr("x1", 0).attr("x2", 0).attr("y1", -radii.hold).attr("y2", radii.hold)
      .attr("stroke", "currentColor").attr("stroke-opacity", 0.3);

    // Quadrant labels.
    for (const q of QUADRANTS) {
      const mid = (QUADRANT_ANGLES[q].start + QUADRANT_ANGLES[q].end) / 2;
      const lx = Math.cos(mid) * (radii.hold + 12);
      const ly = Math.sin(mid) * (radii.hold + 12);
      g.append("text")
        .attr("x", lx)
        .attr("y", ly)
        .attr("text-anchor", "middle")
        .attr("font-size", 11)
        .attr("font-weight", "600")
        .attr("fill", "currentColor")
        .text(QUADRANT_LABELS[q]);
    }

    // Dots. Spread points within their (quadrant, ring) cell so dots
    // do not overlap. Stable jitter from a hash of the name.
    function positionFor(t: RadarTech) {
      const angles = QUADRANT_ANGLES[t.quadrant];
      const ringIdx = RINGS.indexOf(t.ring);
      const innerR = ringIdx === 0 ? 0 : radii[RINGS[ringIdx - 1]];
      const outerR = radii[t.ring];
      const seed = [...t.name].reduce((a, c) => a + c.charCodeAt(0), 0);
      const angleJitter = (seed % 100) / 100;
      const radiusJitter = ((seed >> 3) % 100) / 100;
      const angle = angles.start + (angles.end - angles.start) * (0.1 + angleJitter * 0.8);
      const radius = innerR + (outerR - innerR) * (0.2 + radiusJitter * 0.6);
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    }

    // TW overlay dots first (lighter).
    for (const tech of data) {
      if (!tech.twRing) continue;
      const overlay: RadarTech = { ...tech, ring: tech.twRing };
      const p = positionFor(overlay);
      g.append("circle")
        .attr("cx", p.x)
        .attr("cy", p.y)
        .attr("r", 4)
        .attr("fill", "currentColor")
        .attr("opacity", 0.25);
    }

    // Org dots.
    for (const tech of data) {
      const p = positionFor(tech);
      g.append("circle")
        .attr("cx", p.x)
        .attr("cy", p.y)
        .attr("r", 6)
        .attr("fill", "currentColor")
        .style("cursor", "pointer")
        .on("mouseover", () => setHovered(tech))
        .on("mouseout", () => setHovered(null));
    }
  }, [data, size, radii]);

  return (
    <div className="relative" style={{ width: size, height: size + 60 }}>
      <svg ref={ref} width={size} height={size} className="text-foreground" />
      {hovered ? (
        <div className="absolute left-2 right-2 bottom-2 rounded-md border bg-card px-3 py-2 text-sm shadow-sm">
          <div className="font-semibold">{hovered.name}</div>
          <div className="text-xs text-muted-foreground">
            {hovered.quadrant} · ring: <span className="font-medium">{hovered.ring}</span>
            {hovered.twRing && hovered.twRing !== hovered.ring
              ? ` (TW: ${hovered.twRing})`
              : ""}
          </div>
          {hovered.rationale ? (
            <div className="text-xs mt-1 line-clamp-3">{hovered.rationale}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
