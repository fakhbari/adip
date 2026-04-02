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

// Parse repository URL to extract owner and repo
export function parseRepositoryUrl(url: string): {
  type: VCSConnectionType;
  owner: string;
  repo: string;
} | null {
  // GitHub patterns
  const githubMatch = url.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
  if (githubMatch) {
    return { type: "github", owner: githubMatch[1], repo: githubMatch[2].replace(/\.git$/, "") };
  }

  // GitLab patterns
  const gitlabMatch = url.match(/gitlab\.com[\/:]([^\/]+)\/([^\/\.]+)/);
  if (gitlabMatch) {
    return { type: "gitlab", owner: gitlabMatch[1], repo: gitlabMatch[2].replace(/\.git$/, "") };
  }

  // Bitbucket patterns
  const bitbucketMatch = url.match(/bitbucket\.org[\/:]([^\/]+)\/([^\/\.]+)/);
  if (bitbucketMatch) {
    return { type: "bitbucket", owner: bitbucketMatch[1], repo: bitbucketMatch[2].replace(/\.git$/, "") };
  }

  return null;
}

// Re-export types and clients
export * from "./types";
export { GitHubClient } from "./github-client";
export { GitLabClient } from "./gitlab-client";
export { BitbucketClient } from "./bitbucket-client";
