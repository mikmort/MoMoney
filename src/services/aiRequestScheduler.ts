import { AIChatMessage } from '../config/openAI';
import { AIRequestError } from '../utils/aiRequestErrors';

export const AI_TOKENS_PER_MINUTE = 10000;
export const AI_REQUESTS_PER_MINUTE = 10;
export const AI_MAX_CONCURRENT_REQUESTS = 2;

export type AIRequestProgress = {
  phase: 'queued' | 'processing' | 'quota' | 'cooldown';
  waitMs?: number;
};
export type AIProgressListener = (progress: AIRequestProgress) => void;

// Azure admission uses estimated prompt tokens plus the maximum output budget,
// not just billed usage. Keep reservations for the whole window, even on errors.
export function estimateAIRequestTokens(messages: AIChatMessage[], maxOutputTokens: number): number {
  const bytes = new TextEncoder().encode(messages.map(message => message.content).join('\n')).length;
  return Math.ceil(bytes / 3) + messages.length * 8 + maxOutputTokens;
}

export class AIRequestScheduler {
  private active = 0;
  private nextStart = 0;
  private cooldownUntil = 0;
  private reservations: Array<{ at: number; tokens: number }> = [];
  private pending: Array<{
    tokens: number;
    notify?: AIProgressListener;
    resolve: (release: () => void) => void;
    reject: (error: Error) => void;
  }> = [];
  private timer?: ReturnType<typeof setTimeout>;

  defer(delayMs: number): void {
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + delayMs);
    this.drain();
  }

  acquire(tokens: number, notify?: AIProgressListener): Promise<() => void> {
    if (this.cooldownUntil - Date.now() > 120000) {
      return Promise.reject(new AIRequestError('rate_limit', 429, this.cooldownUntil - Date.now()));
    }
    return new Promise((resolve, reject) => {
      this.pending.push({ tokens, notify, resolve, reject });
      this.drain();
    });
  }

  private drain(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.pending.length) return;
    const now = Date.now();
    if (this.cooldownUntil - now > 120000) {
      const error = new AIRequestError('rate_limit', 429, this.cooldownUntil - now);
      this.pending.splice(0).forEach(item => item.reject(error));
      return;
    }
    this.reservations = this.reservations.filter(item => now - item.at < 60000);
    const first = this.pending[0];
    let quotaUntil = this.nextStart;
    let tokens = this.reservations.reduce((total, item) => total + item.tokens, 0);
    let count = this.reservations.length;
    // A request larger than the estimate budget runs alone; don't deadlock
    // unrelated extraction operations. Classification batches are sized to fit.
    for (const item of this.reservations) {
      if (count < AI_REQUESTS_PER_MINUTE && tokens + first.tokens <= AI_TOKENS_PER_MINUTE) break;
      quotaUntil = Math.max(quotaUntil, item.at + 60000);
      tokens -= item.tokens;
      count--;
    }
    const until = Math.max(quotaUntil, this.cooldownUntil);
    if (until > now) {
      const progress: AIRequestProgress = {
        phase: this.cooldownUntil >= quotaUntil && this.cooldownUntil > now ? 'cooldown' : 'quota',
        waitMs: until - now
      };
      this.pending.forEach(item => item.notify?.(progress));
      this.timer = setTimeout(() => this.drain(), Math.min(until - now, 1000));
      return;
    }
    if (this.active >= AI_MAX_CONCURRENT_REQUESTS) {
      this.pending.forEach(item => item.notify?.({ phase: 'queued' }));
      return;
    }
    this.pending.shift();
    this.active++;
    this.reservations.push({ at: now, tokens: first.tokens });
    this.nextStart = now + 60000 / AI_REQUESTS_PER_MINUTE;
    let released = false;
    first.notify?.({ phase: 'processing' });
    first.resolve(() => {
      if (released) return;
      released = true;
      this.active--;
      this.drain();
    });
    this.drain();
  }
}
