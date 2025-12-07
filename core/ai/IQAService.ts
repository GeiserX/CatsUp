// ai/IQAService.ts

export interface SourceDoc {
  id: string;
  title?: string;
  text: string;
  url?: string;
  meta?: Record<string, any>;
}

export interface Citation {
  docId: string;
  snippet: string;
  score: number;            // similarity/relevance score
  startChar?: number;       // optional span info within source text
  endChar?: number;
  url?: string;             // convenience passthrough from source meta
}

export type AnswerStyle = 'concise' | 'detailed' | 'bulleted';

export interface Question {
  text: string;
  style?: AnswerStyle;
  language?: string;        // desired answer language
  sinceTs?: number;         // for time-bounded QA over transcripts
  untilTs?: number;
}

export interface Answer {
  text: string;
  confidence?: number;      // 0..1 heuristic
  citations?: Citation[];
  followUps?: string[];     // suggested clarifying questions
  usedDocs?: string[];      // document ids actually consulted
}

export interface AnswerStreamChunk {
  delta?: string;           // streamed text delta
  final?: boolean;          // marks end of stream
  citations?: Citation[];   // may be appended/updated at end
}

export interface IQAService {
  /**
   * Ask a question against provided sources (e.g., transcript + retrieved docs).
   */
  ask(question: string | Question, sources: SourceDoc[]): Promise<Answer>;

  /**
   * Streaming variant for low-latency UI updates.
   */
  askStreaming(question: string | Question, sources: SourceDoc[]): AsyncIterable<AnswerStreamChunk>;
}
