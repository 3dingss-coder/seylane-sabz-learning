export interface LlmClient {
  readonly name: string;
  generate(p: { system: string; prompt: string; maxTokens: number }): Promise<string>;
}

/** Deterministic stand-in used in tests (echoes the most relevant context sentence). */
export class FakeLlm implements LlmClient {
  readonly name = 'fake';
  calls = 0;
  constructor(private readonly reply?: (prompt: string) => string) {}
  async generate(p: { system: string; prompt: string; maxTokens: number }) {
    this.calls++;
    if (this.reply) return this.reply(p.prompt);
    const ctx = /<context>([\s\S]*?)<\/context>/.exec(p.prompt)?.[1] ?? '';
    const first = ctx
      .split('\n')
      .map((l) => l.replace(/^\[\d+\]\s*/, '').trim())
      .find((l) => l.length > 0);
    return first ? `بر اساس محتوای آموزشی: ${first.slice(0, 180)}` : 'نمی‌دانم.';
  }
}
