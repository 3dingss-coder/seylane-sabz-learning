import { AiError, type AiProvider, type AiTask, type ChatRequest, type ChatResult } from './types';

/**
 * Offline embedding used when no embedding provider is configured (local dev, tests, or a
 * provider outage). It hashes character n-grams into 128 buckets — weak, but deterministic and
 * good enough to keep the hybrid retriever working without any API key. The knowledge index
 * stores the provider id next to every vector, so switching providers triggers a rebuild instead
 * of mixing incompatible vector spaces.
 */
export function localEmbed(text: string, dims = 128): number[] {
  const vec = new Array<number>(dims).fill(0);
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = normalized.split(' ').filter(Boolean);
  for (const token of tokens) {
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= token.length; i++) {
        const gram = token.slice(i, i + n);
        const idx = hash(gram) % dims;
        vec[idx] = (vec[idx] ?? 0) + 1;
      }
    }
  }
  return l2(vec);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function l2(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((a, x) => a + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
}

/**
 * Wraps the legacy `LlmClient` (the single-provider client kept for backwards compatibility and
 * for tests) so the hub always has at least one text provider available.
 */
export class LocalProvider implements AiProvider {
  readonly id = 'local' as const;
  readonly model = 'local-hash-128';
  readonly labelFa = 'موتور محلی (بدون کلید API)';
  private readonly tasks = new Set<AiTask>(['embed']);

  supports(task: AiTask): boolean {
    return this.tasks.has(task);
  }

  embed(texts: readonly string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((t) => localEmbed(t)));
  }
}

export class LegacyLlmProvider implements AiProvider {
  readonly id = 'legacy' as const;
  readonly labelFa: string;
  private readonly tasks = new Set<AiTask>(['chat', 'classify']);

  constructor(
    private readonly llm: {
      name: string;
      generate: (p: { system: string; prompt: string; maxTokens: number }) => Promise<string>;
    },
  ) {
    this.labelFa = `مدل پیکربندی‌شده (${llm.name})`;
  }

  get model(): string {
    return this.llm.name;
  }

  supports(task: AiTask): boolean {
    return this.tasks.has(task);
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    try {
      const history = (req.messages ?? [])
        .map((m) => `${m.role === 'user' ? 'کاربر' : 'دستیار'}: ${m.content}`)
        .join('\n');
      const prompt = history ? `${history}\n${req.prompt}` : req.prompt;
      const text = (
        await this.llm.generate({ system: req.system, prompt, maxTokens: req.maxTokens })
      ).trim();
      if (!text) throw new AiError('Empty answer', this.id, 'chat');
      return {
        text,
        model: this.llm.name,
        provider: this.id,
        approxTokens: Math.round((prompt.length + text.length) / 3.5),
      };
    } catch (e) {
      if (e instanceof AiError) throw e;
      throw new AiError((e as Error).message, this.id, 'chat');
    }
  }
}
