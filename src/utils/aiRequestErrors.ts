export type AIErrorCode = 'rate_limit' | 'authentication' | 'upstream_auth' | 'invalid_request' |
  'truncated' | 'refused' | 'unavailable' | 'network' | 'invalid_response' | 'disabled';

const messages: Record<AIErrorCode, string> = {
  rate_limit: 'AI rate limit reached after retries. Wait before using Re-run AI.',
  authentication: 'AI authentication failed. Sign in again before using Re-run AI.',
  upstream_auth: 'The AI backend could not authenticate with Azure. Its administrator must check the managed identity and deployment access.',
  invalid_request: 'The AI request was rejected. Check the deployment configuration and request limits.',
  truncated: 'The AI response exceeded its output limit. Retry with a smaller batch.',
  refused: 'The AI service declined this request. Review the transaction or categorize it manually.',
  unavailable: 'The AI service is temporarily unavailable after retries. Try Re-run AI later.',
  network: 'The AI request timed out or could not reach the server. Check your connection and retry.',
  invalid_response: 'The AI service returned an invalid or incomplete classification. Try Re-run AI.',
  disabled: 'AI is disabled in this environment.'
};

export class AIRequestError extends Error {
  constructor(public code: AIErrorCode, public status?: number, public retryAfterMs?: number) {
    super(messages[code]);
  }
}

export function isAIErrorCode(value: unknown): value is AIErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(messages, value);
}

export function parseRetryAfter(
  milliseconds: string | null | undefined,
  secondsOrDate: string | null | undefined,
  now = Date.now()
): number | undefined {
  if (milliseconds?.trim()) {
    const value = Number(milliseconds);
    if (Number.isFinite(value) && value >= 0) return Math.ceil(value);
  }
  if (!secondsOrDate?.trim()) return undefined;
  const seconds = Number(secondsOrDate);
  if (Number.isFinite(seconds)) return seconds >= 0 ? Math.ceil(seconds * 1000) : undefined;
  const date = Date.parse(secondsOrDate);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

export function classificationError(error: unknown): AIRequestError {
  if (error instanceof AIRequestError) return error;
  if (error instanceof Error && /timeout|timed out|abort|network|failed to fetch/i.test(error.message)) {
    return new AIRequestError('network');
  }
  return new AIRequestError('invalid_response');
}
