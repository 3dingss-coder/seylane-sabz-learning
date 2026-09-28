import type { LlmClient } from './types';

/** Google Gemini REST client (free tier). No SDK dependency to keep the bundle small. */
export class GeminiClient implements LlmClient {
  readonly name = 'gemini';
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = 12_000,
  ) {}

  async generate(p: { system: string; prompt: string; maxTokens: number }): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
        {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: p.system }] },
            contents: [{ role: 'user', parts: [{ text: p.prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: p.maxTokens },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            ],
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
      const body = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = body.candidates?.[0]?.content?.parts?.map((x) => x.text ?? '').join('') ?? '';
      if (!text.trim()) throw new Error('Gemini empty response');
      return text.trim();
    } finally {
      clearTimeout(timer);
    }
  }
}
