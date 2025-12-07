// ai-backends/cloud/RAGServiceEmbeddings.ts
// IRAGService with in-memory vector index and cloud embeddings.

import { IRAGService, RAGDocument, ChunkingOptions, IndexOptions, RetrieveOptions, RetrievedDoc } from '../../ai/IRAGService';
import { CloudProviderRegistry } from './CloudProvider';
import { promises as fs } from 'node:fs';

type Vec = Float32Array;
type Chunk = { id: string; docId: string; text: string; vec: Vec; meta?: any; };

export class RAGServiceEmbeddings implements IRAGService {
  private initOpts?: IndexOptions;
  private chunks: Chunk[] = [];
  private backend?: string;
  private dims?: number;
  private lastUpdated?: number;

  async init(options?: IndexOptions): Promise<void> {
    this.initOpts = options;
    this.backend = options?.embedder ?? 'cloud';
  }

  async index(docs: RAGDocument[], chunking?: ChunkingOptions): Promise<void> {
    await this.upsert(docs, chunking);
  }

  async upsert(docs: RAGDocument[], chunking?: ChunkingOptions): Promise<void> {
    const pieces = await this.makeChunks(docs, chunking);
    const vecs = await this.embed(pieces.map(p => p.text));
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      const existingIdx = this.chunks.findIndex(c => c.id === p.id);
      const ch: Chunk = { id: p.id, docId: p.docId, text: p.text, vec: vecs[i], meta: p.meta };
      if (existingIdx >= 0) this.chunks[existingIdx] = ch;
      else this.chunks.push(ch);
    }
    this.lastUpdated = Date.now();
    this.dims = vecs[0]?.length;
  }

  async remove(docIds: string[]): Promise<void> {
    this.chunks = this.chunks.filter(c => !docIds.includes(c.docId));
  }

  async clear(): Promise<void> { this.chunks = []; }

  async retrieve(query: string, opts?: RetrieveOptions): Promise<RetrievedDoc[]> {
    const k = opts?.k ?? 8;
    const qv = await this.embed([query]).then(v => v[0]);
    const scored = this.chunks.map(c => ({ c, score: cosine(qv, c.vec) }))
      .filter(x => typeof opts?.minScore === 'number' ? x.score >= (opts!.minScore!) : true)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(({ c, score }) => ({
        id: c.id,
        title: c.meta?.title,
        snippet: c.text.slice(0, 300),
        score,
        url: c.meta?.url,
        meta: c.meta,
      }));
    return scored;
  }

  async save(path: string): Promise<void> {
    const json = JSON.stringify({
      backend: this.backend,
      dims: this.dims,
      lastUpdated: this.lastUpdated,
      chunks: this.chunks.map(c => ({ id: c.id, docId: c.docId, text: c.text, vec: Array.from(c.vec), meta: c.meta })),
    });
    await fs.writeFile(path, json);
  }

  async load(path: string): Promise<void> {
    const raw = await fs.readFile(path, 'utf-8');
    const data = JSON.parse(raw);
    this.backend = data.backend;
    this.dims = data.dims;
    this.lastUpdated = data.lastUpdated;
    this.chunks = data.chunks.map((c: any) => ({ id: c.id, docId: c.docId, text: c.text, vec: new Float32Array(c.vec), meta: c.meta }));
  }

  async stats(): Promise<{ docs: number; chunks: number; lastUpdated?: number; dims?: number; backend?: string; }> {
    const docs = new Set(this.chunks.map(c => c.docId)).size;
    return { docs, chunks: this.chunks.length, lastUpdated: this.lastUpdated, dims: this.dims, backend: this.backend };
  }

  // Helpers

  private async makeChunks(docs: RAGDocument[], chunking?: ChunkingOptions) {
    const out: Array<{ id: string; docId: string; text: string; meta?: any }> = [];
    const max = Math.max(200, chunking?.maxChars ?? 1200);
    const ov = Math.max(0, Math.min(max - 1, chunking?.overlapChars ?? 200));
    for (const d of docs) {
      const t = d.text || '';
      let i = 0, idx = 0;
      while (i < t.length) {
        const end = Math.min(t.length, i + max);
        const chunkText = t.slice(i, end);
        out.push({
          id: `${d.id}::${idx}`,
          docId: d.id,
          text: chunkText,
          meta: { title: d.title, url: d.url, ...d.meta },
        });
        idx++;
        i = end - ov;
        if (i <= 0) i = end;
      }
    }
    return out;
  }

  private async embed(texts: string[]): Promise<Vec[]> {
    const reg = CloudProviderRegistry.instance;
    // Prefer explicit provider id if present in initOpts.extras or fall back to openai
    const providerId = (this.initOpts?.extras as any)?.providerId || 'openai';
    const p = reg.get(providerId);
    if (!p) throw new Error(`embed provider not found: ${providerId}`);
    const key = reg.apiKey(p);
    if (!key) throw new Error(`missing API key for ${p.id}`);

    if (p.id === 'openai') {
      const endpoint = (p.endpoint || 'https://api.openai.com/v1/embeddings');
      const model = this.initOpts?.dimensions ? p.models.embeddings?.[0] : (p.models.embeddings?.[0] || 'text-embedding-3-small');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, input: texts }),
      });
      if (!res.ok) throw new Error(`Embeddings error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.data.map((d: any) => new Float32Array(d.embedding));
    }

    throw new Error(`RAGServiceEmbeddings: provider ${p.id} not implemented`);
  }
}

function cosine(a: Vec, b: Vec): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const x = a[i], y = b[i]; dot += x * y; na += x * x; nb += y * y; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}
