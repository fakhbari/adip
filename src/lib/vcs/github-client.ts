// GitHub VCS Client

import { VCSClient, VCSFile, VCSRepository, VCSBranch, VCSCommit } from "./types";

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

    const response = await fetch(`${this.baseUrl}${path}`, { headers });
    
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

      // Decode base64 content
      if (data.encoding === "base64" && data.content) {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }

      return data.content;
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
    
    // Fetch files in parallel (with concurrency limit)
    const batchSize = 10;
    for (let i = 0; i < paths.length; i += batchSize) {
      const batch = paths.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (path) => {
          const content = await this.getFileContent(owner, repo, branch, path);
          return { path, content };
        })
      );

      for (const { path, content } of results) {
        if (content !== null) {
          contents.set(path, content);
        }
      }
    }

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

  // Helper: Get full tree recursively
  async getFullTree(owner: string, repo: string, branch: string): Promise<VCSFile[]> {
    // First get the tree SHA for the branch
    const refResponse = await this.request(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    const refData = await refResponse.json();
    const treeSha = refData.object.sha;

    // Get the full tree
    const treeResponse = await this.request(
      `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`
    );
    const treeData = await treeResponse.json();

    return treeData.tree
      .filter((item: any) => item.type === "blob")
      .map((item: any) => ({
        path: item.path,
        type: "file" as const,
        sha: item.sha,
        size: item.size,
      }));
  }
}
