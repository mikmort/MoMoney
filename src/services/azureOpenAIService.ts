import { defaultConfig } from '../config/appConfig';
import { AIClassificationRequest, AIClassificationResponse, AnomalyDetectionRequest, AnomalyDetectionResponse, AnomalyResult } from '../types';

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
}

export class AzureOpenAIService {
  private readonly deploymentName: string;
  private initialized = true; // Always initialized since we don't need client setup

  constructor() {
    this.deploymentName = defaultConfig.azure.openai.deploymentName || 'gpt-4o';
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

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: OpenAIProxyResponse = await response.json();
      return result;
    } catch (error) {
      console.error('Error calling OpenAI proxy:', error);
      throw error;
    }
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
        temperature: 0.1
      };

      const response = await this.callOpenAIProxy(proxyRequest);

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

    try {
      // Assume same categories set for the batch (common in our import flow)
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

      const systemPrompt = `You are a financial transaction classifier. Classify a list of transactions.
Return ONLY a JSON array with the EXACT SAME NUMBER OF ITEMS as the input list, in the SAME ORDER.
Each element must strictly match (you may include an "index" number copied from the input to preserve order):
{
  "categoryId": "one of the allowed category ids",
  "subcategoryId": "one of the allowed subcategory ids for the chosen category or null",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}
Rules:
- Use EXACT ids from the catalog below
- Do not invent ids or names
- If unsure, set subcategoryId to null
- If you cannot determine confidently, set categoryId to "uncategorized" and confidence <= 0.3`;

      const items = requests.map((r, idx) => ({
        index: idx,
        description: r.transactionText,
        amount: r.amount,
        date: r.date
      }));

      const userPrompt = `Allowed Categories Catalog (ids and names):\n[\n${categoriesCatalog}\n]\n\nTransactions (classify in this same order). Include the same "index" in each output object to align results:\n${JSON.stringify(items, null, 2)}`;

      const proxyRequest: OpenAIProxyRequest = {
        deployment: this.deploymentName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1200,
        temperature: 0.1
      };

      const response = await this.callOpenAIProxy(proxyRequest);

      if (!response.success || !response.data) {
        throw new Error(response.error || 'No response from OpenAI proxy');
      }

      const responseContent = response.data.choices[0]?.message?.content;
      if (!responseContent) throw new Error('No response content from OpenAI proxy');

      // Attempt robust parsing: direct JSON, then extract first JSON array substring, then object.results
      const cleaned = this.cleanAIResponse(responseContent);

      const tryParseArray = (text: string): any[] | null => {
        try {
          const j = JSON.parse(text);
          if (Array.isArray(j)) return j;
          if (j && Array.isArray(j.results)) return j.results;
        } catch {}
        // Try to extract the first JSON array block
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1 && end > start) {
          const slice = text.slice(start, end + 1);
          try {
            const j = JSON.parse(slice);
            if (Array.isArray(j)) return j;
          } catch {}
        }
        return null;
      };

      let parsed: any[] | null = tryParseArray(cleaned);
      if (!parsed) {
        console.warn('Batch parse failed (no JSON array found). Falling back to per-item classification.');
        // Fallback: classify each item individually to avoid blanket Uncategorized
        const singles = [] as AIClassificationResponse[];
        for (const r of requests) {
          try {
            const one = await this.classifyTransaction(r);
            singles.push(one);
          } catch (e) {
            singles.push({ categoryId: 'uncategorized', confidence: 0.1, reasoning: 'Single fallback failed' });
          }
        }
        return singles;
      }

      // If the array length mismatches, try to reorder by index field or pad via single calls
      if (parsed.length !== requests.length) {
        // Attempt to sort by an 'index' property if provided
        if (parsed.every((p) => typeof p?.index === 'number')) {
          parsed.sort((a, b) => (a.index as number) - (b.index as number));
        }

        if (parsed.length !== requests.length) {
          console.warn(`Batch length mismatch: got ${parsed.length}, expected ${requests.length}. Filling via single fallbacks for missing.`);
          const results: AIClassificationResponse[] = [];
          for (let i = 0; i < requests.length; i++) {
            const p = parsed[i];
            if (p) {
              const categoryId = (p.categoryId || p.category || 'uncategorized') as string;
              const subcategoryId = (p.subcategoryId || p.subcategory || null) as string | null;
              const confidence = typeof p.confidence === 'number' ? p.confidence : 0.5;
              const reasoning = (p.reasoning || 'AI classification') as string;
              results.push({ categoryId, subcategoryId: subcategoryId || undefined, confidence, reasoning });
            } else {
              // Fallback classify for this item
              try {
                results.push(await this.classifyTransaction(requests[i]));
              } catch {
                results.push({ categoryId: 'uncategorized', confidence: 0.1, reasoning: 'Missing batch item' });
              }
            }
          }
          return results;
        }
      }

      // Normalize 1:1 then constrain to catalog
      return parsed.map((p) => {
        const normalized = {
          categoryId: (p?.categoryId || p?.category || 'uncategorized') as string,
          subcategoryId: (p?.subcategoryId || p?.subcategory || null) as string | null,
          confidence: typeof p?.confidence === 'number' ? p.confidence : 0.5,
          reasoning: (p?.reasoning || 'AI classification') as string
        };
        return this.constrainToCatalog(normalized, categories as any);
      });
    } catch (error) {
      console.error('Error in batch classification:', error);
      return requests.map(() => ({ categoryId: 'uncategorized', confidence: 0.1, reasoning: 'Batch classification failed' }));
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

      const response = await this.callOpenAIProxy(proxyRequest);
      
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
      temperature: options?.temperature || 0.1
    };

    const response = await this.callOpenAIProxy(proxyRequest);
    
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
        temperature: 0.2
      };

      const response = await this.callOpenAIProxy(proxyRequest);
      
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
        temperature: 0.1
      };

      const response = await this.callOpenAIProxy(proxyRequest);
      
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
}

// Export singleton instance
export const azureOpenAIService = new AzureOpenAIService();