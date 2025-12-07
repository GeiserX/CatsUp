export type ConfluenceAuthMode = 'oauth2' | 'apiToken' | 'basic';

export interface ConfluenceAuthOptions {
  mode: ConfluenceAuthMode;
  baseUrl: string;                    // e.g., https://your-domain.atlassian.net/wiki
  // oauth2
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;                 // epoch ms
  clientId?: string;
  clientSecret?: string;
  // api token (Atlassian cloud) or basic (server/DC)
  username?: string;
  apiTokenOrPassword?: string;
}

export interface PageBody {
  storage?: { value: string; representation: 'storage' }; // HTML-like storage format
  view?: { value: string; representation: 'view' };
  raw?: any; // for additional representations if expand used
}

export interface ConfluenceUser {
  accountId?: string;
  displayName?: string;
  email?: string;
  timeZone?: string;
}

export interface ConfluenceSpace {
  id?: string;
  key: string;
  name: string;
  type?: string;
  _links?: Record<string, string>;
}

export interface ConfluenceLabel {
  name: string;
  prefix?: 'global' | 'my' | 'team';
}

export interface ConfluencePage {
  id: string;
  title: string;
  spaceKey?: string;
  version?: { number: number; when?: string; by?: ConfluenceUser; message?: string };
  body?: PageBody;
  ancestors?: Array<{ id: string; title?: string }>;
  labels?: ConfluenceLabel[];
  url?: string;
}

export interface ConfluenceAttachment {
  id: string;
  title: string;
  mediaType?: string;
  fileSize?: number;
  downloadLink?: string;
}

export interface ConfluenceComment {
  id: string;
  creator?: ConfluenceUser;
  body?: PageBody;
  created?: string;
}

export interface Pagination {
  limit?: number;
  cursor?: string;     // for Atlassian cursor-based pagination
  start?: number;      // for offset pagination (server/DC)
}

export interface Paged<T> {
  results: T[];
  nextCursor?: string;
  start?: number;
  limit?: number;
  size?: number;
}

export interface CreatePageOptions {
  spaceKey: string;
  title: string;
  bodyHtml: string;          // storage format preferred
  parentId?: string;
  labels?: string[];
}

export interface UpdatePageOptions {
  pageId: string;
  title?: string;
  bodyHtml?: string;
  minorEdit?: boolean;
  versionComment?: string;
  labels?: string[];
}

export interface IConfluenceClient {
  configure(opts: { baseUrl: string; defaultExpand?: string[] }): void;

  auth(options: ConfluenceAuthOptions): Promise<void>;
  refreshAuth?(): Promise<void>;

  me(): Promise<ConfluenceUser>;

  // Spaces
  listSpaces(p: Pagination & { type?: string; query?: string }): Promise<Paged<ConfluenceSpace>>;
  getSpaceByKey(spaceKey: string): Promise<ConfluenceSpace | undefined>;

  // Search (CQL for cloud/server)
  searchCQL(cql: string, p?: Pagination & { expand?: string[] }): Promise<Paged<ConfluencePage>>;

  // Pages
  getPage(pageId: string, expand?: string[]): Promise<ConfluencePage | undefined>;
  getPageByTitle(spaceKey: string, title: string, expand?: string[]): Promise<ConfluencePage | undefined>;
  createPage(opts: CreatePageOptions): Promise<ConfluencePage>;
  updatePage(opts: UpdatePageOptions): Promise<ConfluencePage>;

  // Labels
  addLabels(pageId: string, labels: string[]): Promise<ConfluenceLabel[]>;
  removeLabel(pageId: string, label: string): Promise<void>;

  // Comments
  listComments(pageId: string, p?: Pagination): Promise<Paged<ConfluenceComment>>;
  addComment(pageId: string, bodyHtml: string): Promise<ConfluenceComment>;

  // Attachments
  listAttachments(pageId: string, p?: Pagination): Promise<Paged<ConfluenceAttachment>>;
  uploadAttachment(pageId: string, fileName: string, bytes: Uint8Array, mediaType?: string): Promise<ConfluenceAttachment>;

  // Utilities
  buildPageUrl(pageId: string): string;
}
