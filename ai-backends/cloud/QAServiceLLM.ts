// ai-backends/cloud/QAServiceLLM.ts
// IQAService using an LLM over provided sources. Does simple fusion of sources into a prompt,
// asks the model for an answer with citations.

import { IQAService, SourceDoc, Question, Answer, AnswerStreamChunk } from '../../core/ai/IQAService';
import { CloudProviderRegistry } from './CloudProvider';

export type CloudQAConfig = {
  providerId: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
};

export class QAServiceLLM implements IQAService {
  constructor(private cfg: CloudQAConfig) {}

  async ask(question: string | Question, sources: SourceDoc[]): Promise<Answer> {
    const q = typeof question === 'string' ? { text: question } : question;
    const prompt = buildPrompt(q.text, sources, q.language);
    const text = await chat(this.cfg, prompt, this.cfg.maxTokens);
    // Heuristic: attempt to extract citations as [n], then map to sources
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
You are a helpful assistant. Use only the sources provided. Cite sources inline as [#n].
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
    `Can you show me only the action items related to "${q}"?`,
    'What are the deadlines and owners?',
    'Summarize risks and mitigations.',
  ];
}

async function chat(cfg: CloudQAConfig, prompt: string, maxTokens?: number): Promise<string> {
  const reg = CloudProviderRegistry.instance;
  const p = reg.get(cfg.providerId);
  if (!p) throw new Error(`provider not found: ${cfg.providerId}`);
  const key = reg.apiKey(p);
  if (!key) throw new Error(`missing API key for ${p.id}`);

  if (p.id === 'openai') {
    const endpoint = (p.endpoint || 'https://api.openai.com/v1/chat/completions');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'system', content: 'You answer with citations like [#n] from provided sources only.' }, { role: 'user', content: prompt }],
        temperature: cfg.temperature ?? 0.2,
        max_tokens: maxTokens ?? 700,
      }),
    });
    if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  throw new Error(`QAServiceLLM: provider ${p.id} not implemented`);
}
