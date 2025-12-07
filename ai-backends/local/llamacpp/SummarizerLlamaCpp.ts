// ai-backends/local/llamacpp/SummarizerLlamaCpp.ts
// Local summarizer using an OpenAI-compatible HTTP API (e.g., llama.cpp --api).
// Implements ISummarizer with configurable model/temperature/maxTokens.

import { ISummarizer, SummarizeOptions, SummarizeResult, ActionItem } from '../../../core/ai/ISummarizer';

export type LocalLlamaSummarizerConfig = {
  baseUrl: string;         // e.g., http://127.0.0.1:8080 or http://localhost:11434/v1 (if proxying)
  model: string;           // e.g., "llama-3.1-8b-instruct-q4_K_M"
  apiKey?: string;         // if your local gateway enforces a token
  temperature?: number;    // default 0.2
  maxTokens?: number;      // default 800
  systemPrompt?: string;   // override default system prompt
  requestHeaders?: Record<string, string>;
};

export class SummarizerLlamaCpp implements ISummarizer {
  constructor(private cfg: LocalLlamaSummarizerConfig) {}

  async summarize(text: string, opts?: SummarizeOptions): Promise<SummarizeResult> {
    const prompt = buildSummaryPrompt(text, opts);
    const out = await chat(this.cfg, prompt, opts?.maxTokens ?? this.cfg.maxTokens);
    const parsed = tryParseSections(out);
    return {
      summary: parsed.summary || out,
      bullets: parsed.bullets,
      keyPoints: parsed.keyPoints,
      actions: parsed.actions,
      decisions: parsed.decisions,
      risks: parsed.risks,
      outline: parsed.outline,
    };
  }

  async extractActions(text: string): Promise<ActionItem[]> {
    const prompt = `Extract action items from the text. Return a JSON array of objects {owner?, task, due?, priority?} with ISO dates when possible.\n\n===\n${text}`;
    const out = await chat(this.cfg, prompt, this.cfg.maxTokens);
    try { return JSON.parse(out); } catch { return []; }
  }

  async minutes(text: string, opts?: { sections?: Array<'attendees' | 'agenda' | 'notes' | 'actions' | 'decisions' | 'risks'>; language?: string }): Promise<Record<string, any>> {
    const want = (opts?.sections ?? ['attendees','agenda','notes','actions','decisions','risks']).join(', ');
    const lang = opts?.language ? ` in ${opts.language}` : '';
    const prompt = `Create structured minutes${lang} with sections: ${want}. Return compact JSON.\n\n===\n${text}`;
    const out = await chat(this.cfg, prompt, this.cfg.maxTokens);
    try { return JSON.parse(out); } catch { return { notes: out }; }
  }
}

function buildSummaryPrompt(text: string, opts?: SummarizeOptions): string {
  const style = opts?.style ?? 'abstractive';
  const length = opts?.length ?? 'medium';
  const audience = opts?.audience ?? 'general';
  const tone = opts?.tone ?? 'concise';
  const lang = opts?.language ? ` in ${opts.language}` : '';
  const extras = [
    opts?.includeQuotes ? 'Include salient quotes.' : '',
    opts?.includeOutline ? 'Provide a hierarchical outline.' : '',
  ].filter(Boolean).join(' ');
  const window = timeWindow(opts);
  return `Summarize the following meeting transcript${lang} for a ${audience} audience in a ${tone} tone.
Style: ${style}. Length: ${length}. ${window}
Return sections as JSON with keys: summary, bullets, keyPoints(with importance 0..1), actions(owner?,task,due?,priority?), decisions, risks, outline(if any). ${extras}

=== BEGIN TRANSCRIPT ===
${text}
=== END TRANSCRIPT ===`;
}

function timeWindow(opts?: SummarizeOptions): string {
  if (!opts?.sinceTs && !opts?.untilTs) return '';
  const from = opts.sinceTs ? new Date(opts.sinceTs).toISOString() : 'START';
  const to = opts.untilTs ? new Date(opts.untilTs).toISOString() : 'END';
  return `Focus only on content between ${from} and ${to}.`;
}

function tryParseSections(s: string) {
  try {
    const j = JSON.parse(s);
    return {
      summary: j.summary ?? j.Summary,
      bullets: j.bullets ?? j.Bullets,
      keyPoints: j.keyPoints ?? j.KeyPoints,
      actions: j.actions ?? j.Actions,
      decisions: j.decisions ?? j.Decisions,
      risks: j.risks ?? j.Risks,
      outline: j.outline ?? j.Outline,
    };
  } catch { return {}; }
}

async function chat(cfg: LocalLlamaSummarizerConfig, prompt: string, maxTokens?: number): Promise<string> {
  const system = cfg.systemPrompt ?? 'You are a helpful meetings assistant.';
  const endpoint = normalizeChatEndpoint(cfg.baseUrl);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    ...(cfg.requestHeaders ?? {}),
  };
  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature: cfg.temperature ?? 0.2,
    max_tokens: maxTokens ?? 800,
  };

  const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Local LLM error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  // OpenAI-compatible response
  const content =
    data.choices?.[0]?.message?.content ??
    data.choices?.[0]?.text ??
    data.message?.content ??
    '';
  return content;
}

function normalizeChatEndpoint(base: string) {
  // Accept base as either root (http://host:port) or already /v1.
  if (base.endsWith('/v1/chat/completions')) return base;
  if (base.endsWith('/v1')) return `${base}/chat/completions`;
  return `${base.replace(/\/+$/, '')}/v1/chat/completions`;
}
