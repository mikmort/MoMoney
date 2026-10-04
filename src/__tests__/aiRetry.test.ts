import { AzureOpenAIService } from '../services/azureOpenAIService';
import { parseRetryAfter } from '../utils/aiRequestErrors';
import { defaultCategories } from '../data/defaultCategories';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const inputs = (count: number) => Array.from({ length: count }, () => ({
  transactionText: 'Spotify', amount: -12.99, date: '2026-01-15', availableCategories: defaultCategories
}));
const failed = (status: number, code?: string, delay?: string) => ({
  ok: false, status, headers: new Headers(delay === undefined ? {} : { 'Retry-After': delay }),
  text: async () => JSON.stringify({ code })
});

describe('AI retry pacing and failure transparency', () => {
  const originalEnabled = process.env.REACT_APP_AI_ENABLED;
  const originalFetch = global.fetch;
  beforeEach(() => {
    process.env.REACT_APP_AI_ENABLED = 'true';
    global.fetch = jest.fn();
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    if (originalEnabled === undefined) delete process.env.REACT_APP_AI_ENABLED;
    else process.env.REACT_APP_AI_ENABLED = originalEnabled;
  });

  it('honors milliseconds, seconds, HTTP dates, and rejects invalid delays', () => {
    expect(parseRetryAfter('1500', '60')).toBe(1500);
    expect(parseRetryAfter(null, '60')).toBe(60000);
    expect(parseRetryAfter(null, 'Thu, 01 Jan 1970 00:01:00 GMT', 0)).toBe(60000);
    expect(parseRetryAfter('invalid', 'not a date')).toBeUndefined();
    expect(parseRetryAfter(null, '-1')).toBeUndefined();
  });

  it('waits a full retry window and never fans an exhausted batch out to singles', async () => {
    (fetch as jest.Mock).mockResolvedValue(failed(429, 'rate_limit', '60'));
    const resultPromise = new AzureOpenAIService().classifyTransactionsBatch(inputs(25));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(59999);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(60000);
    await flush();
    const results = await resultPromise;
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(25);
    expect(results.every(result => result.error?.code === 'rate_limit')).toBe(true);
    expect(results[0].reasoning).toContain('rate limit');
  });

  it('uses a minute fallback when Azure omits Retry-After', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(failed(429)).mockResolvedValueOnce({
      ok: true, json: async () => ({ success: true, data: { choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] } })
    });
    const result = new AzureOpenAIService().testConnection();
    await flush();
    jest.advanceTimersByTime(59999);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await flush();
    expect(await result).toBe(true);
  });

  it.each([
    [401, 'authentication'], [502, 'upstream_auth'], [400, 'invalid_request'],
    [422, 'truncated'], [422, 'refused']
  ])('does not retry permanent failure %s/%s', async (status, code) => {
    (fetch as jest.Mock).mockResolvedValue(failed(Number(status), String(code)));
    const results = await new AzureOpenAIService().classifyTransactionsBatch(inputs(25));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(25);
    expect(results[0].error?.code).toBe(code);
    expect(results[0].reasoning).not.toContain('using fallback');
  });
});
