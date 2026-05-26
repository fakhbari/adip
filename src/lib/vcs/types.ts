// VCS Types for Repository Access

export type VCSConnectionType = "github" | "gitlab" | "bitbucket";

export interface VCSConnection {
  id: string;
  name: string;
  type: VCSConnectionType;
  url: string;
  accessToken?: string | null;
  username?: string | null;
}

export interface VCSFile {
  path: string;
  type: "file" | "directory" | "symlink";
  size?: number;
  sha?: string;
  content?: string;
  encoding?: "utf-8" | "base64";
}

export interface VCSRepository {
  id: string;
  name: string;
  fullName: string;
  description?: string;
  defaultBranch: string;
  webUrl: string;
  languages?: Record<string, number>;
}

export interface VCSCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
}

export interface VCSBranch {
  name: string;
  sha: string;
  isDefault: boolean;
}

// VCS Client Interface
export interface VCSClient {
  // Repository operations
  getRepository(owner: string, repo: string): Promise<VCSRepository>;
  getBranches(owner: string, repo: string): Promise<VCSBranch[]>;

  // File operations
  getFileTree(owner: string, repo: string, branch: string, path?: string): Promise<VCSFile[]>;
  getFileContent(owner: string, repo: string, branch: string, path: string): Promise<string | null>;
  getMultipleFiles(owner: string, repo: string, branch: string, paths: string[]): Promise<Map<string, string>>;

  // Search
  searchFiles(owner: string, repo: string, branch: string, pattern: string): Promise<VCSFile[]>;

  // Commits
  getRecentCommits(owner: string, repo: string, branch: string, limit?: number): Promise<VCSCommit[]>;

  // Phase 1.4 — incremental analysis: return the list of file paths
  // that changed between two commits. Optional on the interface so
  // legacy mocks compile; implementations should provide it.
  getDiff?(owner: string, repo: string, fromSha: string, toSha: string): Promise<string[]>;
}

// Configuration for file patterns to analyze
export const FILE_PATTERNS = {
  // Package/dependency files
  dependencyFiles: [
    /package\.json$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /pom\.xml$/,
    /build\.gradle$/,
    /build\.gradle\.kts$/,
    /Cargo\.toml$/,
    /go\.mod$/,
    /requirements\.txt$/,
    /Pipfile$/,
    /pyproject\.toml$/,
    /composer\.json$/,
    /Gemfile$/,
    /deps\.json$/,
    /mix\.exs$/,
  ],
  
  // Configuration files
  configFiles: [
    /tsconfig\.json$/,
    /jsconfig\.json$/,
    /\.eslintrc/,
    /\.prettierrc/,
    /tailwind\.config/,
    /vite\.config/,
    /webpack\.config/,
    /rollup\.config/,
    /next\.config/,
    /nuxt\.config/,
    /vue\.config/,
    /angular\.json$/,
    /docker-compose/,
    /Dockerfile/,
    /\.env\.example$/,
    /config\.(json|yaml|yml|toml)$/,
  ],
  
  // Source code files
  sourceFiles: [
    /\.ts$/,
    /\.tsx$/,
    /\.js$/,
    /\.jsx$/,
    /\.py$/,
    /\.java$/,
    /\.go$/,
    /\.rs$/,
    /\.rb$/,
    /\.php$/,
    /\.cs$/,
    /\.swift$/,
    /\.kt$/,
    /\.scala$/,
  ],
  
  // ADR files
  adrFiles: [
    /ADR[-_]?\d+/i,
    /docs\/adr\//i,
    /architecture\/decisions\//i,
    /decisions\/\d+/i,
  ],
  
  // API definition files
  apiFiles: [
    /openapi\.(json|yaml|yml)$/i,
    /swagger\.(json|yaml|yml)$/i,
    /asyncapi\.(json|yaml|yml)$/i,
    /api\.(json|yaml|yml)$/i,
    /api-spec\.(json|yaml|yml)$/i,
  ],
  
  // Documentation files
  docsFiles: [
    /README\.md$/i,
    /docs\/.*\.md$/i,
    /CHANGELOG\.md$/i,
    /CONTRIBUTING\.md$/i,
    /ARCHITECTURE\.md$/i,
  ],
};

// Default files to fetch for analysis
export const DEFAULT_ANALYSIS_PATHS = [
  // Root files
  "package.json",
  "pom.xml",
  "build.gradle",
  "go.mod",
  "Cargo.toml",
  "requirements.txt",
  "pyproject.toml",
  "composer.json",
  "Gemfile",
  "README.md",
  "ARCHITECTURE.md",
  
  // Common directories (first level)
  "src/",
  "lib/",
  "app/",
  "apps/",
  "packages/",
  "services/",
  "api/",
  "docs/",
  
  // Config files
  "tsconfig.json",
  "docker-compose.yml",
  "Dockerfile",
];
