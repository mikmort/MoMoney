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
  const response = await fetch(AZURE_FUNCTION_URL);
  const result = await response.json();
  
  if (result.success) {
    const { endpoint, apiKey } = result.data;
    return { endpoint, apiKey };
  }
  throw new Error('Failed to get OpenAI config');
}

export class AzureOpenAIService {
  private client: OpenAI | null = null;
  private readonly deploymentName: string;
  private initialized = false;

  constructor() {
    this.deploymentName = defaultConfig.azure.openai.deploymentName || 'gpt-4';
  }

  private async initializeClient(): Promise<void> {
    if (this.initialized && this.client) return;

    try {
      const config = await getOpenAIConfig();
      this.client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: `${config.endpoint}/openai/deployments/${this.deploymentName}`,
        defaultQuery: { 'api-version': '2024-02-15-preview' },
        defaultHeaders: {
          'api-key': config.apiKey,
        },
      });
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Azure OpenAI client:', error);
      throw new Error('Unable to connect to Azure OpenAI service');
    }
  }

  async classifyTransaction(request: AIClassificationRequest): Promise<AIClassificationResponse> {
    await this.initializeClient();
    
    if (!this.client) {
      throw new Error('Azure OpenAI client not initialized');
    }

    try {
      const systemPrompt = `You are a financial transaction classifier. Analyze transactions and return ONLY a JSON object with this structure:
{
  "categoryId": "category_id",
  "subcategoryId": "subcategory_id_or_null",
  "confidence": 0.95,
  "reasoning": "brief explanation"
}`;

      const userPrompt = `Classify this transaction:
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

      const parsed = JSON.parse(responseContent.trim());
      
      return {
        categoryId: parsed.categoryId,
        subcategoryId: parsed.subcategoryId,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning
      };
    } catch (error) {
      console.error('Error classifying transaction:', error);
      
      return {
        categoryId: 'other',
        subcategoryId: 'misc',
        confidence: 0.1,
        reasoning: 'Failed to classify using AI - using fallback'
      };
    }
  }

  async testConnection(): Promise<boolean> {
    await this.initializeClient();
    
    if (!this.client) {
      return false;
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: this.deploymentName,
        messages: [
          { role: 'user', content: 'Hello, please respond with "OK" if you can read this.' }
        ],
        max_tokens: 10,
        temperature: 0
      });

      return completion.choices[0]?.message?.content?.includes('OK') || false;
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
}

// Export singleton instance
export const azureOpenAIService = new AzureOpenAIService();
