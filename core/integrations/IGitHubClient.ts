export interface GitHubAuthOptions {
  baseUrl?: string;            // default https://api.github.com
  token: string;               // PAT or installation token
  userAgent?: string;
  previews?: string[];         // accept preview headers if needed
}

export interface GHRateLimit {
  limit: number;
  remaining: number;
  resetAt: number;             // epoch seconds
}

export interface GHPagination {
  perPage?: number;            // default 30
  page?: number;               // 1-based
}

export interface GHSearchPagination extends GHPagination {
  order?: 'asc' | 'desc';
  sort?:
    | 'best-match'
    | 'stars'
    | 'forks'
    | 'help-wanted-issues'
    | 'updated'
    | string;
}

export interface GHUser {
  login: string;
  id: number;
  name?: string;
  email?: string;
  avatarUrl?: string;
  htmlUrl?: string;
}

export interface GHRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  owner: GHUser;
  htmlUrl?: string;
  defaultBranch?: string;
  description?: string;
  topics?: string[];
  archived?: boolean;
}

export interface GHIssue {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  body?: string;
  user: GHUser;
  assignees?: GHUser[];
  labels?: Array<{ name: string; color?: string }>;
  htmlUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;
}

export interface GHPullRequest extends GHIssue {
  draft?: boolean;
  merged?: boolean;
  mergeable?: boolean | null;
  base?: { ref: string; sha: string };
  head?: { ref: string; sha: string };
}

export interface GHCodeSearchResult {
  totalCount: number;
  items: Array<{
    name: string;
    path: string;
    sha: string;
    htmlUrl: string;
    repository: GHRepo;
    score?: number;
    textMatches?: Array<{ fragment: string; matches: Array<{ text: string; indices: [number, number] }> }>;
  }>;
}

export interface GHFileContent {
  path: string;
  sha: string;
  size: number;
  encoding: 'base64' | 'utf-8' | string;
  content: string; // raw or base64-encoded depending on encoding
  htmlUrl?: string;
}

export interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{ message: string; path?: (string | number)[]; type?: string }>;
  rateLimit?: GHRateLimit;
}

export interface IGitHubClient {
  configure(opts: GitHubAuthOptions): void;
  auth(opts: GitHubAuthOptions): Promise<void>;

  me(): Promise<GHUser>;

  // Repos
  listUserRepos(user: string, p?: GHPagination): Promise<GHRepo[]>;
  listOrgRepos(org: string, p?: GHPagination): Promise<GHRepo[]>;
  getRepo(owner: string, repo: string): Promise<GHRepo>;

  // Issues / PRs
  listIssues(owner: string, repo: string, p?: GHPagination & { state?: 'open' | 'closed' | 'all' }): Promise<GHIssue[]>;
  listPulls(owner: string, repo: string, p?: GHPagination & { state?: 'open' | 'closed' | 'all' }): Promise<GHPullRequest[]>;
  getIssue(owner: string, repo: string, number: number): Promise<GHIssue>;
  getPull(owner: string, repo: string, number: number): Promise<GHPullRequest>;
  createIssue(owner: string, repo: string, title: string, body?: string, labels?: string[], assignees?: string[]): Promise<GHIssue>;
  commentOnIssue(owner: string, repo: string, number: number, body: string): Promise<{ id: number; body: string }>;

  // Search
  searchIssuesAndPRs(q: string, p?: GHSearchPagination): Promise<{ totalCount: number; items: Array<GHIssue | GHPullRequest> }>;
  codeSearch(q: string, p?: GHSearchPagination): Promise<GHCodeSearchResult>;

  // Contents
  getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<GHFileContent>;

  // GraphQL
  graphql<T = any>(query: string, variables?: Record<string, any>): Promise<GraphQLResponse<T>>;

  // Rate limit info
  rateLimit(): Promise<GHRateLimit>;
}
