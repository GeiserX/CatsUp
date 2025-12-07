// ai-backends/local/llamacpp/EmbeddingsLlamaCpp.ts
// Helper for calling a local OpenAI-compatible embeddings endpoint.

export type LocalLlamaEmbeddingsConfig = {
  baseUrl: string;        // e.g., http://127.0.0.1:8080 or /v1
  model: string;          // embedding-capable local model, e.g., "nomic-embed-text"
  apiKey?: string;
  requestHeaders?: Record<string, string>;
};

export async function embedWithLocalLlama(
  cfg: LocalLlamaEmbeddingsConfig,
  input: string[]
): Promise<Float32Array[]> {
  const endpoint = normalizeEmbeddingsEndpoint(cfg.baseUrl);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    ...(cfg.requestHeaders ?? {}),
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: cfg.model, input }),
  });
  if (!res.ok) throw new Error(`Local embeddings error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.data as any[]).map(d => new Float32Array(d.embedding));
}

function normalizeEmbeddingsEndpoint(base: string) {
  if (base.endsWith('/v1/embeddings')) return base;
  if (base.endsWith('/v1')) return `${base}/embeddings`;
  return `${base.replace(/\/+$/, '')}/v1/embeddings`;
}
