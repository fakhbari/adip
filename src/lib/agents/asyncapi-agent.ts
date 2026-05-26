// AsyncAPI Agent — Phase 3.1.
//
// Replaces the previous `asyncapi -> OpenAPIAgent` alias with a real
// agent that detects message-broker usage. The regex pre-pass surfaces
// brokers and topic/queue/channel names from dependency files,
// annotations, and config; the optional LLM pass synthesises the
// AsyncAPI 3.0 YAML document.

import { BaseAgent, createAgentConfig } from "./base-agent";
import { AgentResult, AnalysisContext } from "./types";
import { logger } from "@/lib/logger";
import { PromptRegistry } from "@/lib/llm/prompt-registry";

const aaLog = logger("agents.asyncapi");

// Heuristics for identifying broker SDK usage. Matched against dependency
// file content (package.json, pom.xml, requirements.txt, etc.). We keep
// these as simple substring sets because the goal of the regex pre-pass
// is high recall + cheap; the LLM pass refines.
const BROKER_HINTS: Record<string, string[]> = {
  kafka: [
    "kafkajs", "@confluentinc/kafka-javascript", "node-rdkafka",
    "spring-kafka", "kafka-clients", "kafka-streams",
    "confluent-kafka",
  ],
  rabbitmq: ["amqplib", "spring-amqp", "pika", "rabbitpy", "easynetq"],
  mqtt: ["mqtt ", '"mqtt"', "paho-mqtt", "eclipse.paho"],
  activemq: ["spring-activemq", "activemq-client", "activemq-broker"],
  sqs: ["@aws-sdk/client-sqs", "boto3", "AmazonSQSClient"],
  nats: ['"nats"', "nats.js", "io.nats"],
};

const TOPIC_LITERAL_RE = /(?:topic|channel|queue|exchange|routingKey)["'\s:=]*["'`]([\w./:-]{3,80})["'`]/gi;

type DetectedAsyncAPIBroker = { broker: string; evidenceFile: string };
type DetectedAsyncAPIChannel = { name: string; sourceFile: string };

export type AsyncAPISavePayload = {
  brokers: DetectedAsyncAPIBroker[];
  channels: DetectedAsyncAPIChannel[];
  asyncapiSpec?: string;
};

export class AsyncAPIAgent extends BaseAgent {
  constructor() {
    super(createAgentConfig("asyncapi"));
  }

  async analyze(context: AnalysisContext): Promise<AgentResult> {
    const startTime = Date.now();
    const brokers: DetectedAsyncAPIBroker[] = [];
    const channelsSet = new Set<string>();
    const channels: DetectedAsyncAPIChannel[] = [];

    this.updateProgress(10, "Scanning for message broker SDKs...");

    for (const [path, content] of context.fileContents) {
      for (const [broker, hints] of Object.entries(BROKER_HINTS)) {
        if (hints.some((h) => content.includes(h))) {
          brokers.push({ broker, evidenceFile: path });
          break; // one broker tag per file is enough
        }
      }
    }

    this.updateProgress(45, "Extracting topic / queue / channel names...");

    for (const [path, content] of context.fileContents) {
      // Skip pure dependency files — their string matches are package
      // identifiers, not channel names.
      if (/package\.json|pom\.xml|build\.gradle|requirements\.txt|go\.mod/.test(path)) continue;

      let m: RegExpExecArray | null;
      const re = new RegExp(TOPIC_LITERAL_RE.source, "gi");
      while ((m = re.exec(content)) !== null) {
        const name = m[1];
        if (channelsSet.has(name)) continue;
        channelsSet.add(name);
        channels.push({ name, sourceFile: path });
        if (channelsSet.size >= 200) break; // cap to keep prompts bounded
      }
    }

    this.updateProgress(70, "Building AsyncAPI document...");

    // Phase 2.5 LLM pass — synthesise the AsyncAPI spec when a provider
    // is wired. The prompt template lives in prompts/asyncapi/spec.fa.md.
    let asyncapiSpec: string | undefined;
    if (context.llm && channels.length > 0) {
      try {
        const locale = context.outputLocale ?? "fa";
        const prompt = await PromptRegistry.render({
          agent: "asyncapi",
          task: "spec",
          locale,
          vars: {
            repoName: context.repository.name,
            brokers: [...new Set(brokers.map((b) => b.broker))].join(", ") || "(none detected)",
            channels: channels.map((c) => `- ${c.name} (in ${c.sourceFile})`).join("\n"),
          },
        });
        const result = await context.llm.chat(
          [{ role: "user", content: prompt }],
          { meta: { analysisRunId: context.analysisRunId, agentType: "asyncapi" } }
        );
        asyncapiSpec = result.content;
      } catch (err) {
        aaLog.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "AsyncAPI LLM pass skipped"
        );
      }
    }

    this.filesAnalyzed = context.fileContents.size;

    return {
      agentType: "asyncapi",
      status: "success",
      data: { brokers, channels, asyncapiSpec } satisfies AsyncAPISavePayload,
      duration: Date.now() - startTime,
      filesAnalyzed: this.filesAnalyzed,
    };
  }
}
