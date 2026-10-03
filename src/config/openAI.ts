export const DEFAULT_AI_DEPLOYMENT = 'gpt-5.4-mini';
export const OPENAI_PROXY_PATH = '/api/openai/chat/completions';
export const MAX_AI_COMPLETION_TOKENS = 16000;

export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIProxyRequest {
  deployment: string;
  messages: AIChatMessage[];
  max_completion_tokens?: number;
}
