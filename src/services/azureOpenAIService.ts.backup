import OpenAI from 'openai';
import { defaultConfig } from '../config/appConfig';
import { AIClassificationRequest, AIClassificationResponse } from '../types';

// Azure Function configuration
const AZURE_FUNCTION_URL = 'https://mortongroupaicred-hugxh8drhqabbphb.canadacentral-01.azurewebsites.net/api/openai/config';

interface AzureOpenAIConfig {
  endpoint: string;
  apiKey: string;
}

async function getOpenAIConfig(): Promise<AzureOpenAIConfig> {
  // First, try to get from environment variables (fallback for CORS issues)
  const envEndpoint = process.env.REACT_APP_AZURE_OPENAI_ENDPOINT;
  const envApiKey = process.env.REACT_APP_AZURE_OPENAI_API_KEY;
  
  if (envEndpoint && envApiKey && 
      envEndpoint !== 'YOUR_AZURE_OPENAI_ENDPOINT' && 
      envApiKey !== 'YOUR_AZURE_OPENAI_API_KEY') {
    console.log('Using Azure OpenAI config from environment variables');
    return { 
      endpoint: envEndpoint, 
      apiKey: envApiKey 
    };
  }

  // Try to fetch from Azure Function
  try {
    console.log('Fetching Azure OpenAI config from:', AZURE_FUNCTION_URL);
    const response = await fetch(AZURE_FUNCTION_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Azure Function response:', result);
    
    if (result.success && result.data) {
      const { endpoint, apiKey } = result.data;
      if (!endpoint || !apiKey) {
        throw new Error('Missing endpoint or apiKey in Azure Function response');
      }
      console.log('Successfully retrieved Azure OpenAI config from Azure Function');
      return { endpoint, apiKey };
    }
    
    throw new Error(`Azure Function returned error: ${result.error || 'Unknown error'}`);
  } catch (error) {
    console.error('Failed to fetch Azure OpenAI config from Azure Function:', error);
    
    // CORS error guidance
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error(`
      🚫 CORS Error: Azure Function blocked by browser security policy
      
      To fix this, configure CORS in your Azure Function:
      1. Go to Azure Portal → Your Function App → CORS
      2. Add these allowed origins:
         - http://localhost:3000
         - http://localhost:3001
         - http://localhost:3001
      
      Alternatively, set environment variables in .env:
         REACT_APP_AZURE_OPENAI_ENDPOINT=your_endpoint
         REACT_APP_AZURE_OPENAI_API_KEY=your_key
      `);
    }
    
    throw new Error(`Failed to get OpenAI config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export class AzureOpenAIService {
  private client: OpenAI | null = null;
  private readonly deploymentName: string;
  private initialized = false;

  constructor() {
    this.deploymentName = defaultConfig.azure.openai.deploymentName || 'gpt-4o';
  }

  private async initializeClient(): Promise<void> {
    if (this.initialized && this.client) {
      console.log('Azure OpenAI client already initialized');
      return;
    }

    try {
      console.log('Initializing Azure OpenAI client...');
      const config = await getOpenAIConfig();
      
      const baseURL = `${config.endpoint}/openai/deployments/${this.deploymentName}`;
      console.log('Setting up OpenAI client with baseURL:', baseURL);
      
      this.client = new OpenAI({
        apiKey: config.apiKey,
        baseURL,
        defaultQuery: { 'api-version': '2024-02-15-preview' },
        defaultHeaders: {
          'api-key': config.apiKey,
        },
        dangerouslyAllowBrowser: true, // Required for React app to call Azure OpenAI directly
      });
      
      this.initialized = true;
      console.log('Azure OpenAI client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Azure OpenAI client:', error);
      this.initialized = false;
      this.client = null;
      throw new Error(`Unable to connect to Azure OpenAI service: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async classifyTransaction(request: AIClassificationRequest): Promise<AIClassificationResponse> {
    await this.initializeClient();
    
    if (!this.client) {
      throw new Error('Azure OpenAI client not initialized');
    }

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
  "reasoning": "brief explanation"
}

Rules:
- Use EXACT ids from the catalog below (do not invent or transform ids or names)
- If unsure, set subcategoryId to null
- If you cannot determine a category confidently, set categoryId to "uncategorized" and confidence <= 0.3`;

      const userPrompt = `Classify this transaction using ONLY the following catalog:
Allowed Categories Catalog (ids and names):
[
${categoriesCatalog}
]

Transaction:
Description: ${request.transactionText}
Amount: $${request.amount}
Date: ${request.date}`;

      const completion = await this.client.chat.completions.create({
        model: this.deploymentName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 200,
        temperature: 0.1
      });

  const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response from Azure OpenAI');
      }

      // Clean the response to handle markdown code blocks
      const cleanedResponse = this.cleanAIResponse(responseContent);
  const parsed = JSON.parse(cleanedResponse);

  // Normalize keys and provide safe defaults
  const categoryId = (parsed.categoryId || parsed.category || 'uncategorized') as string;
  const subcategoryId = (parsed.subcategoryId || parsed.subcategory || null) as string | null;
  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
  const reasoning = (parsed.reasoning || 'AI classification') as string;

  return { categoryId, subcategoryId: subcategoryId || undefined, confidence, reasoning };
    } catch (error) {
      console.error('Error classifying transaction:', error);
      
      return {
        categoryId: 'uncategorized',
        confidence: 0.1,
        reasoning: 'Failed to classify using AI - using fallback'
      };
    }
  }

  // New: batch classification to reduce API calls and speed up imports
  async classifyTransactionsBatch(
    requests: AIClassificationRequest[]
  ): Promise<AIClassificationResponse[]> {
    await this.initializeClient();
    if (!this.client) {
      throw new Error('Azure OpenAI client not initialized');
    }

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

  const userPrompt = `Allowed Categories Catalog (ids and names):\n[\n${categoriesCatalog}\n]\n\nTransactions (classify in this same order). Include the same \"index\" in each output object to align results:\n${JSON.stringify(items, null, 2)}`;

      const completion = await this.client.chat.completions.create({
        model: this.deploymentName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1200,
        temperature: 0.1
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) throw new Error('No response from Azure OpenAI');

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

      // Normalize 1:1
      return parsed.map((p) => {
        const categoryId = (p?.categoryId || p?.category || 'uncategorized') as string;
        const subcategoryId = (p?.subcategoryId || p?.subcategory || null) as string | null;
        const confidence = typeof p?.confidence === 'number' ? p.confidence : 0.5;
        const reasoning = (p?.reasoning || 'AI classification') as string;
        return { categoryId, subcategoryId: subcategoryId || undefined, confidence, reasoning };
      });
    } catch (error) {
      console.error('Error in batch classification:', error);
      return requests.map(() => ({ categoryId: 'uncategorized', confidence: 0.1, reasoning: 'Batch classification failed' }));
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      console.log('Testing Azure OpenAI connection...');
      await this.initializeClient();
    } catch (error) {
      console.error('Failed to initialize client for connection test:', error);
      return false;
    }
    
    if (!this.client) {
      console.log('Connection test failed: client not initialized');
      return false;
    }

    try {
      console.log('Sending test message to Azure OpenAI...');
      const completion = await this.client.chat.completions.create({
        model: this.deploymentName,
        messages: [
          { role: 'user', content: 'Hello, please respond with "OK" if you can read this.' }
        ],
        max_tokens: 10,
        temperature: 0
      });

      const response = completion.choices[0]?.message?.content;
      console.log('Azure OpenAI test response:', response);
      return response?.includes('OK') || false;
    } catch (error) {
      console.error('Azure OpenAI connection test failed:', error);
      return false;
    }
  }

  async generateChatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: {
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    await this.initializeClient();
    
    if (!this.client) {
      throw new Error('Azure OpenAI client not initialized');
    }

    return await this.client.chat.completions.create({
      model: this.deploymentName,
      messages,
      max_tokens: options?.maxTokens || 500,
      temperature: options?.temperature || 0.1
    });
  }

  async getServiceInfo(): Promise<{ status: string; model: string; initialized: boolean }> {
    return {
      status: this.initialized ? 'ready' : 'not initialized',
      model: this.deploymentName,
      initialized: this.initialized
    };
  }

  async makeRequest(prompt: string, maxTokens: number = 1000): Promise<string> {
    await this.initializeClient();
    
    if (!this.client) {
      throw new Error('Azure OpenAI client not initialized');
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: this.deploymentName,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.1
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response from Azure OpenAI');
      }

      return responseContent.trim();
    } catch (error) {
      console.error('Error making Azure OpenAI request:', error);
      throw error;
    }
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
