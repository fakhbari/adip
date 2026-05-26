// Bitbucket VCS Client

import { VCSClient, VCSFile, VCSRepository, VCSBranch, VCSCommit } from "./types";
import { fetchWithRetry } from "./fetch-with-retry";

export class BitbucketClient implements VCSClient {
  private accessToken?: string;
  private username?: string;
  private baseUrl: string;

  constructor(accessToken?: string, username?: string, baseUrl?: string) {
    this.accessToken = accessToken;
    this.username = username;
    this.baseUrl = baseUrl || "https://api.bitbucket.org/2.0";
  }

  private async request(path: string): Promise<Response> {
    const headers: Record<string, string> = {
      "Accept": "application/json",
    };

    // Bitbucket uses Basic Auth with username:app_password or Bearer token
    if (this.accessToken && this.username) {
      const credentials = Buffer.from(`${this.username}:${this.accessToken}`).toString("base64");
      headers["Authorization"] = `Basic ${credentials}`;
    } else if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    // Phase 1.2: retry on 429 / 5xx + backoff. Was raw `fetch`.
    const response = await fetchWithRetry(`${this.baseUrl}${path}`, { headers });

    if (response.status === 403) {
      throw new Error("Bitbucket API rate limit or access denied");
    }

    if (response.status === 404) {
      throw new Error("Repository or resource not found");
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Bitbucket API error: ${response.status} - ${error}`);
    }

    return response;
  }

  async getRepository(owner: string, repo: string): Promise<VCSRepository> {
    const response = await this.request(`/repositories/${owner}/${repo}`);
    const data = await response.json();

    return {
      id: data.uuid,
      name: data.name,
      fullName: data.full_name,
      description: data.description,
      defaultBranch: data.mainbranch?.name || "main",
      webUrl: data.links?.html?.href,
      languages: {},
    };
  }

  async getBranches(owner: string, repo: string): Promise<VCSBranch[]> {
    const response = await this.request(`/repositories/${owner}/${repo}/refs/branches`);
    const data = await response.json();

    // Get default branch
    const repoInfo = await this.getRepository(owner, repo);

    return data.values?.map((branch: any) => ({
      name: branch.name,
      sha: branch.target?.hash,
      isDefault: branch.name === repoInfo.defaultBranch,
    })) || [];
  }

  async getFileTree(
    owner: string,
    repo: string,
    branch: string,
    path: string = ""
  ): Promise<VCSFile[]> {
    const pathQuery = path ? `/${path}` : "";
    const response = await this.request(
      `/repositories/${owner}/${repo}/src/${branch}${pathQuery}`
    );
    const data = await response.json();

    return data.values?.map((item: any) => ({
      path: item.path,
      type: item.type === "commit_file" ? "file" : "directory",
      sha: item.commit?.hash,
      size: item.size,
    })) || [];
  }

  async getFileContent(
    owner: string,
    repo: string,
    branch: string,
    path: string
  ): Promise<string | null> {
    try {
      const response = await this.request(
        `/repositories/${owner}/${repo}/src/${branch}/${path}`
      );
      
      // Check if it's a file
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const data = await response.json();
        if (data.type === "commit_directory") {
          return null;
        }
      }

      return await response.text();
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
    // Bitbucket doesn't have a great search API, so we'll search in filenames
    const tree = await this.getFullTree(owner, repo, branch);
    const regex = new RegExp(pattern, "i");
    
    return tree.filter(file => regex.test(file.path));
  }

  /** Phase 1.4 — list paths that changed between two commits. */
  async getDiff(owner: string, repo: string, fromSha: string, toSha: string): Promise<string[]> {
    // Bitbucket's diffstat endpoint returns one entry per changed file.
    // Paginates via `next` URL.
    const paths = new Set<string>();
    let next: string | null = `/repositories/${owner}/${repo}/diffstat/${toSha}..${fromSha}`;
    let guard = 0;
    while (next && guard++ < 200) {
      const response = await this.request(next);
      const data = await response.json();
      for (const v of data.values ?? []) {
        if (v.new?.path) paths.add(v.new.path);
        else if (v.old?.path) paths.add(v.old.path);
      }
      next = data.next ?? null;
      if (next && next.startsWith(this.baseUrl)) {
        next = next.slice(this.baseUrl.length);
      }
    }
    return [...paths];
  }

  async getRecentCommits(
    owner: string,
    repo: string,
    branch: string,
    limit: number = 50
  ): Promise<VCSCommit[]> {
    const response = await this.request(
      `/repositories/${owner}/${repo}/commits/${branch}?limit=${limit}`
    );
    const data = await response.json();

    return data.values?.map((commit: any) => ({
      sha: commit.hash,
      message: commit.message,
      author: {
        name: commit.author?.user?.display_name || commit.author?.raw,
        email: commit.author?.raw?.match(/<(.+?)>/)?.[1] || "",
        date: commit.date,
      },
    })) || [];
  }

  // Helper: Get full tree
  async getFullTree(owner: string, repo: string, branch: string): Promise<VCSFile[]> {
    const files: VCSFile[] = [];
    let url: string | null = `/repositories/${owner}/${repo}/src/${branch}?max_depth=1000`;

    while (url) {
      const response = await this.request(url);
      const data = await response.json();

      for (const item of data.values || []) {
        if (item.type === "commit_file") {
          files.push({
            path: item.path,
            type: "file",
            sha: item.commit?.hash,
            size: item.size,
          });
        }
      }

      // Pagination
      url = data.next || null;
      if (url) {
        // Extract path from full URL
        url = url.replace(this.baseUrl, "");
      }
    }

    return files;
  }
}
