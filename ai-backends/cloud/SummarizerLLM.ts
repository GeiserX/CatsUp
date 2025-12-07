// ai-backends/cloud/SummarizerLLM.ts
// ISummarizer using a chat-completions style LLM provider.

import { ISummarizer, SummarizeOptions, SummarizeResult, ActionItem } from '../../core/ai/ISummarizer';
import { CloudProviderRegistry } from './CloudProvider';

export type CloudSummarizerConfig = {
  providerId: string; // e.g., "openai" | "azure-openai" | "anthropic" | "google"
  model: string;      // e.g., "gpt-4o-mini" or equivalent
  maxTokens?: number;
  temperature?: number;
};

export class SummarizerLLM implements ISummarizer {
  constructor(private cfg: CloudSummarizerConfig) {}

  async summarize(text: string, opts?: SummarizeOptions): Promise<SummarizeResult> {
    const content = buildPrompt(text, opts);
    const out = await chat(this.cfg, content, opts?.maxTokens ?? this.cfg.maxTokens);
    const parsed = parseSections(out);
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
    const out = await chat(this.cfg, `Extract action items from the text. Output JSON array of {owner?, task, due?, priority?}.\n\n===\n${text}`);
    try { return JSON.parse(out); } catch { return []; }
  }

  async minutes(text: string, opts?: { sections?: Array<'attendees' | 'agenda' | 'notes' | 'actions' | 'decisions' | 'risks'>; language?: string }): Promise<Record<string, any>> {
    const want = (opts?.sections ?? ['attendees','agenda','notes','actions','decisions','risks']).join(', ');
    const out = await chat(this.cfg, `Create structured minutes with sections: ${want}. Return JSON.\n\n===\n${text}`);
    try { return JSON.parse(out); } catch { return { notes: out }; }
  }
}

function buildPrompt(text: string, opts?: SummarizeOptions): string {
  const style = opts?.style ?? 'abstractive';
  const length = opts?.length ?? 'medium';
  const audience = opts?.audience ?? 'general';
  const tone = opts?.tone ?? 'concise';
  const lang = opts?.language ? ` in ${opts.language}` : '';
  const extras = [
    opts?.includeQuotes ? 'Include salient quotes.' : '',
    opts?.includeOutline ? 'Provide a hierarchical outline.' : '',
  ].filter(Boolean).join(' ');
  return `Summarize the following meeting transcript${lang} for a ${audience} audience in a ${tone} tone. Style: ${style}. Length: ${length}.
Return sections: Summary, Bullets, KeyPoints(with importance 0..1), Actions(owner?,task,due?,priority?), Decisions, Risks, Outline(if any). ${extras}

=== BEGIN TRANSCRIPT ===
${text}
=== END TRANSCRIPT ===`;
}

function parseSections(out: string) {
  // Try to parse JSON if present; otherwise fall back to heuristics
  try {
    const j = JSON.parse(out);
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

async function chat(cfg: CloudSummarizerConfig, prompt: string, maxTokens?: number): Promise<string> {
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
        messages: [{ role: 'system', content: 'You are a helpful meetings assistant.' }, { role: 'user', content: prompt }],
        temperature: cfg.temperature ?? 0.2,
        max_tokens: maxTokens ?? 800,
      }),
    });
    if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  // Extend here for azure-openai, anthropic, google, etc.
  throw new Error(`SummarizerLLM: provider ${p.id} not implemented`);
}
