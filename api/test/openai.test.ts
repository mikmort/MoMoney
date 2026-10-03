import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { HttpRequest, InvocationContext } from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import { completionRequest, completeWithAzure, createOpenAIHandler } from '../src/functions/openai';

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; mock.restoreAll(); });
const messages = [{ role: 'user', content: 'Classify a grocery purchase.' }];
const data = {
  model: 'gpt-5.4-mini-2026-03-17',
  choices: [{ message: { content: '{"categoryId":"groceries"}' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }
};

function request(body: unknown = { messages }, authenticated = true, raw?: string) {
  return new HttpRequest({
    method: 'POST', url: 'https://example.test/api/openai/chat/completions',
    headers: {
      'content-type': 'application/json',
      ...(authenticated ? { 'x-ms-client-principal': Buffer.from(JSON.stringify({
        userId: 'alice', identityProvider: 'aad', userRoles: ['authenticated']
      })).toString('base64') } : {})
    },
    body: { string: raw ?? JSON.stringify(body) }
  });
}

test('server owns model, reasoning, output count and sampling parameters', () => {
  delete process.env.AZURE_OPENAI_DEPLOYMENT;
  assert.deepEqual(completionRequest({ messages, max_tokens: 200, temperature: 0.1, reasoning_effort: 'high', n: 10, tools: [{}] }), {
    model: 'gpt-5.4-mini', messages, max_completion_tokens: 200, reasoning_effort: 'none', stream: false, store: false
  });
  process.env.AZURE_OPENAI_DEPLOYMENT = 'finance-mini';
  assert.equal(completionRequest({ messages, deployment: 'finance-mini' }).model, 'finance-mini');
  assert.throws(() => completionRequest({ messages, deployment: 'gpt-4o' }), { status: 400 });
});

test('validates roles, messages, and exact token boundaries', () => {
  for (const max_completion_tokens of [1, 16000]) {
    assert.equal(completionRequest({ messages, max_completion_tokens }).max_completion_tokens, max_completion_tokens);
  }
  for (const body of [
    null, { messages: [] }, { messages: Array(101).fill(messages[0]) },
    { messages: [{ role: 'tool', content: 'x' }] }, { messages: [{ role: 'user', content: '' }] },
    { messages: [{ role: 'user', content: 'x'.repeat(32001) }] },
    ...[0, -1, 1.5, 16001, '200'].map(max_completion_tokens => ({ messages, max_completion_tokens })),
    { messages, max_tokens: 20, max_completion_tokens: 30 }
  ]) assert.throws(() => completionRequest(body), { status: 400 });
});

test('HTTP endpoint authenticates before inference and fails closed', async () => {
  const complete = mock.fn(async () => data);
  const handler = createOpenAIHandler(complete);
  const context = new InvocationContext();
  delete process.env.STORAGE_AUTH_MODE;
  assert.equal((await handler(request(), context)).status, 503);
  process.env.STORAGE_AUTH_MODE = 'swa-linked';
  assert.equal((await handler(request(undefined, false), context)).status, 401);
  assert.equal(complete.mock.callCount(), 0);
  const result = await handler(request(), context);
  assert.deepEqual(result.jsonBody, { success: true, data });
  assert.equal(complete.mock.callCount(), 1);
});

test('rejects malformed and oversized bodies before inference', async () => {
  process.env.STORAGE_AUTH_MODE = 'swa-linked';
  const complete = mock.fn(async () => data);
  const handler = createOpenAIHandler(complete);
  const context = new InvocationContext();
  assert.equal((await handler(request(undefined, true, '{'), context)).status, 400);
  assert.equal((await handler(request(undefined, true, 'x'.repeat(256 * 1024 + 1)), context)).status, 413);
  assert.equal(complete.mock.callCount(), 0);
});

test('rejects truncation, refusals and empty or malformed completions', async () => {
  process.env.STORAGE_AUTH_MODE = 'swa-linked';
  for (const [completion, status] of [
    [{ ...data, choices: [{ message: { content: '{}' }, finish_reason: 'length' }] }, 422],
    [{ ...data, choices: [{ message: { content: '', refusal: 'refused' }, finish_reason: 'stop' }] }, 422],
    [{ ...data, choices: [{ message: { content: '' }, finish_reason: 'content_filter' }] }, 422],
    [{ ...data, choices: [{ message: { content: '' }, finish_reason: 'stop' }] }, 502],
    [{}, 502]
  ] as const) {
    assert.equal((await createOpenAIHandler(async () => completion)(request(), new InvocationContext())).status, status);
  }
});

test('Azure transport uses Entra bearer auth, v1 and bounded GPT-5 parameters', async () => {
  process.env.AZURE_OPENAI_ENDPOINT = 'https://example.openai.azure.com/';
  const getToken = mock.method(DefaultAzureCredential.prototype, 'getToken', async () => ({ token: 'test-token', expiresOnTimestamp: Date.now() + 60000 }));
  const fetchMock = mock.method(globalThis, 'fetch', async (_url: string | URL | Request, _options?: RequestInit) => new Response(JSON.stringify(data)));
  const payload = completionRequest({ messages, max_completion_tokens: 200 });
  assert.deepEqual(await completeWithAzure(payload), data);
  assert.equal(getToken.mock.calls[0].arguments[0], 'https://cognitiveservices.azure.com/.default');
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(String(url), 'https://example.openai.azure.com/openai/v1/chat/completions');
  assert.ok(options);
  assert.deepEqual(JSON.parse(String(options.body)), payload);
  assert.ok(options.signal);
});

test('upstream errors never expose the request or raw response body', async () => {
  process.env.STORAGE_AUTH_MODE = 'swa-linked';
  process.env.AZURE_OPENAI_ENDPOINT = 'https://example.openai.azure.com/';
  mock.method(DefaultAzureCredential.prototype, 'getToken', async () => ({ token: 'test-token', expiresOnTimestamp: Date.now() + 60000 }));
  mock.method(globalThis, 'fetch', async () => new Response('private upstream detail', { status: 429 }));
  const result = await createOpenAIHandler()(request(), new InvocationContext());
  assert.equal(result.status, 429);
  assert.ok(!JSON.stringify(result).includes('private upstream detail'));
});
