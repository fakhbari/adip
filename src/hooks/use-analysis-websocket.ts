"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";

interface AnalysisProgress {
  progress: number;
  step: string;
  message: string;
  agentType?: string;
}

interface AnalysisResult {
  type: string;
  status: "success" | "failed" | "skipped";
  data?: any;
  error?: string;
}

interface WSProgressData {
  analysisRunId: string;
  repositoryId: string;
  progress: {
    agentId: string;
    agentType: string;
    status: string;
    progress: number;
    message: string;
    timestamp: string;
  };
}

interface WSCompleteData {
  analysisRunId: string;
  repositoryId: string;
  status: string;
  results: AnalysisResult[];
  duration: number;
  documentsGenerated: number;
}

interface WSErrorData {
  analysisRunId: string;
  repositoryId: string;
  error: string;
  agentType?: string;
}

interface UseAnalysisWebSocketResult {
  isConnected: boolean;
  isAnalyzing: boolean;
  progress: AnalysisProgress | null;
  analysisRunId: string | null;
  runAnalysis: (repositoryId: string, types?: string[], aiProviderId?: string | null) => Promise<void>;
  cancelAnalysis: () => void;
}

export function useAnalysisWebSocket(
  onAnalysisComplete?: (results: AnalysisResult[]) => void
): UseAnalysisWebSocketResult {
  const socketRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [analysisRunId, setAnalysisRunId] = useState<string | null>(null);
  const currentRepositoryId = useRef<string | null>(null);

  useEffect(() => {
    // Dynamically import socket.io-client to avoid SSR issues
    const initSocket = async () => {
      try {
        const { io } = await import("socket.io-client");
        
        // Connect to analysis WebSocket service via gateway
        socketRef.current = io("/?XTransformPort=3003", {
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });

        socketRef.current.on("connect", () => {
          console.log("Connected to analysis WebSocket service");
          setIsConnected(true);
          
          // Subscribe to repository if we were analyzing
          if (currentRepositoryId.current) {
            socketRef.current.emit("subscribe-repository", {
              repositoryId: currentRepositoryId.current,
            });
          }
        });

        socketRef.current.on("disconnect", () => {
          console.log("Disconnected from analysis WebSocket service");
          setIsConnected(false);
        });

        // Handle successful subscription
        socketRef.current.on("subscribed-repository", (data: any) => {
          console.log("Subscribed to repository:", data.repositoryId);
        });

        // Handle progress updates
        socketRef.current.on("analysis-progress", (data: WSProgressData) => {
          console.log("Progress update:", data);
          setProgress({
            progress: data.progress.progress,
            step: data.progress.agentType,
            message: data.progress.message,
            agentType: data.progress.agentType,
          });
        });

        // Handle completion
        socketRef.current.on("analysis-complete", (data: WSCompleteData) => {
          console.log("Analysis complete:", data);
          setIsAnalyzing(false);
          setProgress({ progress: 100, step: "completed", message: "Analysis completed!" });
          setAnalysisRunId(null);
          currentRepositoryId.current = null;
          
          toast.success(`Analysis completed! ${data.documentsGenerated} documents generated.`);
          onAnalysisComplete?.(data.results);
        });

        // Handle errors
        socketRef.current.on("analysis-error", (data: WSErrorData) => {
          console.error("Analysis error:", data);
          setIsAnalyzing(false);
          setProgress(null);
          setAnalysisRunId(null);
          currentRepositoryId.current = null;
          
          toast.error(data.error || "Analysis failed");
        });

        socketRef.current.on("connect_error", (error: any) => {
          console.error("Connection error:", error);
          setIsConnected(false);
        });

        // Handle pong (connection health check)
        socketRef.current.on("pong", (data: any) => {
          console.debug("Pong received:", data);
        });
      } catch (error) {
        console.error("Failed to initialize socket:", error);
      }
    };

    initSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [onAnalysisComplete]);

  const runAnalysis = useCallback(
    async (repositoryId: string, types?: string[], aiProviderId?: string | null) => {
      if (!socketRef.current) {
        toast.error("Analysis service not ready. Please wait or refresh.");
        return;
      }

      try {
        setIsAnalyzing(true);
        setProgress({ progress: 0, step: "init", message: "Starting analysis..." });
        currentRepositoryId.current = repositoryId;

        // Start analysis via REST API
        const response = await fetch(`/api/repositories/${repositoryId}/analysis`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabledAgents: types || ["tech-radar", "c4", "adr", "openapi"],
            aiProviderId,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to start analysis");
        }

        const result = await response.json();
        setAnalysisRunId(result.analysisRunId);

        // Subscribe to analysis updates via WebSocket
        if (isConnected) {
          socketRef.current.emit("join-analysis", {
            analysisRunId: result.analysisRunId,
            repositoryId,
          });
          
          socketRef.current.emit("subscribe-repository", {
            repositoryId,
          });
        }

        toast.info("Analysis started...");
      } catch (error) {
        console.error("Failed to start analysis:", error);
        setIsAnalyzing(false);
        setProgress(null);
        currentRepositoryId.current = null;
        toast.error(error instanceof Error ? error.message : "Failed to start analysis");
      }
    },
    [isConnected]
  );

  const cancelAnalysis = useCallback(async () => {
    if (!analysisRunId || !currentRepositoryId.current) return;

    try {
      const response = await fetch(
        `/api/repositories/${currentRepositoryId.current}/analysis?analysisRunId=${analysisRunId}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        setIsAnalyzing(false);
        setProgress(null);
        setAnalysisRunId(null);
        currentRepositoryId.current = null;
        toast.info("Analysis cancelled");
      }
    } catch (error) {
      console.error("Failed to cancel analysis:", error);
      toast.error("Failed to cancel analysis");
    }
  }, [analysisRunId]);

  return {
    isConnected,
    isAnalyzing,
    progress,
    analysisRunId,
    runAnalysis,
    cancelAnalysis,
  };
}
