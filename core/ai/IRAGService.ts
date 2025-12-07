// ai/IRAGService.ts

export interface RAGDocument {
  id: string;
  title?: string;
  text: string;
  url?: string;
  meta?: Record<string, any>;
  updatedAt?: number;         // epoch ms
}

export interface ChunkingOptions {
  // Simple sliding window chunking hints; implementations may ignore.
  maxChars?: number;          // e.g., 1200
  overlapChars?: number;      // e.g., 200
}

export interface IndexOptions {
  embedder?: 'local' | 'cloud' | string;
  normalize?: boolean;        // L2 normalize vectors
  storeRawText?: boolean;     // keep text alongside vectors
  dimensions?: number;        // vector size (if manual)
  useBM25?: boolean;          // enable hybrid search
}

export interface RetrieveOptions {
  k?: number;                 // top-k to return
  minScore?: number;          // score threshold
  queryExpansion?: boolean;   // enable expansions/synonyms
  hybrid?: boolean;           // combine dense + sparse
  weights?: { dense?: number; sparse?: number }; // for hybrid
  diversity?: { mmr?: boolean; lambda?: number }; // MMR diversification
  filter?: Record<string, any>; // metadata filtering
}

export interface RetrievedDoc {
  id: string;
  title?: string;
  snippet: string;
  score: number;
  url?: string;
  meta?: Record<string, any>;
}

export interface IRAGService {
  /**
   * Initialize/rehydrate the index with options.
   */
  init(options?: IndexOptions): Promise<void>;

  /**
   * Index documents (with optional internal chunking).
   */
  index(docs: RAGDocument[], chunking?: ChunkingOptions): Promise<void>;

  /**
   * Upsert: insert or update existing docs by id.
   */
  upsert(docs: RAGDocument[], chunking?: ChunkingOptions): Promise<void>;

  /**
   * Remove documents by id.
   */
  remove(docIds: string[]): Promise<void>;

  /**
   * Clear the entire index.
   */
  clear(): Promise<void>;

  /**
   * Retrieve top-k relevant snippets for a query.
   */
  retrieve(query: string, opts?: RetrieveOptions): Promise<RetrievedDoc[]>;

  /**
   * Persist and load index state.
   */
  save(path: string): Promise<void>;
  load(path: string): Promise<void>;

  /**
   * Introspection.
   */
  stats(): Promise<{ docs: number; chunks: number; lastUpdated?: number; dims?: number; backend?: string }>;
}
