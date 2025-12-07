# Local LLM backends (llama.cpp-compatible)

This folder provides offline backends for summarization, QA, and embeddings/RAG using a local server that exposes an OpenAI-compatible HTTP API (for example, a llama.cpp build started with `--api`).

Components:
- SummarizerLlamaCpp.ts: implements ISummarizer (summary, action extraction, minutes).
- QAServiceLlamaCpp.ts: implements IQAService (answers with inline citations [#n]).
- EmbeddingsLlamaCpp.ts: helper for local embeddings calls.
- RAGServiceLocalEmbeddings.ts: implements IRAGService with in-memory vector index.

Requirements:
- A local server exposing OpenAI-style endpoints:
  - POST /v1/chat/completions
  - POST /v1/embeddings
- An instruction-tuned model for chat/summarization (e.g., LLaMA/phi/mistral variant).
- An embedding model (e.g., `nomic-embed-text` or any supported by your server).

Configuration examples (TypeScript):

```ts
import { SummarizerLlamaCpp } from &#x27;./ai-backends/local/llamacpp/SummarizerLlamaCpp&#x27;;
import { QAServiceLlamaCpp } from &#x27;./ai-backends/local/llamacpp/QAServiceLlamaCpp&#x27;;
import { RAGServiceLocalEmbeddings } from &#x27;./ai-backends/local/llamacpp/RAGServiceLocalEmbeddings&#x27;;

const summarizer = new SummarizerLlamaCpp({
  baseUrl: &#x27;http://127.0.0.1:8080&#x27;, // or &#x27;http://localhost:8080/v1&#x27;
  model: &#x27;llama-3.1-8b-instruct-q4_K_M&#x27;,
  temperature: 0.2,
  maxTokens: 800,
});

const qa = new QAServiceLlamaCpp({
  baseUrl: &#x27;http://127.0.0.1:8080&#x27;,
  model: &#x27;llama-3.1-8b-instruct-q4_K_M&#x27;,
  temperature: 0.2,
});

const rag = new RAGServiceLocalEmbeddings({
  baseUrl: &#x27;http://127.0.0.1:8080&#x27;,
  model: &#x27;nomic-embed-text&#x27;,
  normalize: true,
});
