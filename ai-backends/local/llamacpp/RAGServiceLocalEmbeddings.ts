// ai-backends/local/llamacpp/RAGServiceLocalEmbeddings.ts
// Local IRAGService using a local embeddings endpoint (OpenAI-compatible) and an in-memory vector index.

import { IRAGService, RAGDocument, ChunkingOptions, IndexOptions, RetrieveOptions, RetrievedDoc } from '../../../core/ai/IRAGService';
import { embedWithLocalLlama, LocalLlamaEmbeddingsConfig } from './EmbeddingsLlamaCpp';
import { promises as fs } from 'node:fs';

type Vec = Float32Array;
type Chunk = { id: string; docId: string; text: string; vec: Vec; meta?: any; };

export type LocalRAGConfig = LocalLlamaEmbeddingsConfig & {
  normalize?: boolean;
};

export class RAGServiceLocalEmbeddings implements IRAGService {
  private cfg: LocalRAGConfig;
  private chunks: Chunk[] = [];
  private lastUpdated?: number;
  private dims?: number;

  constructor(cfg: LocalRAGConfig) { this.cfg = cfg; }

  async init(_options?: IndexOptions): Promise<void> {}

  async index(docs: RAGDocument[], chunking?: ChunkingOptions): Promise<void> {
    await this.upsert(docs, chunking);
  }

  async upsert(docs: RAGDocument[], chunking?: ChunkingOptions): Promise<void> {
    const pieces = await this.makeChunks(docs, chunking);
    const vecs = await embedWithLocalLlama(this.cfg, pieces.map(p => p.text));
    vecs.forEach(v => { if (this.cfg.normalize) l2normalizeInPlace(v); });
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      const ch: Chunk = { id: p.id, docId: p.docId, text: p.text, vec: vecs[i], meta: p.meta };
      const idx = this.chunks.findIndex(c => c.id === p.id);
      if (idx >= 0) this.chunks[idx] = ch; else this.chunks.push(ch);
    }
    this.lastUpdated = Date.now();
    this.dims = vecs[0]?.length;
  }

  async remove(docIds: string[]): Promise<void> {
    this.chunks = this.chunks.filter(c => !docIds.includes(c.docId));
  }

  async clear(): Promise<void> { this.chunks = []; }

  async retrieve(query: string, opts?: RetrieveOptions): Promise<RetrievedDoc[]> {
    const qv = (await embedWithLocalLlama(this.cfg, [query]))[0];
    if (this.cfg.normalize) l2normalizeInPlace(qv);
    const k = opts?.k ?? 8;
    const results = this.chunks
      .map(c => ({ c, score: cosine(qv, c.vec) }))
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
    return results;
  }

  async save(path: string): Promise<void> {
    const data = {
      lastUpdated: this.lastUpdated,
      dims: this.dims,
      chunks: this.chunks.map(c => ({ id: c.id, docId: c.docId, text: c.text, vec: Array.from(c.vec), meta: c.meta })),
    };
    await fs.writeFile(path, JSON.stringify(data));
  }

  async load(path: string): Promise<void> {
    const raw = await fs.readFile(path, 'utf-8');
    const data = JSON.parse(raw);
    this.lastUpdated = data.lastUpdated;
    this.dims = data.dims;
    this.chunks = data.chunks.map((c: any) => ({ id: c.id, docId: c.docId, text: c.text, vec: new Float32Array(c.vec), meta: c.meta }));
  }

  async stats(): Promise<{ docs: number; chunks: number; lastUpdated?: number; dims?: number; backend?: string }> {
    const docs = new Set(this.chunks.map(c => c.docId)).size;
    return { docs, chunks: this.chunks.length, lastUpdated: this.lastUpdated, dims: this.dims, backend: 'local-llama' };
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
        out.push({ id: `${d.id}::${idx}`, docId: d.id, text: chunkText, meta: { title: d.title, url: d.url, ...d.meta } });
        idx++;
        i = end - ov;
        if (i <= 0) i = end;
      }
    }
    return out;
  }
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const x = a[i], y = b[i]; dot += x * y; na += x * x; nb += y * y; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

function l2normalizeInPlace(v: Float32Array) {
  let n2 = 0;
  for (let i = 0; i < v.length; i++) n2 += v[i] * v[i];
  const n = Math.sqrt(n2) + 1e-9;
  for (let i = 0; i < v.length; i++) v[i] /= n;
}
