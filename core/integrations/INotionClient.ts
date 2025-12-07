export interface NotionAuthOptions {
  token: string;                         // integration token
  baseUrl?: string;                      // default https://api.notion.com
  notionVersion?: string;                // e.g., "2022-06-28"
}

export interface NotionUser {
  id: string;
  name?: string;
  type?: string;
  person?: { email?: string };
  bot?: { owner?: { type: string; user?: NotionUser; workspace?: boolean } };
}

export interface NotionDatabase {
  id: string;
  title?: string;
  url?: string;
  properties?: Record<string, any>;
}

export interface NotionPage {
  id: string;
  url?: string;
  parent?: { type: 'page_id' | 'database_id' | 'workspace'; page_id?: string; database_id?: string };
  properties: Record<string, any>;
}

export interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: any; // specific block content shape
}

export interface NotionSearchParams {
  query?: string;
  filter?: { value: 'page' | 'database' | 'block'; property: 'object' };
  sort?: { direction: 'ascending' | 'descending'; timestamp: 'last_edited_time' };
  start_cursor?: string;
  page_size?: number;
}

export interface NotionSearchResult<T = NotionPage | NotionDatabase> {
  object: 'list';
  results: T[];
  next_cursor?: string;
  has_more: boolean;
}

export interface QueryDatabaseParams {
  filter?: Record<string, any>;
  sorts?: Array<{ property: string; direction: 'ascending' | 'descending' }>;
  start_cursor?: string;
  page_size?: number;
}

export interface AppendBlockChildrenParams {
  children: NotionBlock[];
}

export interface INotionClient {
  configure(opts: NotionAuthOptions): void;
  auth(opts: NotionAuthOptions): Promise<void>;

  // Identity
  me(): Promise<NotionUser>;

  // Search
  search(params: NotionSearchParams): Promise<NotionSearchResult>;

  // Databases
  listDatabases(p?: { start_cursor?: string; page_size?: number }): Promise<NotionSearchResult<NotionDatabase>>;
  getDatabase(databaseId: string): Promise<NotionDatabase>;
  queryDatabase(databaseId: string, params?: QueryDatabaseParams): Promise<NotionSearchResult<NotionPage>>;

  // Pages
  getPage(pageId: string): Promise<NotionPage>;
  createPage(params: { parent: NotionPage['parent']; properties: Record<string, any>; children?: NotionBlock[] }): Promise<NotionPage>;
  updatePageProperties(pageId: string, properties: Record<string, any>): Promise<NotionPage>;

  // Blocks
  listBlockChildren(blockId: string, p?: { start_cursor?: string; page_size?: number }): Promise<NotionSearchResult<NotionBlock>>;
  appendBlockChildren(blockId: string, params: AppendBlockChildrenParams): Promise<NotionSearchResult<NotionBlock>>;

  // Utilities
  buildPageUrl(pageId: string): string;
}
