export type SummaryStyle = 'extractive' | 'abstractive';
export type SummaryLength = 'short' | 'medium' | 'long';

export interface SummarizeOptions {
  style?: SummaryStyle;
  length?: SummaryLength;          // hint: short ≈ 3–5 bullets, medium ≈ 8–12, long ≈ paragraph(s)
  maxTokens?: number;              // for abstractive backends
  audience?: 'exec' | 'tech' | 'general';
  tone?: 'neutral' | 'concise' | 'formal' | 'friendly';
  sinceTs?: number;                // epoch ms filter window start
  untilTs?: number;                // epoch ms filter window end
  language?: string;               // output language, default same as input
  includeQuotes?: boolean;         // embed salient quotes/snippets
  includeOutline?: boolean;        // return hierarchical outline
}

export interface KeyPoint {
  text: string;
  evidence?: string;               // optional source snippet
  importance?: number;             // 0..1
}

export interface ActionItem {
  owner?: string;
  task: string;
  due?: string;                    // ISO date/time if parsed
  priority?: 'low' | 'medium' | 'high';
  references?: string[];           // optional doc ids/links
}

export interface RiskItem {
  description: string;
  severity?: 'low' | 'medium' | 'high';
  mitigation?: string;
}

export interface SummaryOutlineNode {
  title: string;
  bullets?: string[];
  children?: SummaryOutlineNode[];
}

export interface SummarizeResult {
  summary: string;                 // primary human-readable summary
  bullets?: string[];              // alternative bullet list form
  keyPoints?: KeyPoint[];
  actions?: ActionItem[];
  decisions?: string[];
  risks?: RiskItem[];
  outline?: SummaryOutlineNode;    // when includeOutline = true
  tokensUsed?: number;             // if applicable
}

export interface ISummarizer {
  /**
   * Produce a meeting/document summary.
   */
  summarize(text: string, opts?: SummarizeOptions): Promise<SummarizeResult>;

  /**
   * Extract action items decisively (can be used standalone or post-hoc).
   */
  extractActions(text: string): Promise<ActionItem[]>;

  /**
   * Optionally generate structured minutes-of-meeting (MoM).
   */
  minutes(text: string, opts?: { sections?: Array<'attendees' | 'agenda' | 'notes' | 'actions' | 'decisions' | 'risks'>; language?: string }): Promise<Record<string, any>>;
}
