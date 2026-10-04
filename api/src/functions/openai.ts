import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import { AIChatMessage, DEFAULT_AI_DEPLOYMENT, MAX_AI_COMPLETION_TOKENS } from '../../../src/config/openAI';
import { isRecord } from '../../../src/utils/cloudSnapshot';
import { StorageError } from '../snapshotStore';
import { userIdentity } from './storage';
import { AIErrorCode, parseRetryAfter } from '../../../src/utils/aiRequestErrors';

export class AIUpstreamError extends StorageError {
  constructor(status: number, message: string, public code: AIErrorCode, public retryAfterMs?: number) {
    super(status, message);
  }
}

interface CompletionRequest {
  model: string;
  messages: AIChatMessage[];
  max_completion_tokens: number;
  reasoning_effort: 'none';
  stream: false;
  store: false;
}

const credential = new DefaultAzureCredential();
const MAX_BODY_BYTES = 256 * 1024;

export function completionRequest(body: unknown): CompletionRequest {
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || DEFAULT_AI_DEPLOYMENT;
  if (!isRecord(body)) throw new StorageError(400, 'A JSON request object is required.');
  if (body.deployment !== undefined && body.deployment !== deployment) {
    throw new StorageError(400, 'Requested AI deployment is not enabled. Check the app configuration.');
  }
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 100) {
    throw new StorageError(400, 'Provide between 1 and 100 text messages.');
  }
  const messages: AIChatMessage[] = body.messages.map((message: unknown) => {
    if (!isRecord(message) ||
        (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant') ||
        typeof message.content !== 'string' || !message.content.trim() || message.content.length > 32000) {
      throw new StorageError(400, 'Each message must have a supported role and 1-32000 characters of text.');
    }
    return { role: message.role, content: message.content };
  });
  // Accept the old token field during rollout, but never forward it to GPT-5.
  if (body.max_tokens !== undefined && body.max_completion_tokens !== undefined) {
    throw new StorageError(400, 'Specify only one completion token limit.');
  }
  const tokens = body.max_completion_tokens ?? body.max_tokens ?? 1000;
  if (typeof tokens !== 'number' || !Number.isInteger(tokens) || tokens < 1 || tokens > MAX_AI_COMPLETION_TOKENS) {
    throw new StorageError(400, `Completion token limit must be between 1 and ${MAX_AI_COMPLETION_TOKENS}.`);
  }
  // Server-owned options prevent clients enabling expensive reasoning or additional outputs/tools.
  return { model: deployment, messages, max_completion_tokens: tokens, reasoning_effort: 'none', stream: false, store: false };
}

export async function completeWithAzure(
  request: Omit<CompletionRequest, 'reasoning_effort'> & { reasoning_effort?: 'none' }
): Promise<unknown> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!endpoint) throw new StorageError(503, 'AI is not configured on the server.');
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !/\.(openai\.azure\.com|cognitiveservices\.azure\.com|services\.ai\.azure\.com)$/.test(url.hostname)) {
    throw new StorageError(503, 'AI endpoint configuration is invalid.');
  }
  const token = await credential.getToken('https://cognitiveservices.azure.com/.default');
  const response = await fetch(new URL('/openai/v1/chat/completions', url), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) {
    // Never echo upstream bodies: they can contain prompts or service configuration.
    if (response.status === 429) {
      const delay = parseRetryAfter(response.headers.get('retry-after-ms'), response.headers.get('retry-after')) ?? 60000;
      throw new AIUpstreamError(429, 'AI rate limit reached. Please retry later.', 'rate_limit', delay);
    }
    if (response.status === 401 || response.status === 403) {
      throw new AIUpstreamError(502, 'Azure AI authentication failed. Check the backend identity and deployment access.', 'upstream_auth');
    }
    if (response.status === 400 || response.status === 404) {
      throw new AIUpstreamError(400, 'Azure AI rejected the request or deployment configuration.', 'invalid_request');
    }
    throw new StorageError(502, `Azure AI request failed (HTTP ${response.status}).`);
  }
  return response.json();
}

export function createOpenAIHandler(complete: (request: CompletionRequest) => Promise<unknown> = completeWithAzure) {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const headers = { 'Cache-Control': 'no-store', 'X-MoMoney-AI': '1' };
    try {
      userIdentity(request);
      if (!request.headers.get('content-type')?.startsWith('application/json')) {
        throw new StorageError(415, 'JSON content type is required.');
      }
      const text = await request.text();
      if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new StorageError(413, 'AI request exceeds the 256 KB limit.');
      let body: unknown;
      try { body = JSON.parse(text); }
      catch { throw new StorageError(400, 'Invalid JSON.'); }
      const data = await complete(completionRequest(body));
      if (!isRecord(data) || typeof data.model !== 'string' || !Array.isArray(data.choices) || data.choices.length !== 1) {
        throw new StorageError(502, 'AI returned an invalid completion.');
      }
      const choice: unknown = data.choices[0];
      if (!isRecord(choice) || !isRecord(choice.message)) throw new StorageError(502, 'AI returned an invalid completion.');
      if (choice.finish_reason === 'length') throw new AIUpstreamError(422, 'AI response was truncated. Try a smaller batch or document.', 'truncated');
      if (choice.message.refusal || choice.finish_reason === 'content_filter') throw new AIUpstreamError(422, 'AI could not process this request.', 'refused');
      if (choice.finish_reason !== 'stop' || typeof choice.message.content !== 'string' || !choice.message.content.trim()) {
        throw new StorageError(502, 'AI returned no complete text response.');
      }
      return { headers, jsonBody: { success: true, data } };
    } catch (error) {
      const message = error instanceof StorageError ? error.message : 'AI unavailable. Please retry later.';
      context.error('AI request failed', message);
      const status = error instanceof StorageError ? error.status : 503;
      const code: AIErrorCode = error instanceof AIUpstreamError ? error.code :
        status === 401 || status === 403 ? 'authentication' :
        status >= 500 ? 'unavailable' : 'invalid_request';
      const retryAfterMs = error instanceof AIUpstreamError ? error.retryAfterMs : undefined;
      return {
        headers: { ...headers, ...(retryAfterMs !== undefined ? { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } : {}) },
        status, jsonBody: { success: false, error: message, code, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) }
      };
    }
  };
}

app.http('openai', {
  route: 'openai/chat/completions',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: createOpenAIHandler()
});
