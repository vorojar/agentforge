/**
 * Volcano Engine Embedding Client + cosine similarity.
 * Uses doubao-embedding multimodal API.
 */

export interface EmbeddingClient {
  embed(texts: string[]): Promise<number[][]>;
}

interface EmbeddingResponse {
  data: { embedding: number[] };
}

export class VolcanoEmbedding implements EmbeddingClient {
  private apiKey: string;
  private model: string;
  private baseURL: string;

  constructor(options: { apiKey: string; model?: string; baseURL?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "doubao-embedding-vision-250615";
    this.baseURL = options.baseURL ?? "https://ark.cn-beijing.volces.com/api/v3";
  }

  async embed(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embedSingle(text)));
  }

  private async embedSingle(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseURL}/embeddings/multimodal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: [{ type: "text", text }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Embedding API error ${res.status}: ${body}`);
    }

    const json = (await res.json()) as EmbeddingResponse;
    return json.data.embedding;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
