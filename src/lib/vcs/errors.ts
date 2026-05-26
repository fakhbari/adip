// Structured VCS error.
//
// Polish P3.5. The clients used to throw plain `new Error("…")` which
// the orchestrator could not distinguish from "404 the repo does not
// exist" vs "401 the token is bad" vs "500 the upstream is down".
// The error envelope in api-errors.ts maps `VCSError.status` to the
// right HTTP code; the worker logs it with `provider` + `operation`
// for forensics.

export class VCSError extends Error {
  override readonly name = "VCSError";
  constructor(
    public readonly provider: "github" | "gitlab" | "bitbucket",
    public readonly status: number,
    public readonly operation: string,
    detail?: string
  ) {
    super(`${provider} ${operation} failed with status ${status}${detail ? `: ${detail}` : ""}`);
  }
}
