// GitHub VCS Client

import { VCSClient, VCSFile, VCSRepository, VCSBranch, VCSCommit } from "./types";
import { fetchWithRetry, pLimit } from "./fetch-with-retry";

export class GitHubClient implements VCSClient {
  private accessToken?: string;
  private baseUrl: string;

  constructor(accessToken?: string, baseUrl?: string) {
    this.accessToken = accessToken;
    this.baseUrl = baseUrl || "https://api.github.com";
  }

  private async request(path: string): Promise<Response> {
    const headers: Record<string, string> = {
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "ADIP-Platform/1.0",
    };

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    // Phase 7: retry on 429 / 5xx with exponential backoff, honoring Retry-After.
    const response = await fetchWithRetry(`${this.baseUrl}${path}`, { headers });

    if (response.status === 403) {
      throw new Error("GitHub API rate limit exceeded");
    }
    
    if (response.status === 404) {
      throw new Error("Repository or resource not found");
    }
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }

    return response;
  }

  async getRepository(owner: string, repo: string): Promise<VCSRepository> {
    const response = await this.request(`/repos/${owner}/${repo}`);
    const data = await response.json();

    return {
      id: data.id.toString(),
      name: data.name,
      fullName: data.full_name,
      description: data.description,
      defaultBranch: data.default_branch || "main",
      webUrl: data.html_url,
      languages: data.languages,
    };
  }

  async getBranches(owner: string, repo: string): Promise<VCSBranch[]> {
    const response = await this.request(`/repos/${owner}/${repo}/branches`);
    const data = await response.json();

    // Get default branch info
    const repoInfo = await this.getRepository(owner, repo);

    return data.map((branch: any) => ({
      name: branch.name,
      sha: branch.commit.sha,
      isDefault: branch.name === repoInfo.defaultBranch,
    }));
  }

  async getFileTree(
    owner: string, 
    repo: string, 
    branch: string, 
    path: string = ""
  ): Promise<VCSFile[]> {
    const treePath = path ? `/${path}` : "";
    const response = await this.request(
      `/repos/${owner}/${repo}/contents${treePath}?ref=${branch}`
    );
    const data = await response.json();

    // Single file returned
    if (!Array.isArray(data)) {
      return [{
        path: data.path,
        type: data.type,
        size: data.size,
        sha: data.sha,
      }];
    }

    return data.map((item: any) => ({
      path: item.path,
      type: item.type,
      size: item.size,
      sha: item.sha,
    }));
  }

  async getFileContent(
    owner: string, 
    repo: string, 
    branch: string, 
    path: string
  ): Promise<string | null> {
    try {
      const response = await this.request(
        `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
      );
      const data = await response.json();

      if (data.type !== "file") {
        return null;
      }

      // Decode base64 content. The GitHub Contents API returns base64-encoded
      // bytes for files; if the payload is corrupted or unexpectedly typed,
      // Buffer.from can throw — surface that as a null result rather than
      // crashing the whole batch fetch.
      if (data.encoding === "base64" && typeof data.content === "string") {
        try {
          return Buffer.from(data.content, "base64").toString("utf-8");
        } catch (decodeErr) {
          console.warn(`github-client: failed to decode base64 for ${path}:`, decodeErr);
          return null;
        }
      }

      return typeof data.content === "string" ? data.content : null;
    } catch (error) {
      return null;
    }
  }

  async getMultipleFiles(
    owner: string,
    repo: string,
    branch: string,
    paths: string[]
  ): Promise<Map<string, string>> {
    const contents = new Map<string, string>();

    // Phase 7: cap concurrency at 5 to be friendlier to the GitHub rate
    // limit (especially the unauthenticated 60/hr bucket). Previously this
    // fired 10 in parallel and would exhaust the quota on a medium repo.
    await pLimit(5, paths, async (path) => {
      const content = await this.getFileContent(owner, repo, branch, path);
      if (content !== null) contents.set(path, content);
    });

    return contents;
  }

  async searchFiles(
    owner: string, 
    repo: string, 
    branch: string, 
    pattern: string
  ): Promise<VCSFile[]> {
    // GitHub code search API
    const query = encodeURIComponent(`${pattern} repo:${owner}/${repo}`);
    const response = await this.request(`/search/code?q=${query}`);
    const data = await response.json();

    return data.items?.map((item: any) => ({
      path: item.path,
      type: "file" as const,
      sha: item.sha,
    })) || [];
  }

  async getRecentCommits(
    owner: string, 
    repo: string, 
    branch: string, 
    limit: number = 50
  ): Promise<VCSCommit[]> {
    const response = await this.request(
      `/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${limit}`
    );
    const data = await response.json();

    return data.map((commit: any) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: {
        name: commit.commit.author.name,
        email: commit.commit.author.email,
        date: commit.commit.author.date,
      },
    }));
  }

  // Helper: Get full tree recursively.
  //
  // Phase 1.2: GitHub's `/git/trees/{sha}?recursive=1` returns at most
  // ~100,000 entries and sets `truncated: true` when it cuts off. The
  // previous implementation silently dropped everything past that
  // boundary. We now detect truncation and walk each top-level subtree
  // individually so heavy monorepos return their full file list.
  async getFullTree(owner: string, repo: string, branch: string): Promise<VCSFile[]> {
    const refResponse = await this.request(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    const refData = await refResponse.json();
    const treeSha = refData.object.sha;

    const treeResponse = await this.request(
      `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`
    );
    const treeData = await treeResponse.json();

    if (!treeData.truncated) {
      return (treeData.tree as Array<{ path: string; type: string; sha: string; size?: number }>)
        .filter((item) => item.type === "blob")
        .map((item) => ({ path: item.path, type: "file" as const, sha: item.sha, size: item.size }));
    }

    // Truncated — recurse subtree by subtree.
    const blobs: VCSFile[] = [];
    const queue: Array<{ sha: string; prefix: string }> = [{ sha: treeSha, prefix: "" }];
    const seen = new Set<string>();

    while (queue.length > 0) {
      const { sha, prefix } = queue.shift()!;
      if (seen.has(sha)) continue;
      seen.add(sha);

      const subResp = await this.request(`/repos/${owner}/${repo}/git/trees/${sha}`);
      const subData = await subResp.json();
      for (const item of subData.tree as Array<{ path: string; type: string; sha: string; size?: number }>) {
        const fullPath = prefix ? `${prefix}/${item.path}` : item.path;
        if (item.type === "blob") {
          blobs.push({ path: fullPath, type: "file", sha: item.sha, size: item.size });
        } else if (item.type === "tree") {
          queue.push({ sha: item.sha, prefix: fullPath });
        }
      }
    }
    return blobs;
  }
}
