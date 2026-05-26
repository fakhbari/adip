// Tool registry. Phase 2.4 scaffolding — the per-agent tool wiring
// happens in Phase 2.5. For now we define the shape and ship a
// minimal in-memory registry the agents will populate.
//
// Note: native tool-use (Anthropic / OpenAI's `tools` array) is not
// invoked in this layer — agents call tools synchronously themselves
// via the dispatcher below. Wiring the model's tool-use protocol is
// a follow-up once we have RAG (Phase 2.3) and the model's signal
// gets richer.

import type { z } from "zod";

export interface ToolDef<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  /** Execute the tool. The dispatcher passes the parsed input. */
  handler: (input: I) => Promise<O>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  register<I, O>(tool: ToolDef<I, O>): void {
    this.tools.set(tool.name, tool as unknown as ToolDef);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async dispatch(name: string, rawInput: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new Error(`Invalid input to ${name}: ${JSON.stringify(parsed.error.issues)}`);
    }
    return tool.handler(parsed.data);
  }

  list(): ToolDef[] {
    return [...this.tools.values()];
  }
}
