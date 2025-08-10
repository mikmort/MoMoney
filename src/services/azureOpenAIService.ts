import { defaultConfig } from '../config/appConfig';
import { AIClassificationRequest, AIClassificationResponse, AnomalyDetectionRequest, AnomalyDetectionResponse, AnomalyResult, AccountStatementAnalysisRequest, AccountStatementAnalysisResponse } from '../types';

// OpenAI Proxy configuration
// Allow overriding the proxy URL via environment variable for production or remote Azure Function usage.
// Example: REACT_APP_OPENAI_PROXY_URL=https://<your-func>.azurewebsites.net/api/openai/chat/completions
const OPENAI_PROXY_URL =
  (process.env.REACT_APP_OPENAI_PROXY_URL as string | undefined) || '/api/openai/chat/completions';

// Types for the proxy API
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIProxyRequest {
  deployment: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
}

interface OpenAIProxyResponse {
  success: boolean;
  data?: {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
      index: number;
      message: {
        role: string;
        content: string;
      };
      finish_reason: string;
    }>;
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };
  error?: string;
  // Optional metadata from proxy HTTP response for smarter client backoff
  status?: number;
  retryAfterMs?: number;
}

export class AzureOpenAIService {
  private readonly deploymentName: string;
  private initialized = true; // Always initialized since we don't need client setup
  private readonly fallbackDeployments: string[];

  constructor() {
    this.deploymentName = defaultConfig.azure.openai.deploymentName || 'gpt-4o';
    // Optional comma-separated fallbacks, e.g. "gpt-5-chat,gpt-4o"
    const envFallback = (process.env.REACT_APP_AZURE_OPENAI_FALLBACK_DEPLOYMENTS || '').split(',').map(s => s.trim()).filter(Boolean);
    // Ensure we have at least the opposite popular option as a fallback
    const defaultAlt = this.deploymentName === 'gpt-5-chat' ? ['gpt-4o'] : ['gpt-5-chat'];
    const merged = [...envFallback, ...defaultAlt].filter((m, idx, arr) => arr.indexOf(m) === idx);
    // Do not include primary in fallbacks
    this.fallbackDeployments = merged.filter(m => m && m !== this.deploymentName);
  }

  private async callOpenAIProxy(request: OpenAIProxyRequest): Promise<OpenAIProxyResponse> {
    try {
      const response = await fetch(OPENAI_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      // Capture Retry-After header (seconds) if present to inform client backoff
  const retryAfterHeader = (response as any)?.headers?.get ? (response as any).headers.get('retry-after') : undefined;
      let retryAfterMs: number | undefined;
      if (retryAfterHeader) {
        const seconds = parseFloat(retryAfterHeader);
        if (!Number.isNaN(seconds)) {
          retryAfterMs = Math.max(0, Math.floor(seconds * 1000));
        }
      }

      if (!response.ok) {
        // Try to read any error body for logging context without throwing
        let msg = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const raw = await response.text();
          if (raw) {
            // Avoid leaking full body; keep it compact
            const snippet = raw.slice(0, 200).replace(/\s+/g, ' ').trim();
            if (snippet) msg += ` - ${snippet}`;
          }
        } catch {}
        return { success: false, error: msg, status: response.status, retryAfterMs };
      }

      const result: OpenAIProxyResponse = await response.json();
      return result;
    } catch (error) {
      console.error('Error calling OpenAI proxy:', error);
      throw error;
    }
  }

  // Helper: unified retry/backoff + deployment fallback
  private async callOpenAIWithFallback(
    request: Omit<OpenAIProxyRequest, 'deployment'> & { deployment?: string },
    options?: { attemptsPerDeployment?: number; baseBackoffMs?: number }
  ): Promise<OpenAIProxyResponse> {
    const attemptsPerDeployment = options?.attemptsPerDeployment ?? 2;
    const base = options?.baseBackoffMs ?? 400;

    const deployments = [request.deployment || this.deploymentName, ...this.fallbackDeployments]
      .filter((d, i, arr) => d && arr.indexOf(d) === i);

    let lastErr: any;
    for (const dep of deployments) {
      for (let attempt = 1; attempt <= attemptsPerDeployment; attempt++) {
        try {
          const resp = await this.callOpenAIProxy({ ...(request as any), deployment: dep });
          if (!resp.success) {
            const err = String(resp.error || '').toLowerCase();
            const status = resp.status;
            const retriableStatus = status === 429 || (status !== undefined && status >= 500 && status < 600);
            const retriableText = err.includes('rate') || err.includes('limit') || err.includes('overload') || err.includes('timeout') || err.includes('5');
            const retriable = retriableStatus || retriableText;
            if (retriable && attempt < attemptsPerDeployment) {
              // Respect Retry-After when available; otherwise exponential backoff
              const wait = typeof resp.retryAfterMs === 'number' && resp.retryAfterMs > 0
                ? resp.retryAfterMs + Math.floor(Math.random() * 200)
                : base * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
              await new Promise(r => setTimeout(r, wait));
              continue;
            }
            // try next deployment
            lastErr = new Error(resp.error || 'Proxy returned error');
          } else {
            return resp;
          }
        } catch (e: any) {
          const msg = String(e?.message || '').toLowerCase();
          const is429 = msg.includes('http 429');
          const is5xx = /http\s*5\d\d/.test(msg);
          const retriable = is429 || is5xx || msg.includes('timeout') || msg.includes('fetch') || msg.includes('network');
          lastErr = e;
          if (retriable && attempt < attemptsPerDeployment) {
            const wait = base * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
            await new Promise(r => setTimeout(r, wait));
            continue;
          }
          // break to next deployment
        }
        // break inner loop to try next deployment
        break;
      }
    }
    throw lastErr || new Error('All deployments failed');
  }

  // Constrain AI output to the provided categories/subcategories catalog
  private constrainToCatalog(
    result: { categoryId: string; subcategoryId?: string | null; confidence?: number; reasoning?: string },
    categories: Array<{ id: string; name: string; subcategories?: Array<{ id: string; name: string }> }>
  ): AIClassificationResponse {
    const categoryIds = new Set(categories.map(c => c.id));
    const nameToIdCategory = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));

    // Normalize category: accept exact id, else map by name, else fallback to 'uncategorized'
    let categoryId = result.categoryId;
    if (!categoryIds.has(categoryId)) {
      const mapped = nameToIdCategory.get(String(categoryId).toLowerCase());
      categoryId = mapped || 'uncategorized';
    }

    // Normalize subcategory within the chosen category
    let subcategoryId = result.subcategoryId ?? null;
    if (subcategoryId) {
      const cat = categories.find(c => c.id === categoryId);
      const subs = cat?.subcategories || [];
      const subIds = new Set(subs.map(s => s.id));
      if (!subIds.has(subcategoryId)) {
        const nameToIdSub = new Map(subs.map(s => [s.name.toLowerCase(), s.id]));
        const mappedSub = nameToIdSub.get(String(subcategoryId).toLowerCase()) || null;
        subcategoryId = mappedSub;
      }
    }

    return {
      categoryId,
      subcategoryId: subcategoryId || undefined,
      confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
      reasoning: result.reasoning || 'AI classification'
    };
  }

  async classifyTransaction(request: AIClassificationRequest): Promise<AIClassificationResponse> {
    const startTime = Date.now();
    try {
      // Build an explicit catalog of allowed categories/subcategories (IDs only) for the model
      const categoriesCatalog = request.availableCategories
        .map(c => {
          const subs = (c.subcategories || [])
            .map(s => `      { "id": "${s.id}", "name": "${s.name}" }`)
            .join(',\n');
          return `  {
    "id": "${c.id}",
    "name": "${c.name}",
    "subcategories": [
${subs}
    ]
  }`;
        })
        .join(',\n');

      const systemPrompt = `You are a financial transaction classifier. You MUST choose a category and optional subcategory ONLY from the provided catalog. Always return ONLY a JSON object in this exact schema (no extra keys, no prose):
{
  "categoryId": "one of the allowed category ids",
  "subcategoryId": "one of the allowed subcategory ids for the chosen category or null",
  "confidence": 0.0-1.0,
  "reasoning": "detailed explanation of your classification decision including key factors considered"
}

Rules:
- Use EXACT ids from the catalog below (do not invent or transform ids or names)
- If unsure, set subcategoryId to null
- If you cannot determine a category confidently, set categoryId to "uncategorized" and confidence <= 0.3
- Provide detailed reasoning explaining your classification logic and key terms that influenced the decision`;

      const userPrompt = `Classify this transaction using ONLY the following catalog:
Allowed Categories Catalog (ids and names):
[
${categoriesCatalog}
]

Transaction:
Description: ${request.transactionText}
Amount: $${request.amount}
Date: ${request.date}`;

      const proxyRequest: OpenAIProxyRequest = {
        deployment: this.deploymentName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 200,
  temperature: 0
      };

  const response = await this.callOpenAIWithFallback(proxyRequest, { attemptsPerDeployment: 3, baseBackoffMs: 300 });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'No response from OpenAI proxy');
      }

      const responseContent = response.data.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response content from OpenAI proxy');
      }

      // Clean the response to handle markdown code blocks
      const cleanedResponse = this.cleanAIResponse(responseContent);
      const parsed = JSON.parse(cleanedResponse);

      // Extract key terms from transaction description for transparency
      const keyTokens = this.extractKeyTokens(request.transactionText);

      // Normalize then constrain to provided catalog
      const normalized = {
        categoryId: (parsed.categoryId || parsed.category || 'uncategorized') as string,
        subcategoryId: (parsed.subcategoryId || parsed.subcategory || null) as string | null,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        reasoning: (parsed.reasoning || 'AI classification') as string
      };

      // Create enhanced response with proxy metadata
      const constrainedResult = this.constrainToCatalog(normalized, request.availableCategories as any);
      
      // Add proxy metadata for transparency
      constrainedResult.proxyMetadata = {
        model: response.data.model || this.deploymentName,
        promptTokens: response.data.usage?.prompt_tokens,
        completionTokens: response.data.usage?.completion_tokens,
        totalTokens: response.data.usage?.total_tokens,
        finishReason: response.data.choices[0]?.finish_reason,
        requestId: response.data.id,
        created: response.data.created,
        keyTokens,
        processingTime: Date.now() - startTime
      };

      return constrainedResult;
    } catch (error) {
      console.error('Error classifying transaction:', error);
      
      return {
        categoryId: 'uncategorized',
        confidence: 0.1,
        reasoning: 'Failed to classify using AI - using fallback',
        proxyMetadata: {
          model: this.deploymentName,
          processingTime: Date.now() - startTime,
          keyTokens: this.extractKeyTokens(request.transactionText)
        }
      };
    }
  }

  // New: batch classification to reduce API calls and speed up imports
  async classifyTransactionsBatch(
    requests: AIClassificationRequest[]
  ): Promise<AIClassificationResponse[]> {
    if (!requests.length) return [];

    // Process in chunks to reduce proxy load and avoid 500s when payloads are large
    const MAX_BATCH = 20;
    const INTER_CHUNK_DELAY_MS = 250; // gentle pacing to avoid hammering the function
    const chunks: AIClassificationRequest[][] = [];
    for (let i = 0; i < requests.length; i += MAX_BATCH) {
      chunks.push(requests.slice(i, i + MAX_BATCH));
    }

    // Enhanced logging for AI processing visibility
    console.log(`🤖 AI Classification Starting:`);
    console.log(`   📤 ${requests.length} transactions require AI categorization`);
    console.log(`   📦 Batching into ${chunks.length} API requests (chunkSize=${MAX_BATCH})`);
    console.log(`   ⏱️ Estimated processing time: ~${Math.ceil(chunks.length * 3)} seconds`);

    const results: AIClassificationResponse[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`   ⏳ Processing AI batch ${i + 1}/${chunks.length} (${chunk.length} transactions)...`);
      
      const chunkResults = await this.classifyTransactionsBatchChunk(chunk);
      results.push(...chunkResults);
      
      const categorizedInChunk = chunkResults.filter(r => r.categoryId !== 'uncategorized').length;
      console.log(`   ✅ Batch ${i + 1} complete: ${categorizedInChunk}/${chunk.length} successfully categorized`);
      
      // Small delay between chunks to help with rate limits on Azure Function
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, INTER_CHUNK_DELAY_MS));
      }
    }
    
    // Final AI processing summary
    const totalCategorized = results.filter(r => r.categoryId !== 'uncategorized').length;
    const aiSuccessRate = requests.length > 0 ? Math.round((totalCategorized / requests.length) * 100) : 0;
    console.log(`🎯 AI Processing Summary:`);
    console.log(`   📊 ${totalCategorized}/${requests.length} transactions successfully categorized (${aiSuccessRate}%)`);
    console.log(`   🤖 Total OpenAI API calls: ${chunks.length}`);
    
    return results;
  }

  // Internal: classify a small chunk with retries and robust parsing
  private async classifyTransactionsBatchChunk(
    requests: AIClassificationRequest[],
    attempt = 1
  ): Promise<AIClassificationResponse[]> {
    try {
      const categories = requests[0].availableCategories;
      const categoriesCatalog = categories
        .map(c => {
          const subs = (c.subcategories || [])
            .map(s => `      { "id": "${s.id}", "name": "${s.name}" }`)
            .join(',\n');
          return `  {
    "id": "${c.id}",
    "name": "${c.name}",
    "subcategories": [
${subs}
    ]
  }`;
        })
        .join(',\n');

      const items = requests.map((r, idx) => ({ index: idx, description: r.transactionText, amount: r.amount, date: r.date }));

  const expectedCount = requests.length;
  const systemPrompt = `You are a financial transaction classifier. Classify a list of transactions.
You MUST respond with ONLY a single JSON array on the first line. The FIRST character of your reply must be '[' and the LAST character must be ']'.
Do NOT include any prose, explanations, markdown fences, or keys like "+results+" or "+items+". Do NOT include backticks.
The array MUST contain EXACTLY ${expectedCount} elements, in the SAME ORDER as the input. You may include an "index" copied from the input to preserve order.
Each element object must have fields: { categoryId, subcategoryId (or null), confidence (0-1), reasoning }.
Rules: Use EXACT ids from the catalog; do not invent ids or names; if unsure set subcategoryId=null; if uncertain set categoryId="uncategorized" and confidence<=0.3.`;

      const userPrompt = `Allowed Categories Catalog (ids and names):\n[\n${categoriesCatalog}\n]\n\nTransactions (classify in this same order). Include the same "index" in each output object to align results:\n${JSON.stringify(items, null, 2)}`;

      const proxyRequest: OpenAIProxyRequest = {
        deployment: this.deploymentName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1000,
  temperature: 0
      };

  const response = await this.callOpenAIWithFallback(proxyRequest, { attemptsPerDeployment: 3, baseBackoffMs: 500 });
      if (!response.success || !response.data) throw new Error(response.error || 'No response from OpenAI proxy');

      const responseContent = response.data.choices[0]?.message?.content;
      if (!responseContent) throw new Error('No response content from OpenAI proxy');

      const cleaned = this.cleanAIResponse(responseContent);

      const normalizeJsonLike = (s: string) => s
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/\r\n/g, '\n');

      const stripTrailingCommas = (s: string) => s
        // remove trailing commas before } or ]
        .replace(/,\s*([}\]])/g, '$1');

      const findBalancedArraySlice = (text: string): string | null => {
        const n = text.length;
        let inStr = false;
        let esc = false;
        let depth = 0;
        let startIdx = -1;
        for (let i = 0; i < n; i++) {
          const ch = text[i];
          if (inStr) {
            if (!esc && ch === '"') inStr = false;
            esc = ch === '\\' ? !esc : false;
            continue;
          }
          if (ch === '"') { inStr = true; esc = false; continue; }
          if (ch === '[') {
            if (depth === 0) startIdx = i;
            depth++;
          } else if (ch === ']') {
            depth--;
            if (depth === 0 && startIdx !== -1) {
              return text.slice(startIdx, i + 1);
            }
          }
        }
        return null;
      };

      const assembleObjectsIfAny = (text: string): any[] | null => {
        // Attempt to collect top-level JSON objects and make an array
        const n = text.length;
        let inStr = false;
        let esc = false;
        let depth = 0;
        let start = -1;
        const objs: string[] = [];
        for (let i = 0; i < n; i++) {
          const ch = text[i];
          if (inStr) {
            if (!esc && ch === '"') inStr = false;
            esc = ch === '\\' ? !esc : false;
            continue;
          }
          if (ch === '"') { inStr = true; esc = false; continue; }
          if (ch === '{') {
            if (depth === 0) start = i;
            depth++;
          } else if (ch === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
              objs.push(text.slice(start, i + 1));
              start = -1;
            }
          }
        }
        if (!objs.length) return null;
        try {
          const parsed = objs.map(o => JSON.parse(stripTrailingCommas(normalizeJsonLike(o))));
          return parsed;
        } catch { return null; }
      };

      const tryParseArray = (text: string, expectedLen: number): any[] | null => {
        const norm = stripTrailingCommas(normalizeJsonLike(text.trim()))
          // remove code fences if any slipped through
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/, '');
        // Fast path: strict JSON
        try {
          const j = JSON.parse(norm);
          if (Array.isArray(j)) return j;
          if (j && Array.isArray((j as any).results)) return (j as any).results;
          if (j && Array.isArray((j as any).items)) return (j as any).items;
        } catch {}
        // Balanced array slice
        const slice = findBalancedArraySlice(norm);
        if (slice) {
          try {
            const j = JSON.parse(stripTrailingCommas(slice));
            if (Array.isArray(j)) return j;
          } catch {}
        }
        // Assemble from objects if present and length matches or at least >0
        const objs = assembleObjectsIfAny(norm);
        if (objs && (objs.length === expectedLen || objs.length > 0)) return objs;
        return null;
      };

  let parsed: any[] | null = tryParseArray(cleaned, expectedCount);
      if (!parsed) {
        // If parsing fails, first try to reduce load by splitting the batch before falling back to singles
        if (requests.length > 1 && attempt <= 3) {
          console.warn(`Batch parse failed (no JSON array found). Splitting batch of ${requests.length} (attempt ${attempt}) and retrying.`);
          const mid = Math.ceil(requests.length / 2);
          const left = requests.slice(0, mid);
          const right = requests.slice(mid);
          const leftResults = await this.classifyTransactionsBatchChunk(left, attempt + 1);
          const rightResults = await this.classifyTransactionsBatchChunk(right, attempt + 1);
          return [...leftResults, ...rightResults];
        }
        console.warn('Batch parse failed (no JSON array found). Falling back to per-item classification.');
        const singles: AIClassificationResponse[] = [];
        for (const r of requests) {
          try {
            singles.push(await this.classifyTransaction(r));
          } catch {
            singles.push({ categoryId: 'uncategorized', confidence: 0.1, reasoning: 'Single fallback failed' });
          }
        }
        return singles;
      }

      // Length reconcile
      if (parsed.length !== requests.length) {
        if (parsed.every(p => typeof p?.index === 'number')) parsed.sort((a, b) => (a.index as number) - (b.index as number));
        const results: AIClassificationResponse[] = [];
        for (let i = 0; i < requests.length; i++) {
          const p = parsed[i];
          if (p) {
            const categoryId = (p.categoryId || p.category || 'uncategorized') as string;
            const subcategoryId = (p.subcategoryId || p.subcategory || null) as string | null;
            const confidence = typeof p.confidence === 'number' ? p.confidence : 0.5;
            const reasoning = (p.reasoning || 'AI classification') as string;
            results.push(this.constrainToCatalog({ categoryId, subcategoryId, confidence, reasoning }, categories as any));
          } else {
            try {
              results.push(await this.classifyTransaction(requests[i]));
            } catch {
              results.push({ categoryId: 'uncategorized', confidence: 0.1, reasoning: 'Missing batch item' });
            }
          }
        }
        return results;
      }

      // 1:1 normalization
      return parsed.map((p) => {
        const normalized = {
          categoryId: (p?.categoryId || p?.category || 'uncategorized') as string,
          subcategoryId: (p?.subcategoryId || p?.subcategory || null) as string | null,
          confidence: typeof p?.confidence === 'number' ? p.confidence : 0.5,
          reasoning: (p?.reasoning || 'AI classification') as string
        };
        return this.constrainToCatalog(normalized, categories as any);
      });
    } catch (error: any) {
      // Adaptive handling: backoff and split the batch on server/rate errors
      const msg = String(error?.message || '').toLowerCase();
      const is429 = msg.includes('http 429') || msg.includes('rate') || msg.includes('limit');
      const is5xx = /http\s*5\d\d/.test(msg) || msg.includes('overload');
      const retriable = is429 || is5xx || msg.includes('timeout') || msg.includes('network');

      // Exponential backoff before retrying or splitting
      const backoffMs = Math.min(4000, 300 * Math.pow(2, Math.max(0, attempt - 1))) + Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, backoffMs));

      // If we have more than one item, split to reduce load and try sequentially
      if (retriable && requests.length > 1 && attempt <= 5) {
        const mid = Math.ceil(requests.length / 2);
        const left = requests.slice(0, mid);
        const right = requests.slice(mid);
        const leftResults = await this.classifyTransactionsBatchChunk(left, attempt + 1);
        const rightResults = await this.classifyTransactionsBatchChunk(right, attempt + 1);
        return [...leftResults, ...rightResults];
      }

      // Final fallback: per-item classification
      console.error('Error in batch classification chunk (fallback to singles):', error);
      const singles: AIClassificationResponse[] = [];
      for (const r of requests) {
        try {
          singles.push(await this.classifyTransaction(r));
        } catch {
          singles.push({ categoryId: 'uncategorized', confidence: 0.1, reasoning: 'Batch chunk failed' });
        }
        // small gap between singles when recovering from overload
        await new Promise(res => setTimeout(res, 100));
      }
      return singles;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      console.log('Testing OpenAI proxy connection...');
      
      const proxyRequest: OpenAIProxyRequest = {
        deployment: this.deploymentName,
        messages: [
          { role: 'user', content: 'Hello, please respond with "OK" if you can read this.' }
        ],
        max_tokens: 10,
        temperature: 0
      };

  const response = await this.callOpenAIWithFallback(proxyRequest, { attemptsPerDeployment: 2, baseBackoffMs: 250 });
      
      if (!response.success || !response.data) {
        console.error('Connection test failed:', response.error);
        return false;
      }

      const responseContent = response.data.choices[0]?.message?.content;
      console.log('OpenAI proxy test response:', responseContent);
      return responseContent?.includes('OK') || false;
    } catch (error) {
      console.error('OpenAI proxy connection test failed:', error);
      return false;
    }
  }

  async generateChatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: {
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<any> {
    const proxyRequest: OpenAIProxyRequest = {
      deployment: this.deploymentName,
      messages,
      max_tokens: options?.maxTokens || 500,
  temperature: options?.temperature ?? 0
    };

  const response = await this.callOpenAIWithFallback(proxyRequest, { attemptsPerDeployment: 2, baseBackoffMs: 300 });
    
    if (!response.success || !response.data) {
      throw new Error(response.error || 'No response from OpenAI proxy');
    }

    return response.data;
  }

  async getServiceInfo(): Promise<{ status: string; model: string; initialized: boolean }> {
    return {
      status: this.initialized ? 'ready' : 'not initialized',
      model: this.deploymentName,
      initialized: this.initialized
    };
  }

  async detectAnomalies(request: AnomalyDetectionRequest): Promise<AnomalyDetectionResponse> {
    const startTime = Date.now();
    if (!request.transactions || request.transactions.length === 0) {
      return {
        anomalies: [],
        totalAnalyzed: 0,
        processingTime: Date.now() - startTime
      };
    }

    try {
      // Prepare transaction data for analysis
      const transactionData = request.transactions.map(t => ({
        id: t.id,
        date: t.date.toISOString().split('T')[0],
        amount: t.amount,
        description: t.description,
        category: t.category,
        subcategory: t.subcategory,
        account: t.account,
        type: t.type
      }));

      const systemPrompt = `You are a financial fraud and anomaly detection expert. Analyze the provided transactions and identify any that seem unusual, suspicious, or anomalous based on patterns, amounts, merchants, frequencies, or other factors.

For each anomalous transaction, respond with ONLY a JSON array in this exact format:
[
  {
    "transactionId": "transaction_id_from_input",
    "anomalyType": "unusual_amount|unusual_merchant|unusual_category|unusual_frequency|suspicious_pattern",
    "severity": "low|medium|high",
    "confidence": 0.0-1.0,
    "reasoning": "Brief explanation of why this transaction is anomalous",
    "historicalContext": "Optional context about patterns or comparisons"
  }
]

Rules:
- Only flag transactions that are genuinely unusual or suspicious
- Consider transaction amounts relative to similar categories/merchants
- Look for unusual timing, frequency patterns, or merchant names
- Consider round numbers, suspicious merchant names, or unusual categories for amounts
- Be conservative - only flag clear anomalies with confidence > 0.6
- If no anomalies found, return empty array: []`;

      const userPrompt = `Analyze these transactions for anomalies:
${JSON.stringify(transactionData, null, 2)}`;

      const proxyRequest: OpenAIProxyRequest = {
        deployment: this.deploymentName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2000,
  temperature: 0
      };

  const response = await this.callOpenAIWithFallback(proxyRequest, { attemptsPerDeployment: 3, baseBackoffMs: 400 });
      
      if (!response.success || !response.data) {
        console.error('Anomaly detection proxy call failed:', response.error);
        return {
          anomalies: [],
          totalAnalyzed: request.transactions.length,
          processingTime: Date.now() - startTime
        };
      }

      const responseContent = response.data.choices[0]?.message?.content;
      if (!responseContent) {
        return {
          anomalies: [],
          totalAnalyzed: request.transactions.length,
          processingTime: Date.now() - startTime
        };
      }

      // Clean and parse the response
      const cleanedResponse = this.cleanAIResponse(responseContent);
      
      let anomalyData: any[] = [];
      try {
        const parsed = JSON.parse(cleanedResponse);
        anomalyData = Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        console.error('Error parsing anomaly detection response:', error);
        console.error('Raw response:', responseContent);
        // Return empty result if parsing fails
        return {
          anomalies: [],
          totalAnalyzed: request.transactions.length,
          processingTime: Date.now() - startTime
        };
      }

      // Map the results back to full transaction objects
      const anomalies: AnomalyResult[] = anomalyData
        .filter(item => item.confidence > 0.6) // Only include high-confidence anomalies
        .map(item => {
          const transaction = request.transactions.find(t => t.id === item.transactionId);
          if (!transaction) return null;

          return {
            transaction,
            anomalyType: item.anomalyType || 'suspicious_pattern',
            severity: item.severity || 'medium',
            confidence: typeof item.confidence === 'number' ? item.confidence : 0.7,
            reasoning: item.reasoning || 'Transaction flagged as anomalous',
            historicalContext: item.historicalContext
          };
        })
        .filter(Boolean) as AnomalyResult[];

      return {
        anomalies,
        totalAnalyzed: request.transactions.length,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Error detecting anomalies:', error);
      
      // Return empty result on error rather than throwing
      return {
        anomalies: [],
        totalAnalyzed: request.transactions.length,
        processingTime: Date.now() - startTime
      };
    }
  }

  async makeRequest(prompt: string, maxTokens: number = 1000): Promise<string> {
    try {
      const proxyRequest: OpenAIProxyRequest = {
        deployment: this.deploymentName,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
  temperature: 0
      };

  const response = await this.callOpenAIWithFallback(proxyRequest, { attemptsPerDeployment: 3, baseBackoffMs: 400 });
      
      if (!response.success || !response.data) {
        throw new Error(response.error || 'No response from OpenAI proxy');
      }

      const responseContent = response.data.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response content from OpenAI proxy');
      }

      return responseContent.trim();
    } catch (error) {
      console.error('Error making OpenAI proxy request:', error);
      throw error;
    }
  }

  private extractKeyTokens(transactionText: string): string[] {
    // Extract meaningful tokens that help explain the classification
    const text = transactionText.toLowerCase();
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were']);
    
    // Split by various delimiters and filter meaningful tokens
    const tokens = text
      .split(/[\s\-#@.,;:()/\\]+/)
      .filter(token => 
        token.length >= 2 && 
        !commonWords.has(token) &&
        !token.match(/^\d+$/) && // Skip pure numbers
        token.match(/^[a-zA-Z0-9]+$/) // Keep alphanumeric only
      )
      .slice(0, 8); // Limit to 8 key tokens
    
    return tokens;
  }

  private cleanAIResponse(response: string): string {
    let cleaned = response.trim();
    
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '');
    }
    
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/\s*```$/, '');
    }
    
    return cleaned.trim();
  }

  /**
   * Extract account information from a bank statement using AI
   */
  async extractAccountInfoFromStatement(request: AccountStatementAnalysisRequest): Promise<AccountStatementAnalysisResponse> {
    const startTime = Date.now();
    
    try {
  // Assess readability/quality of provided content to tailor prompt behavior
      const raw = (request.fileContent || '').slice(0, 4000);
      const filterPrintable = (s: string) => {
        let out = '';
        for (let i = 0; i < s.length; i++) {
          const code = s.charCodeAt(i);
          if ((code >= 0x20 && code <= 0x7e) || code === 0x09 || code === 0x0a || code === 0x0d) {
            out += s[i];
          }
        }
        return out;
      };
      const printable = filterPrintable(raw);
  const lettersDigits = (printable.match(/[A-Za-z0-9]/g) || []).length;
  const qualityRatio = printable.length > 0 ? lettersDigits / printable.length : 0;
  const lowReadable = printable.length < 200 || qualityRatio < 0.35;

  const contentPreview = (lowReadable ? printable : raw).slice(0, 3000);

  const systemPrompt = `You are a financial document analyzer that extracts account information from bank statements.
Analyze the provided document content and extract key account details. Return ONLY a JSON object with this exact schema:

{
  "accountName": "name of the account or null",
  "institution": "name of the bank/financial institution or null", 
  "accountType": "checking|savings|credit|investment|cash or null",
  "currency": "currency code (USD, EUR, etc.) or null",
  "balance": number or null,
  "balanceDate": "YYYY-MM-DD date string or null",
  "maskedAccountNumber": "Ending in XXX format or null",
  "confidence": 0.0-1.0,
  "reasoning": "detailed explanation of extraction decisions",
  "extractedFields": ["list of fields successfully extracted"]
}

CRITICAL SECURITY RULES:
- NEVER include full account numbers in any field
- For maskedAccountNumber, use format "Ending in XXX" where XXX is only the last 3 digits
- If you see a full account number, extract only the last 3 digits
- If no account number is visible, set maskedAccountNumber to null

Guidelines:
- Look for account names like "Primary Checking", "Savings Account", etc.
- Institution names are usually at the top of statements
- Account types can be inferred from context (checking, savings, credit card, etc.)
- Balance is typically shown as current balance, ending balance, or statement balance
- Date should be the statement date or balance as-of date
- Set confidence based on clarity and completeness of extracted information
- Only include fields in extractedFields array that have non-null values
- If the provided content appears truncated or unreadable (common for PDFs/images), do NOT claim it is encrypted or corrupted. Instead, base your output primarily on the filename and any readable snippets, and set confidence accordingly (likely low).`;

  const userPrompt = `Document to analyze:
File name: ${request.fileName}
File type: ${request.fileType}

${lowReadable ? 'Note: Minimal readable text was available from this file in the browser. Use the filename and any readable snippets below. Avoid saying the file is encrypted/corrupted; instead mention insufficient readable text if applicable.\n\n' : ''}
Content (filtered preview up to 3000 chars):
${contentPreview}

Extract the account information following the security guidelines.`;

      const proxyRequest: OpenAIProxyRequest = {
        deployment: this.deploymentName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 500,
  temperature: 0
      };

  const response = await this.callOpenAIWithFallback(proxyRequest, { attemptsPerDeployment: 3, baseBackoffMs: 350 });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'No response from OpenAI proxy');
      }

      const responseContent = response.data.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response content from OpenAI proxy');
      }

      const cleanedResponse = this.cleanAIResponse(responseContent);
      const parsed = JSON.parse(cleanedResponse);

      // Validate and sanitize the response
      const result: AccountStatementAnalysisResponse = {
        accountName: this.sanitizeString(parsed.accountName),
        institution: this.sanitizeString(parsed.institution),
        accountType: this.validateAccountType(parsed.accountType),
        currency: this.sanitizeCurrency(parsed.currency),
        balance: this.sanitizeNumber(parsed.balance),
        balanceDate: this.sanitizeDate(parsed.balanceDate),
        maskedAccountNumber: this.validateMaskedAccountNumber(parsed.maskedAccountNumber),
        confidence: Math.min(Math.max(parsed.confidence || 0, 0), 1),
        reasoning: parsed.reasoning || 'Account information extracted from statement',
        extractedFields: Array.isArray(parsed.extractedFields) ? parsed.extractedFields : []
      };

      // Normalize reasoning to avoid undesirable phrasing
      result.reasoning = this.sanitizeReasoning(result.reasoning || '', lowReadable);

      console.log(`🏦 Account extraction completed in ${Date.now() - startTime}ms with confidence ${result.confidence}`);
      return result;

    } catch (error) {
      console.error('Error extracting account info from statement:', error);
      
      return {
        confidence: 0,
        reasoning: 'Failed to extract account information from statement: ' + (error instanceof Error ? error.message : 'Unknown error'),
        extractedFields: []
      };
    }
  }

  private sanitizeReasoning(reasoning: string, lowReadable: boolean): string {
    const lower = reasoning.toLowerCase();
    const flagged = ['encrypted', 'unreadable', 'corrupted', 'gibberish', 'nonsensical'];
    const containsFlagged = flagged.some(w => lower.includes(w));
    if (containsFlagged || lowReadable) {
      // Replace with neutral, user-friendly guidance
      return 'Insufficient readable text was available from this file in the browser context. The analysis relied on the filename and any readable snippets; confidence is adjusted accordingly.';
    }
    return reasoning;
  }

  private sanitizeString(value: any): string | undefined {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return undefined;
  }

  private validateAccountType(value: any): 'checking' | 'savings' | 'credit' | 'investment' | 'cash' | undefined {
    const validTypes = ['checking', 'savings', 'credit', 'investment', 'cash'];
    if (typeof value === 'string' && validTypes.includes(value.toLowerCase())) {
      return value.toLowerCase() as 'checking' | 'savings' | 'credit' | 'investment' | 'cash';
    }
    return undefined;
  }

  private sanitizeCurrency(value: any): string | undefined {
    if (typeof value === 'string' && /^[A-Z]{3}$/.test(value.toUpperCase())) {
      return value.toUpperCase();
    }
    return undefined;
  }

  private sanitizeNumber(value: any): number | undefined {
    if (typeof value === 'number' && !isNaN(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const num = parseFloat(value.replace(/[,$\s]/g, ''));
      if (!isNaN(num)) {
        return num;
      }
    }
    return undefined;
  }

  private sanitizeDate(value: any): Date | undefined {
    if (!value) return undefined;
    
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch {
      // Continue to return undefined
    }
    return undefined;
  }

  private validateMaskedAccountNumber(value: any): string | undefined {
    if (value === null || value === undefined) return undefined;

    // Normalize any provided value into a string and extract digits only
    const digitsOnly = String(value).match(/\d/g)?.join('') || '';

    // Require at least 3 digits to form a safe mask; otherwise skip
    if (digitsOnly.length >= 3) {
      const last3 = digitsOnly.slice(-3);
      // Always return canonical “Ending in XXX” with only last 3 digits
      return `Ending in ${last3}`;
    }

    // No sufficient digits to safely represent; omit instead of logging raw input
    return undefined;
  }
}

// Export singleton instance
export const azureOpenAIService = new AzureOpenAIService();