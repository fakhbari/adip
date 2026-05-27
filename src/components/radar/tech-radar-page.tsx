"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Radar as RadarIcon,
  Download,
  Filter,
  RefreshCw,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Circle,
  TrendingUp,
  TrendingDown,
  Minus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Move,
  FileSpreadsheet,
  FileJson,
  FileImage,
  FileType,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { D3Radar, type RadarTech } from "@/components/radar/D3Radar";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface Technology {
  id: string;
  name: string;
  ring: "adopt" | "trial" | "assess" | "hold";
  quadrant: "techniques" | "tools" | "platforms" | "languages_frameworks";
  category: string;
  description: string | null;
  organizationPos: string | null;
  thoughtworksPos: string | null;
  gartnerPos: string | null;
  gapStatus: string | null;
  isActive: boolean;
}

interface GapAnalysis {
  id: string;
  technologyName: string;
  category: string;
  orgPosition: string | null;
  twPosition: string | null;
  gartnerPosition: string | null;
  gapType: string | null;
  recommendation: string | null;
}

interface RadarData {
  technologies: Technology[];
  gapAnalysis: GapAnalysis[];
  stats: {
    total: number;
    adopt: number;
    trial: number;
    assess: number;
    hold: number;
    technicalDebt: number;
    opportunities: number;
  };
}

const ringColors = {
  adopt: { bg: "bg-green-500", text: "text-green-600", border: "border-green-500" },
  trial: { bg: "bg-blue-500", text: "text-blue-600", border: "border-blue-500" },
  assess: { bg: "bg-yellow-500", text: "text-yellow-600", border: "border-yellow-500" },
  hold: { bg: "bg-red-500", text: "text-red-600", border: "border-red-500" },
};

const quadrantLabels = {
  techniques: "Techniques",
  tools: "Tools",
  platforms: "Platforms",
  languages_frameworks: "Languages & Frameworks",
};

export function TechRadarPage() {
  const [data, setData] = useState<RadarData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedQuadrant, setSelectedQuadrant] = useState<string>("all");
  const [selectedRing, setSelectedRing] = useState<string>("all");
  const [selectedTech, setSelectedTech] = useState<Technology | null>(null);
  const [viewMode, setViewMode] = useState<"radar" | "table">("radar");
  // Polish P2.5 — toggle between the legacy hand-rolled SVG radar and the
  // D3Radar component (which supports quadrant sectors + a ThoughtWorks
  // overlay). Default off until the orchestrator persists the `twRing`
  // field; once `data.technologies[].twRing` is reliably populated, flip
  // the default.
  const [useD3, setUseD3] = useState(false);
  const [showTwOverlay, setShowTwOverlay] = useState(true);

  // Zoom and Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const radarContainerRef = useRef<HTMLDivElement>(null);

  const minZoom = 0.5;
  const maxZoom = 4;
  const zoomStep = 0.25;

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + zoomStep, maxZoom));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - zoomStep, minZoom));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
    setZoom((prev) => Math.max(minZoom, Math.min(maxZoom, prev + delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const fetchData = useCallback(async (showRefreshLoader = false) => {
    if (showRefreshLoader) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const response = await fetch("/api/radar");
      const result = await response.json();
      setData(result);
      if (showRefreshLoader) {
        toast.success("Technology Radar data refreshed");
      }
    } catch (error) {
      console.error("Failed to fetch radar data:", error);
      toast.error("Failed to fetch radar data");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter technologies based on selected filters
  const filteredTechnologies = data?.technologies.filter((tech) => {
    if (selectedQuadrant !== "all" && tech.quadrant !== selectedQuadrant) return false;
    if (selectedRing !== "all" && tech.ring !== selectedRing) return false;
    return true;
  }) || [];

  // Export functions
  const exportToJSON = useCallback((dataToExport: unknown, filename: string) => {
    const json = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported to ${filename}.json`);
  }, []);

  const exportToExcel = useCallback((dataToExport: Record<string, unknown>[], filename: string) => {
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, `${filename}.xlsx`);
    toast.success(`Exported to ${filename}.xlsx`);
  }, []);

  const exportRadarToSVG = useCallback(() => {
    if (!svgRef.current) {
      toast.error("SVG not found");
      return;
    }
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "technology-radar.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Exported to technology-radar.svg");
  }, []);

  const exportRadarToPNG = useCallback(async () => {
    if (!radarContainerRef.current || !svgRef.current) {
      toast.error("Radar container not found");
      return;
    }
    setIsExporting(true);
    try {
      const canvas = await html2canvas(radarContainerRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "technology-radar.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Exported to technology-radar.png");
    } catch (error) {
      console.error("Failed to export PNG:", error);
      toast.error("Failed to export PNG");
    } finally {
      setIsExporting(false);
    }
  }, []);

  const exportTableToExcel = useCallback(() => {
    const tableData = filteredTechnologies.map((tech) => ({
      Technology: tech.name,
      Category: tech.category,
      Quadrant: quadrantLabels[tech.quadrant],
      Ring: tech.ring,
      "Org Position": tech.organizationPos || "-",
      "TW Position": tech.thoughtworksPos || "-",
      "Gap Status": tech.gapStatus || "-",
    }));
    exportToExcel(tableData, "technology-list");
  }, [filteredTechnologies, exportToExcel]);

  const exportTableToJSON = useCallback(() => {
    exportToJSON(filteredTechnologies, "technology-list");
  }, [filteredTechnologies, exportToJSON]);

  const exportGapToExcel = useCallback(() => {
    const gapData = data?.gapAnalysis.map((gap) => ({
      Technology: gap.technologyName,
      Category: gap.category,
      "Org Position": gap.orgPosition || "-",
      "TW Position": gap.twPosition || "-",
      "Gartner Position": gap.gartnerPosition || "-",
      "Gap Type": gap.gapType || "-",
      Recommendation: gap.recommendation || "-",
    })) || [];
    exportToExcel(gapData, "gap-analysis");
  }, [data?.gapAnalysis, exportToExcel]);

  const exportGapToJSON = useCallback(() => {
    exportToJSON(data?.gapAnalysis, "gap-analysis");
  }, [data?.gapAnalysis, exportToJSON]);

  const exportComprehensivePDF = useCallback(async () => {
    if (!data) {
      toast.error("No data to export");
      return;
    }
    setIsExporting(true);
    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      let yPos = 20;

      // Title
      pdf.setFontSize(20);
      pdf.setFont("helvetica", "bold");
      pdf.text("Technology Radar Report", pageWidth / 2, yPos, { align: "center" });
      yPos += 15;

      // Date
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 15;

      // Stats Section
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("Statistics Summary", 15, yPos);
      yPos += 10;

      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      const stats = [
        `Total Technologies: ${data.stats.total}`,
        `Adopt: ${data.stats.adopt}`,
        `Trial: ${data.stats.trial}`,
        `Assess: ${data.stats.assess}`,
        `Hold: ${data.stats.hold}`,
        `Technical Debt: ${data.stats.technicalDebt}`,
        `Opportunities: ${data.stats.opportunities}`,
      ];
      stats.forEach((stat) => {
        pdf.text(stat, 20, yPos);
        yPos += 6;
      });
      yPos += 10;

      // Technologies Table
      if (data.technologies.length > 0) {
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.text("Technologies", 15, yPos);
        yPos += 8;

        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        pdf.text("Name", 15, yPos);
        pdf.text("Category", 60, yPos);
        pdf.text("Quadrant", 110, yPos);
        pdf.text("Ring", 155, yPos);
        yPos += 5;

        pdf.setFont("helvetica", "normal");
        data.technologies.forEach((tech) => {
          if (yPos > 270) {
            pdf.addPage();
            yPos = 20;
          }
          pdf.text(tech.name.substring(0, 25), 15, yPos);
          pdf.text(tech.category.substring(0, 25), 60, yPos);
          pdf.text(quadrantLabels[tech.quadrant].substring(0, 20), 110, yPos);
          pdf.text(tech.ring, 155, yPos);
          yPos += 5;
        });
        yPos += 10;
      }

      // Gap Analysis
      if (data.gapAnalysis.length > 0) {
        if (yPos > 200) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.text("Gap Analysis", 15, yPos);
        yPos += 8;

        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        pdf.text("Technology", 15, yPos);
        pdf.text("Category", 60, yPos);
        pdf.text("Gap Type", 110, yPos);
        pdf.text("Recommendation", 150, yPos);
        yPos += 5;

        pdf.setFont("helvetica", "normal");
        data.gapAnalysis.forEach((gap) => {
          if (yPos > 270) {
            pdf.addPage();
            yPos = 20;
          }
          pdf.text(gap.technologyName.substring(0, 25), 15, yPos);
          pdf.text(gap.category.substring(0, 25), 60, yPos);
          pdf.text((gap.gapType || "-").substring(0, 15), 110, yPos);
          pdf.text((gap.recommendation || "-").substring(0, 25), 150, yPos);
          yPos += 5;
        });
      }

      pdf.save("technology-radar-report.pdf");
      toast.success("Exported comprehensive report to PDF");
    } catch (error) {
      console.error("Failed to export PDF:", error);
      toast.error("Failed to export PDF");
    } finally {
      setIsExporting(false);
    }
  }, [data]);

  // Base dimensions for the radar
  const baseSize = 500;
  const baseCenter = baseSize / 2; // 250

  // Base ring radii
  const baseRingRadii: Record<string, number> = {
    adopt: 50,
    trial: 100,
    assess: 150,
    hold: 200,
  };

  // Calculate scaled dimensions based on zoom
  const scaledSize = baseSize * zoom;
  const scaledCenter = scaledSize / 2;
  const scaledRingRadii = {
    adopt: baseRingRadii.adopt * zoom,
    trial: baseRingRadii.trial * zoom,
    assess: baseRingRadii.assess * zoom,
    hold: baseRingRadii.hold * zoom,
  };

  // Calculate positions for radar visualization with zoom scaling
  const getRadarPosition = (tech: Technology, index: number, total: number) => {
    const quadrantAngles: Record<string, number> = {
      techniques: -45,
      tools: 45,
      platforms: 135,
      languages_frameworks: 225,
    };

    const baseAngle = quadrantAngles[tech.quadrant];
    // Scale angle spread based on zoom - more spread when zoomed in
    const angleSpread = 20 * Math.max(1, zoom * 0.5);
    const angleRad = ((baseAngle + (index * angleSpread)) * Math.PI) / 180;
    const radius = scaledRingRadii[tech.ring];

    return {
      x: scaledCenter + radius * Math.cos(angleRad),
      y: scaledCenter + radius * Math.sin(angleRad),
    };
  };

  const getGapIcon = (gapType: string | null) => {
    switch (gapType) {
      case "behind":
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case "ahead":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "technical_debt":
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "opportunity":
        return <CheckCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-400" />;
    }
  };

  const getGapBadge = (gapType: string | null) => {
    switch (gapType) {
      case "behind":
        return <Badge className="bg-red-500/10 text-red-600">Behind</Badge>;
      case "ahead":
        return <Badge className="bg-green-500/10 text-green-600">Ahead</Badge>;
      case "technical_debt":
        return <Badge className="bg-red-500/10 text-red-600">Technical Debt</Badge>;
      case "opportunity":
        return <Badge className="bg-yellow-500/10 text-yellow-600">Opportunity</Badge>;
      case "aligned":
        return <Badge className="bg-green-500/10 text-green-600">Aligned</Badge>;
      default:
        return <Badge variant="secondary">N/A</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Technology Radar</h1>
          <p className="text-muted-foreground">
            Visualize and analyze your organization&apos;s technology landscape
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={isExporting}>
                {isExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileType className="mr-2 h-4 w-4" />
                )}
                Export Report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportComprehensivePDF}>
                <FileType className="mr-2 h-4 w-4" />
                Export PDF Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => fetchData(true)} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold">{data?.stats.total || 0}</p>
              <p className="text-xs text-muted-foreground">Total Technologies</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{data?.stats.adopt || 0}</p>
              <p className="text-xs text-muted-foreground">Adopt</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{data?.stats.trial || 0}</p>
              <p className="text-xs text-muted-foreground">Trial</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">{data?.stats.assess || 0}</p>
              <p className="text-xs text-muted-foreground">Assess</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{data?.stats.hold || 0}</p>
              <p className="text-xs text-muted-foreground">Hold</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{data?.stats.technicalDebt || 0}</p>
              <p className="text-xs text-muted-foreground">Technical Debt</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="radar" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="radar">Radar View</TabsTrigger>
            <TabsTrigger value="table">Table View</TabsTrigger>
            <TabsTrigger value="gap">Gap Analysis</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Select value={selectedQuadrant} onValueChange={setSelectedQuadrant}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Quadrant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Quadrants</SelectItem>
                <SelectItem value="techniques">Techniques</SelectItem>
                <SelectItem value="tools">Tools</SelectItem>
                <SelectItem value="platforms">Platforms</SelectItem>
                <SelectItem value="languages_frameworks">Languages</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedRing} onValueChange={setSelectedRing}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Ring" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rings</SelectItem>
                <SelectItem value="adopt">Adopt</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="assess">Assess</SelectItem>
                <SelectItem value="hold">Hold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Radar View */}
        <TabsContent value="radar">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle>Radar View</CardTitle>
                <CardDescription>
                  Visual representation of technology positions
                </CardDescription>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isExporting}>
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={exportRadarToPNG} disabled={isExporting}>
                    <FileImage className="mr-2 h-4 w-4" />
                    Export as PNG
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportRadarToSVG}>
                    <FileImage className="mr-2 h-4 w-4" />
                    Export as SVG
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent>
              {/* Polish P2.5 — D3 layout toggle. */}
              <div className="flex items-center justify-end gap-4 mb-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <Switch checked={useD3} onCheckedChange={setUseD3} /> D3 layout
                </label>
                {useD3 && (
                  <label className="inline-flex items-center gap-2">
                    <Switch checked={showTwOverlay} onCheckedChange={setShowTwOverlay} /> ThoughtWorks overlay
                  </label>
                )}
              </div>

              {useD3 && (
                <div className="flex justify-center mb-4">
                  <D3Radar
                    size={640}
                    data={(filteredTechnologies as Array<{ name: string; quadrant: string; ring: string; description?: string; twPos?: string }>).map((t) => ({
                      name: t.name,
                      // Map orchestrator's "languages_frameworks" to the D3
                      // component's hyphen-style key.
                      quadrant: (t.quadrant === "languages_frameworks" ? "languages-frameworks" : t.quadrant) as RadarTech["quadrant"],
                      ring: t.ring as RadarTech["ring"],
                      twRing: showTwOverlay ? (t.twPos as RadarTech["twRing"] | undefined) : undefined,
                      rationale: t.description,
                    }))}
                  />
                </div>
              )}

              {/* Zoom Controls */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={zoom <= minZoom}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium w-16 text-center">{Math.round(zoom * 100)}%</span>
                  <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={zoom >= maxZoom}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleResetZoom}>
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Move className="h-4 w-4" />
                  <span>Drag to pan • Scroll to zoom</span>
                </div>
              </div>

              {/* Radar Container with overflow */}
              <div
                ref={radarContainerRef}
                className={`relative overflow-hidden border rounded-lg bg-background ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                style={{ height: "500px" }}
              >
                <svg
                  ref={svgRef}
                  width="500"
                  height="500"
                  viewBox={`${-pan.x / zoom} ${-pan.y / zoom} ${scaledSize / zoom} ${scaledSize / zoom}`}
                  className="max-w-full"
                  style={{
                    transition: isDragging ? "none" : "viewBox 0.1s ease-out",
                  }}
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {/* Quadrant background fills (coordinate system style) */}
                  {/* Techniques - Top-Right quadrant (270° to 0°) */}
                  <path
                    d={`M ${scaledCenter} ${scaledCenter} L ${scaledCenter} ${scaledCenter - scaledRingRadii.hold} A ${scaledRingRadii.hold} ${scaledRingRadii.hold} 0 0 1 ${scaledCenter + scaledRingRadii.hold} ${scaledCenter} Z`}
                    fill="rgba(34, 197, 94, 0.08)"
                    stroke="none"
                  />
                  {/* Tools - Bottom-Right quadrant (0° to 90°) */}
                  <path
                    d={`M ${scaledCenter} ${scaledCenter} L ${scaledCenter + scaledRingRadii.hold} ${scaledCenter} A ${scaledRingRadii.hold} ${scaledRingRadii.hold} 0 0 1 ${scaledCenter} ${scaledCenter + scaledRingRadii.hold} Z`}
                    fill="rgba(59, 130, 246, 0.08)"
                    stroke="none"
                  />
                  {/* Platforms - Bottom-Left quadrant (90° to 180°) */}
                  <path
                    d={`M ${scaledCenter} ${scaledCenter} L ${scaledCenter} ${scaledCenter + scaledRingRadii.hold} A ${scaledRingRadii.hold} ${scaledRingRadii.hold} 0 0 1 ${scaledCenter - scaledRingRadii.hold} ${scaledCenter} Z`}
                    fill="rgba(234, 179, 8, 0.08)"
                    stroke="none"
                  />
                  {/* Languages & Frameworks - Top-Left quadrant (180° to 270°) */}
                  <path
                    d={`M ${scaledCenter} ${scaledCenter} L ${scaledCenter - scaledRingRadii.hold} ${scaledCenter} A ${scaledRingRadii.hold} ${scaledRingRadii.hold} 0 0 1 ${scaledCenter} ${scaledCenter - scaledRingRadii.hold} Z`}
                    fill="rgba(239, 68, 68, 0.08)"
                    stroke="none"
                  />

                  {/* Ring background fills (from outer to inner) */}
                  {/* Hold ring - outermost */}
                  <circle cx={scaledCenter} cy={scaledCenter} r={scaledRingRadii.hold} fill="#fee2e2" fillOpacity="0.5" stroke="none" />
                  {/* Assess ring */}
                  <circle cx={scaledCenter} cy={scaledCenter} r={scaledRingRadii.assess} fill="#fef9c3" fillOpacity="0.5" stroke="none" />
                  {/* Trial ring */}
                  <circle cx={scaledCenter} cy={scaledCenter} r={scaledRingRadii.trial} fill="#dbeafe" fillOpacity="0.5" stroke="none" />
                  {/* Adopt ring - innermost */}
                  <circle cx={scaledCenter} cy={scaledCenter} r={scaledRingRadii.adopt} fill="#dcfce7" fillOpacity="0.5" stroke="none" />

                  {/* Radar circles (ring borders) */}
                  {[scaledRingRadii.adopt, scaledRingRadii.trial, scaledRingRadii.assess, scaledRingRadii.hold].map((radius, idx) => (
                    <circle
                      key={idx}
                      cx={scaledCenter}
                      cy={scaledCenter}
                      r={radius}
                      fill="none"
                      stroke="hsl(var(--border))"
                      strokeWidth={1.5 * Math.max(1, zoom * 0.5)}
                    />
                  ))}

                  {/* Quadrant lines */}
                  <line
                    x1={scaledCenter}
                    y1={scaledCenter - scaledRingRadii.hold}
                    x2={scaledCenter}
                    y2={scaledCenter + scaledRingRadii.hold}
                    stroke="hsl(var(--border))"
                    strokeWidth={1.5 * Math.max(1, zoom * 0.5)}
                  />
                  <line
                    x1={scaledCenter - scaledRingRadii.hold}
                    y1={scaledCenter}
                    x2={scaledCenter + scaledRingRadii.hold}
                    y2={scaledCenter}
                    stroke="hsl(var(--border))"
                    strokeWidth={1.5 * Math.max(1, zoom * 0.5)}
                  />

                  {/* Ring labels with guidelines - positioned in each ring */}
                  {/* Adopt ring label */}
                  <text
                    x={scaledCenter}
                    y={scaledCenter - 20 * zoom}
                    textAnchor="middle"
                    fontSize={10 * Math.max(1, zoom * 0.5)}
                    className="font-semibold fill-green-700"
                  >ADOPT</text>
                  <text
                    x={scaledCenter}
                    y={scaledCenter - 8 * zoom}
                    textAnchor="middle"
                    fontSize={7 * Math.max(1, zoom * 0.5)}
                    className="fill-green-600"
                  >Proven & Recommended</text>

                  {/* Trial ring label */}
                  <text
                    x={scaledCenter}
                    y={scaledCenter - scaledRingRadii.adopt - 25 * zoom}
                    textAnchor="middle"
                    fontSize={10 * Math.max(1, zoom * 0.5)}
                    className="font-semibold fill-blue-700"
                  >TRIAL</text>
                  <text
                    x={scaledCenter}
                    y={scaledCenter - scaledRingRadii.adopt - 13 * zoom}
                    textAnchor="middle"
                    fontSize={7 * Math.max(1, zoom * 0.5)}
                    className="fill-blue-600"
                  >Ready for Use</text>

                  {/* Assess ring label */}
                  <text
                    x={scaledCenter}
                    y={scaledCenter - scaledRingRadii.trial - 30 * zoom}
                    textAnchor="middle"
                    fontSize={10 * Math.max(1, zoom * 0.5)}
                    className="font-semibold fill-yellow-700"
                  >ASSESS</text>
                  <text
                    x={scaledCenter}
                    y={scaledCenter - scaledRingRadii.trial - 18 * zoom}
                    textAnchor="middle"
                    fontSize={7 * Math.max(1, zoom * 0.5)}
                    className="fill-yellow-600"
                  >Explore & Evaluate</text>

                  {/* Hold ring label */}
                  <text
                    x={scaledCenter}
                    y={scaledCenter - scaledRingRadii.assess - 35 * zoom}
                    textAnchor="middle"
                    fontSize={10 * Math.max(1, zoom * 0.5)}
                    className="font-semibold fill-red-700"
                  >HOLD</text>
                  <text
                    x={scaledCenter}
                    y={scaledCenter - scaledRingRadii.assess - 23 * zoom}
                    textAnchor="middle"
                    fontSize={7 * Math.max(1, zoom * 0.5)}
                    className="fill-red-600"
                  >Proceed with Caution</text>

                  {/* Quadrant labels with guidelines */}
                  {/* Techniques - Top */}
                  <text
                    x={scaledCenter}
                    y={scaledCenter - scaledRingRadii.hold - 22 * zoom}
                    textAnchor="middle"
                    fontSize={14 * Math.max(1, zoom * 0.5)}
                    className="font-bold fill-foreground"
                  >
                    TECHNIQUES
                  </text>
                  <text
                    x={scaledCenter}
                    y={scaledCenter - scaledRingRadii.hold - 8 * zoom}
                    textAnchor="middle"
                    fontSize={8 * Math.max(1, zoom * 0.5)}
                    className="fill-muted-foreground"
                  >
                    Patterns & Practices
                  </text>

                  {/* Tools - Right */}
                  <text
                    x={scaledCenter + scaledRingRadii.hold + 32 * zoom}
                    y={scaledCenter - 6 * zoom}
                    textAnchor="end"
                    fontSize={14 * Math.max(1, zoom * 0.5)}
                    className="font-bold fill-foreground"
                  >
                    TOOLS
                  </text>
                  <text
                    x={scaledCenter + scaledRingRadii.hold + 32 * zoom}
                    y={scaledCenter + 8 * zoom}
                    textAnchor="end"
                    fontSize={8 * Math.max(1, zoom * 0.5)}
                    className="fill-muted-foreground"
                  >
                    Utilities & Services
                  </text>

                  {/* Platforms - Bottom */}
                  <text
                    x={scaledCenter}
                    y={scaledCenter + scaledRingRadii.hold + 28 * zoom}
                    textAnchor="middle"
                    fontSize={14 * Math.max(1, zoom * 0.5)}
                    className="font-bold fill-foreground"
                  >
                    PLATFORMS
                  </text>
                  <text
                    x={scaledCenter}
                    y={scaledCenter + scaledRingRadii.hold + 42 * zoom}
                    textAnchor="middle"
                    fontSize={8 * Math.max(1, zoom * 0.5)}
                    className="fill-muted-foreground"
                  >
                    Infrastructure & Cloud
                  </text>

                  {/* Languages & Frameworks - Left */}
                  <text
                    x={scaledCenter - scaledRingRadii.hold - 32 * zoom}
                    y={scaledCenter - 6 * zoom}
                    textAnchor="start"
                    fontSize={14 * Math.max(1, zoom * 0.5)}
                    className="font-bold fill-foreground"
                  >
                    LANGS & FW
                  </text>
                  <text
                    x={scaledCenter - scaledRingRadii.hold - 32 * zoom}
                    y={scaledCenter + 8 * zoom}
                    textAnchor="start"
                    fontSize={8 * Math.max(1, zoom * 0.5)}
                    className="fill-muted-foreground"
                  >
                    Languages & Frameworks
                  </text>

                  {/* Technology blips - colored by ring */}
                  {filteredTechnologies.map((tech, index) => {
                    const pos = getRadarPosition(tech, index, filteredTechnologies.length);
                    // Ring-specific fill colors
                    const ringFillColors: Record<string, string> = {
                      adopt: "#22c55e",   // green-500
                      trial: "#3b82f6",   // blue-500
                      assess: "#eab308",  // yellow-500
                      hold: "#ef4444",    // red-500
                    };
                    const fillColor = ringFillColors[tech.ring];
                    const blipRadius = 10 * Math.max(1, zoom * 0.4);
                    return (
                      <TooltipProvider key={tech.id}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <g
                              className="cursor-pointer"
                              onClick={() => setSelectedTech(tech)}
                            >
                              <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={blipRadius}
                                fill={fillColor}
                                stroke="white"
                                strokeWidth={2 * Math.max(1, zoom * 0.3)}
                              />
                              <text
                                x={pos.x}
                                y={pos.y + 3 * Math.max(1, zoom * 0.3)}
                                textAnchor="middle"
                                fontSize={8 * Math.max(1, zoom * 0.3)}
                                className="fill-white font-bold"
                              >
                                {tech.name.substring(0, 2).toUpperCase()}
                              </text>
                            </g>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-1">
                              <p className="font-medium">{tech.name}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {tech.ring} • {quadrantLabels[tech.quadrant]}
                              </p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </svg>
              </div>

              {/* Legend */}
              <div className="mt-4 flex justify-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">Adopt (Proven)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span className="text-sm font-medium">Trial (Ready)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <span className="text-sm font-medium">Assess (Explore)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <span className="text-sm font-medium">Hold (Caution)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Table View */}
        <TabsContent value="table">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle>Technology List</CardTitle>
                <CardDescription>
                  {filteredTechnologies.length} technologies found
                </CardDescription>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={exportTableToExcel}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Export as Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportTableToJSON}>
                    <FileJson className="mr-2 h-4 w-4" />
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Technology</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Quadrant</TableHead>
                    <TableHead>Ring</TableHead>
                    <TableHead>Org Position</TableHead>
                    <TableHead>TW Position</TableHead>
                    <TableHead>Gap Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTechnologies.map((tech) => (
                    <TableRow
                      key={tech.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedTech(tech)}
                    >
                      <TableCell className="font-medium">{tech.name}</TableCell>
                      <TableCell>{tech.category}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{quadrantLabels[tech.quadrant]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${ringColors[tech.ring].bg}/10 ${ringColors[tech.ring].text}`}>
                          {tech.ring}
                        </Badge>
                      </TableCell>
                      <TableCell>{tech.organizationPos || "-"}</TableCell>
                      <TableCell>{tech.thoughtworksPos || "-"}</TableCell>
                      <TableCell>{getGapBadge(tech.gapStatus)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Gap Analysis */}
        <TabsContent value="gap">
          <div className="flex items-center justify-end mb-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={exportGapToExcel}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportGapToJSON}>
                  <FileJson className="mr-2 h-4 w-4" />
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Gap Analysis Summary</CardTitle>
                <CardDescription>
                  Comparison with ThoughtWorks Technology Radar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-200">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                      <span className="font-medium">Technical Debt</span>
                    </div>
                    <span className="text-2xl font-bold text-red-600">
                      {data?.stats.technicalDebt || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/5 border border-yellow-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-yellow-500" />
                      <span className="font-medium">Opportunities</span>
                    </div>
                    <span className="text-2xl font-bold text-yellow-600">
                      {data?.stats.opportunities || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="font-medium">Aligned</span>
                    </div>
                    <span className="text-2xl font-bold text-green-600">
                      {data?.gapAnalysis.filter(g => g.gapType === "aligned").length || 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Gap Analysis Details</CardTitle>
                <CardDescription>
                  Technologies with significant gaps
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {data?.gapAnalysis.filter(g => g.gapType && g.gapType !== "aligned").map((gap) => (
                    <div key={gap.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        {getGapIcon(gap.gapType)}
                        <div>
                          <p className="font-medium">{gap.technologyName}</p>
                          <p className="text-xs text-muted-foreground">{gap.category}</p>
                        </div>
                      </div>
                      {getGapBadge(gap.gapType)}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Technology Detail Dialog */}
      <Dialog open={!!selectedTech} onOpenChange={() => setSelectedTech(null)}>
        <DialogContent className="max-w-md">
          {selectedTech && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedTech.name}</DialogTitle>
                <DialogDescription>{selectedTech.category}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Quadrant</p>
                    <p className="font-medium">{quadrantLabels[selectedTech.quadrant]}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Ring</p>
                    <Badge className={`${ringColors[selectedTech.ring].bg}/10 ${ringColors[selectedTech.ring].text}`}>
                      {selectedTech.ring}
                    </Badge>
                  </div>
                </div>

                {selectedTech.description && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Description</p>
                    <p className="text-sm">{selectedTech.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-xs text-muted-foreground">Org</p>
                    <p className="font-medium text-sm">{selectedTech.organizationPos || "-"}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-xs text-muted-foreground">TW</p>
                    <p className="font-medium text-sm">{selectedTech.thoughtworksPos || "-"}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-xs text-muted-foreground">Gartner</p>
                    <p className="font-medium text-sm">{selectedTech.gartnerPos || "-"}</p>
                  </div>
                </div>

                {selectedTech.gapStatus && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Gap Status</span>
                    {getGapBadge(selectedTech.gapStatus)}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
