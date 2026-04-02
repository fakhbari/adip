"use client";

import { useEffect, useState } from "react";
import {
  GitBranch,
  FileText,
  CheckCircle,
  AlertTriangle,
  Activity,
  TrendingUp,
  Clock,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

interface DashboardStats {
  totalRepositories: number;
  documentedRepos: number;
  needsAttention: number;
  totalDocuments: number;
  lastRunStatus: "success" | "failed" | "running";
  lastRunTime: string;
  coverageByType: {
    type: string;
    coverage: number;
    count: number;
  }[];
  recentActivity: {
    id: string;
    action: string;
    entity: string;
    time: string;
    status: "success" | "warning" | "error";
  }[];
  technologyDistribution: {
    name: string;
    value: number;
    color: string;
  }[];
  documentationTrend: {
    date: string;
    documents: number;
    repositories: number;
  }[];
}

const defaultStats: DashboardStats = {
  totalRepositories: 47,
  documentedRepos: 31,
  needsAttention: 16,
  totalDocuments: 186,
  lastRunStatus: "success",
  lastRunTime: "2024-03-15 02:30 AM",
  coverageByType: [
    { type: "C4 Docs", coverage: 76, count: 36 },
    { type: "ADRs", coverage: 58, count: 27 },
    { type: "Context Map", coverage: 40, count: 19 },
    { type: "OpenAPI", coverage: 89, count: 42 },
    { type: "AsyncAPI", coverage: 42, count: 20 },
    { type: "Data Catalog", coverage: 31, count: 15 },
  ],
  recentActivity: [
    { id: "1", action: "ADR Generated", entity: "auth-service", time: "5 min ago", status: "success" },
    { id: "2", action: "C4 Updated", entity: "payment-svc", time: "15 min ago", status: "success" },
    { id: "3", action: "API Docs", entity: "notification", time: "1 hour ago", status: "warning" },
    { id: "4", action: "Analysis Failed", entity: "report-gen", time: "2 hours ago", status: "error" },
    { id: "5", action: "Tech Radar", entity: "organization", time: "3 hours ago", status: "success" },
  ],
  technologyDistribution: [
    { name: "TypeScript", value: 18, color: "#3178c6" },
    { name: "Python", value: 12, color: "#3572A5" },
    { name: "Java", value: 8, color: "#b07219" },
    { name: "Go", value: 5, color: "#00ADD8" },
    { name: "Others", value: 4, color: "#6e7681" },
  ],
  documentationTrend: [
    { date: "Week 1", documents: 120, repositories: 25 },
    { date: "Week 2", documents: 145, repositories: 32 },
    { date: "Week 3", documents: 162, repositories: 40 },
    { date: "Week 4", documents: 186, repositories: 47 },
  ],
};

const chartConfig = {
  coverage: {
    label: "Coverage",
    color: "hsl(var(--primary))",
  },
  documents: {
    label: "Documents",
    color: "hsl(var(--chart-1))",
  },
  repositories: {
    label: "Repositories",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

export function DashboardOverview() {
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/dashboard/stats");
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-500";
      case "warning":
        return "bg-yellow-500";
      case "error":
        return "bg-red-500";
      case "running":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">Success</Badge>;
      case "warning":
        return <Badge className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20">Warning</Badge>;
      case "error":
        return <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/20">Error</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard Overview</h1>
          <p className="text-muted-foreground">
            Monitor your organization&apos;s architecture documentation status
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
            <div className={`h-2 w-2 rounded-full ${getStatusColor(stats.lastRunStatus)}`} />
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Last Run</span>
              <span className="text-sm font-medium">{stats.lastRunTime}</span>
            </div>
          </div>
          <Button>
            <Zap className="mr-2 h-4 w-4" />
            Run Analysis
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Repositories</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRepositories}</div>
            <p className="text-xs text-muted-foreground">Connected to ADIP</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fully Documented</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.documentedRepos}</div>
            <p className="text-xs text-muted-foreground">
              {Math.round((stats.documentedRepos / stats.totalRepositories) * 100)}% coverage
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.needsAttention}</div>
            <p className="text-xs text-muted-foreground">Missing or outdated docs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDocuments}</div>
            <p className="text-xs text-muted-foreground">Generated documentation</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Coverage by Document Type */}
        <Card>
          <CardHeader>
            <CardTitle>Documentation Coverage</CardTitle>
            <CardDescription>Coverage percentage by document type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.coverageByType.map((item) => (
                <div key={item.type} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.type}</span>
                    <span className="text-muted-foreground">
                      {item.coverage}% ({item.count} repos)
                    </span>
                  </div>
                  <Progress value={item.coverage} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Technology Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Technology Distribution</CardTitle>
            <CardDescription>Primary languages across repositories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={stats.technologyDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {stats.technologyDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Documentation Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Documentation Trend</CardTitle>
            <CardDescription>Growth over the past month</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={stats.documentationTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="documents"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--chart-1))" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="repositories"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--chart-2))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest documentation events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${getStatusColor(activity.status)}`} />
                    <div>
                      <p className="text-sm font-medium">{activity.action}</p>
                      <p className="text-xs text-muted-foreground">{activity.entity}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{activity.time}</span>
                    {getStatusBadge(activity.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
