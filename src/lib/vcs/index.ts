// VCS Factory and Exports

import { VCSClient, VCSConnection, VCSConnectionType } from "./types";
import { GitHubClient } from "./github-client";
import { GitLabClient } from "./gitlab-client";
import { BitbucketClient } from "./bitbucket-client";

// Create VCS client based on connection type
export function createVCSClient(connection: VCSConnection): VCSClient {
  switch (connection.type) {
    case "github":
      return new GitHubClient(connection.accessToken || undefined, connection.url);
    
    case "gitlab":
      return new GitLabClient(connection.accessToken || undefined, connection.url);
    
    case "bitbucket":
      return new BitbucketClient(
        connection.accessToken || undefined,
        connection.username || undefined,
        connection.url
      );
    
    default:
      throw new Error(`Unsupported VCS type: ${connection.type}`);
  }
}

// Create VCS client for public repositories (no auth)
export function createPublicVCSClient(type: VCSConnectionType): VCSClient {
  switch (type) {
    case "github":
      return new GitHubClient();
    case "gitlab":
      return new GitLabClient();
    case "bitbucket":
      return new BitbucketClient();
    default:
      throw new Error(`Unsupported VCS type: ${type}`);
  }
}

// Parse a repository URL to extract type, owner, and repo.
//
// Supports:
//   - https://github.com/owner/repo[.git]
//   - https://gitlab.com/group/sub/sub/repo  (nested groups — last segment is the repo, everything before is the owner path)
//   - https://bitbucket.org/owner/repo
//   - git@github.com:owner/repo.git
//   - ssh://git@github.com:22/owner/repo.git
//   - self-hosted gitlab (any host containing "gitlab") — caller passes the
//     enterprise URL and we still detect type=gitlab.
//
// Returns null when the URL does not contain a recognisable provider host or
// the path does not look like owner+repo. The previous implementation was
// hard-coded to github.com / gitlab.com / bitbucket.org and silently dropped
// the trailing segment when groups were nested.
export function parseRepositoryUrl(url: string): {
  type: VCSConnectionType;
  owner: string;
  repo: string;
} | null {
  if (!url || typeof url !== "string") return null;

  // 1. Detect host. Strip protocol/auth/port/query to reach `host/path`.
  let hostAndPath: string;

  // ssh:// or git:// URL — Node's URL parser is inconsistent across versions
  // for non-special schemes (the port can leak back into the path), so we
  // match explicitly: scheme://[user@]host[:port]/path
  const sshUriMatch = url.match(/^(?:ssh|git):\/\/(?:[^@]+@)?([^:/]+)(?::\d+)?\/(.+)$/);
  // SCP-style: user@host:[port:]path (no slashes between host and port)
  const scpMatch = url.match(/^[^@:\s]+@([^:]+):(?:\d+:)?(.+)$/);

  if (sshUriMatch) {
    hostAndPath = `${sshUriMatch[1]}/${sshUriMatch[2]}`;
  } else if (scpMatch) {
    hostAndPath = `${scpMatch[1]}/${scpMatch[2]}`;
  } else {
    try {
      const parsed = new URL(url);
      hostAndPath = `${parsed.hostname}${parsed.pathname}`;
    } catch {
      // Last-ditch: assume the caller already gave us `host/owner/repo`.
      hostAndPath = url.replace(/^\/*/, "");
    }
  }

  // 2. Pick a provider from the hostname.
  const host = hostAndPath.split("/")[0].toLowerCase();
  let type: VCSConnectionType | null = null;
  if (host.includes("github")) type = "github";
  else if (host.includes("gitlab")) type = "gitlab";
  else if (host.includes("bitbucket")) type = "bitbucket";
  if (!type) return null;

  // 3. Split the path. For GitLab, accept nested groups — everything before
  //    the last segment is the owner, the last segment is the repo.
  const segments = hostAndPath
    .split("/")
    .slice(1) // drop the host
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/\.git$/, ""));

  if (segments.length < 2) return null;

  const repo = segments[segments.length - 1];
  const owner = segments.slice(0, -1).join("/");
  if (!owner || !repo) return null;

  return { type, owner, repo };
}

// Re-export types and clients
export * from "./types";
export { GitHubClient } from "./github-client";
export { GitLabClient } from "./gitlab-client";
export { BitbucketClient } from "./bitbucket-client";
