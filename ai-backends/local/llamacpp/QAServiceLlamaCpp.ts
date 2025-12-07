// ai-backends/local/llamacpp/QAServiceLlamaCpp.ts
// Local IQAService backed by a local OpenAI-compatible chat API (e.g., llama.cpp --api).
// Uses simple prompt-fusion of provided sources and returns inline-style citations [#n].

import { IQAService, SourceDoc, Question, Answer, AnswerStreamChunk } from '../../../core/ai/IQAService';

export type LocalLlamaQAConfig = {
  baseUrl: string;    // e.g., http://127.0.0.1:8080 or /v1
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  requestHeaders?: Record<string, string>;
};

export class QAServiceLlamaCpp implements IQAService {
  constructor(private cfg: LocalLlamaQAConfig) {}

  async ask(question: string | Question, sources: SourceDoc[]): Promise<Answer> {
    const q = typeof question === 'string' ? { text: question } : question;
    const prompt = buildPrompt(q.text, sources, q.language);
    const text = await chat(this.cfg, prompt, this.cfg.maxTokens);
    const citations = extractCitations(text, sources);
    return {
      text,
      confidence: 0.7,
      citations,
      followUps: suggestFollowUps(q.text),
      usedDocs: citations.map(c => c.docId),
    };
  }

  async *askStreaming(question: string | Question, sources: SourceDoc[]): AsyncIterable<AnswerStreamChunk> {
    const ans = await this.ask(question, sources);
    yield { delta: ans.text, final: true, citations: ans.citations };
  }
}

function buildPrompt(q: string, sources: SourceDoc[], lang?: string) {
  const pre = lang ? `Answer in ${lang}.` : '';
  const compiled = sources.map((s, i) => `[#${i + 1} | ${s.title ?? s.id}]\n${s.text}`).join('\n\n');
  return `${pre}
You are a helpful assistant. Use only the sources provided. Cite sources inline as [#n] where n matches the listed sources.
Question: ${q}

Sources:
${compiled}

Answer:`;
}

function extractCitations(answer: string, sources: SourceDoc[]) {
  const m = answer.match(/\[#(\d+)\]/g) || [];
  const used = new Set<number>();
  for (const tag of m) {
    const n = Number(tag.replace(/\D/g, ''));
    if (!isNaN(n)) used.add(n - 1);
  }
  return Array.from(used).map((i) => ({
    docId: sources[i]?.id ?? String(i),
    snippet: sources[i]?.text?.slice(0, 200) ?? '',
    score: 1.0 - i * 0.01,
    url: sources[i]?.url,
  }));
}

function suggestFollowUps(q: string): string[] {
  return [
    `Show only action items related to "${q}".`,
    'List deadlines and owners.',
    'Summarize risks and mitigations.',
  ];
}

async function chat(cfg: LocalLlamaQAConfig, prompt: string, maxTokens?: number): Promise<string> {
  const endpoint = normalizeChatEndpoint(cfg.baseUrl);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    ...(cfg.requestHeaders ?? {}),
  };
  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: 'You answer using only the provided sources and include citations like [#n].' },
      { role: 'user', content: prompt },
    ],
    temperature: cfg.temperature ?? 0.2,
    max_tokens: maxTokens ?? 700,
  };
  const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Local LLM error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? '';
}

function normalizeChatEndpoint(base: string) {
  if (base.endsWith('/v1/chat/completions')) return base;
  if (base.endsWith('/v1')) return `${base}/chat/completions`;
  return `${base.replace(/\/+$/, '')}/v1/chat/completions`;
}