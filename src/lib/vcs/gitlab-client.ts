// GitLab VCS Client

import { VCSClient, VCSFile, VCSRepository, VCSBranch, VCSCommit } from "./types";

export class GitLabClient implements VCSClient {
  private accessToken?: string;
  private baseUrl: string;

  constructor(accessToken?: string, baseUrl?: string) {
    this.accessToken = accessToken;
    this.baseUrl = baseUrl || "https://gitlab.com/api/v4";
  }

  private encodeProjectPath(owner: string, repo: string): string {
    return encodeURIComponent(`${owner}/${repo}`);
  }

  private async request(path: string): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.accessToken) {
      headers["Private-Token"] = this.accessToken;
    }

    const response = await fetch(`${this.baseUrl}${path}`, { headers });

    if (response.status === 403) {
      throw new Error("GitLab API rate limit or access denied");
    }

    if (response.status === 404) {
      throw new Error("Repository or resource not found");
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitLab API error: ${response.status} - ${error}`);
    }

    return response;
  }

  async getRepository(owner: string, repo: string): Promise<VCSRepository> {
    const projectPath = this.encodeProjectPath(owner, repo);
    const response = await this.request(`/projects/${projectPath}`);
    const data = await response.json();

    return {
      id: data.id.toString(),
      name: data.name,
      fullName: data.path_with_namespace,
      description: data.description,
      defaultBranch: data.default_branch || "main",
      webUrl: data.web_url,
      languages: data.languages,
    };
  }

  async getBranches(owner: string, repo: string): Promise<VCSBranch[]> {
    const projectPath = this.encodeProjectPath(owner, repo);
    const response = await this.request(`/projects/${projectPath}/repository/branches`);
    const data = await response.json();

    return data.map((branch: any) => ({
      name: branch.name,
      sha: branch.commit.id,
      isDefault: branch.default,
    }));
  }

  async getFileTree(
    owner: string,
    repo: string,
    branch: string,
    path: string = ""
  ): Promise<VCSFile[]> {
    const projectPath = this.encodeProjectPath(owner, repo);
    const pathQuery = path ? `&path=${encodeURIComponent(path)}` : "";
    const response = await this.request(
      `/projects/${projectPath}/repository/tree?ref=${branch}${pathQuery}`
    );
    const data = await response.json();

    return data.map((item: any) => ({
      path: item.path,
      type: item.type === "tree" ? "directory" : "file",
      sha: item.id,
    }));
  }

  async getFileContent(
    owner: string,
    repo: string,
    branch: string,
    path: string
  ): Promise<string | null> {
    try {
      const projectPath = this.encodeProjectPath(owner, repo);
      const response = await this.request(
        `/projects/${projectPath}/repository/files/${encodeURIComponent(path)}?ref=${branch}`
      );
      const data = await response.json();

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
    const projectPath = this.encodeProjectPath(owner, repo);
    const response = await this.request(
      `/projects/${projectPath}/search?scope=blobs&search=${encodeURIComponent(pattern)}&ref=${branch}`
    );
    const data = await response.json();

    return data.map((item: any) => ({
      path: item.path,
      type: "file" as const,
      sha: item.id,
    }));
  }

  async getRecentCommits(
    owner: string,
    repo: string,
    branch: string,
    limit: number = 50
  ): Promise<VCSCommit[]> {
    const projectPath = this.encodeProjectPath(owner, repo);
    const response = await this.request(
      `/projects/${projectPath}/repository/commits?ref_name=${branch}&per_page=${limit}`
    );
    const data = await response.json();

    return data.map((commit: any) => ({
      sha: commit.id,
      message: commit.message,
      author: {
        name: commit.author_name,
        email: commit.author_email,
        date: commit.authored_date,
      },
    }));
  }

  // Helper: Get full tree recursively
  async getFullTree(owner: string, repo: string, branch: string): Promise<VCSFile[]> {
    const projectPath = this.encodeProjectPath(owner, repo);
    const response = await this.request(
      `/projects/${projectPath}/repository/tree?ref=${branch}&recursive=true&per_page=1000`
    );
    const data = await response.json();

    return data
      .filter((item: any) => item.type === "blob")
      .map((item: any) => ({
        path: item.path,
        type: "file" as const,
        sha: item.id,
      }));
  }
}
