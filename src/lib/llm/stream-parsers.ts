// Shared streaming-response parsers. Polish P4.2.
//
// Three providers use server-streamed responses but with two different
// wire shapes:
//   - OpenAI + Anthropic emit Server-Sent Events:
//       data: {…json…}\n\n
//   - Ollama emits newline-delimited JSON (one object per line).
//
// Both helpers consume a `Response.body` reader and yield parsed
// objects. They tolerate chunk-split boundaries (a chunk may end
// mid-line; we buffer and re-emit on the next chunk).

export async function* iterateSSE(response: Response): AsyncGenerator<Record<string, unknown>, void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE messages are separated by `\n\n`.
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLine = block
          .split("\n")
          .find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const payload = dataLine.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          yield JSON.parse(payload) as Record<string, unknown>;
        } catch {
          // skip malformed event (network glitch mid-chunk)
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* iterateNDJSON(response: Response): AsyncGenerator<Record<string, unknown>, void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line) as Record<string, unknown>;
        } catch {
          // skip malformed line
        }
      }
    }
    // Flush trailing buffer (rare — most servers terminate with \n).
    if (buffer.trim().length > 0) {
      try {
        yield JSON.parse(buffer.trim()) as Record<string, unknown>;
      } catch {
        /* drop */
      }
    }
  } finally {
    reader.releaseLock();
  }
}
