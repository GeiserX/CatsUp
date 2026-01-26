// ai-backends/cloud/CloudProvider.ts
// Loads providers.json and exposes a simple selection + request helpers.

import providers from '../providers.json' assert { type: 'json' };

export type Provider = {
  id: string;
  kind: Array<'llm' | 'stt' | 'embeddings' | 'vision'>;
  name: string;
  endpoint?: string;
  apiKeyEnv?: string;
  models: {
    chat?: string[];         // LLM chat models
    stt?: string[];          // speech-to-text models
    embeddings?: string[];   // embedding models
    vision?: string[];       // vision/multimodal models
  };
  extras?: Record<string, any>; // e.g., apiVersion, deployment for Azure, region, etc.
};

export class CloudProviderRegistry {
  private static _instance: CloudProviderRegistry;
  static get instance(): CloudProviderRegistry {
    if (!CloudProviderRegistry._instance) {
      CloudProviderRegistry._instance = new CloudProviderRegistry();
    }
    return CloudProviderRegistry._instance;
  }

  private map = new Map<string, Provider>();

  private constructor() {
    for (const p of (providers as Provider[])) this.map.set(p.id, p);
  }

  get(id: string): Provider | undefined { return this.map.get(id); }
  list(): Provider[] { return Array.from(this.map.values()); }

  apiKey(p: Provider): string | undefined {
    return p.apiKeyEnv ? process.env[p.apiKeyEnv] : undefined;
  }
}
