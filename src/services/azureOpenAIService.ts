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
      const systemPrompt = `You are an expert financial transaction classifier with knowledge of European banking formats. 
Analyze transactions and return ONLY a clean JSON object with this exact structure:
{
  "category": "exact_category_name",
  "subcategory": "exact_subcategory_name_or_null",
  "confidence": 0.85,
  "reasoning": "brief explanation"
}

CLASSIFICATION GUIDELINES:
1. If you can confidently identify the transaction category (confidence >= 0.7), use the most appropriate category
2. If unclear, ambiguous, or confidence < 0.7, use "Uncategorized" 
3. For "Uncategorized": use subcategory "Miscellaneous" for unclear transactions or "Pending Review" for those needing human attention
4. European formats: DD.MM.YYYY dates, amounts with periods as thousands separators and commas as decimals
5. Be conservative - better to mark as uncategorized than guess incorrectly

Available categories: ${request.availableCategories.map(c => `${c.name} (${c.type})`).join(', ')}
Available subcategories: ${request.availableSubcategories.map(s => s.name).join(', ')}`;

      const userPrompt = `Classify this European banking transaction:
Description: "${request.transactionText}"
Amount: ${request.amount}
Date: ${request.date}

Return ONLY the JSON object without any markdown formatting or code blocks.`;

      const completion = await this.client.chat.completions.create({
        model: this.deploymentName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 300,
        temperature: 0.1
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response from Azure OpenAI');
      }

      // Use enhanced cleanAIResponse method
      const cleanedResponse = this.cleanAIResponse(responseContent);
      const parsed = JSON.parse(cleanedResponse);
      
      // Apply 70% confidence threshold
      const confidence = parsed.confidence || 0.5;
      if (confidence < 0.7) {
        return {
          category: 'Uncategorized',
          subcategory: 'Pending Review',
          confidence: confidence,
          reasoning: `Low confidence (${Math.round(confidence * 100)}%) - requires manual review: ${parsed.reasoning || 'AI classification uncertain'}`
        };
      }
      
      return {
        category: parsed.category || 'Uncategorized',
        subcategory: parsed.subcategory || null,
        confidence: confidence,
        reasoning: parsed.reasoning || 'AI classification with high confidence'
      };
    } catch (error) {
      console.error('Error classifying transaction:', error);
      
      return {
        category: 'Uncategorized',
        subcategory: 'Miscellaneous',
        confidence: 0.1,
        reasoning: 'AI classification failed - using fallback'
      };
    }
  }

  // Enhanced method to clean AI responses that may have markdown formatting
  private cleanAIResponse(response: string): string {
    let cleaned = response.trim();
    
    // Remove markdown code block formatting
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '');
    }
    
    // Remove closing ``` markers
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/\s*```$/, '');
    }
    
    // Remove any additional whitespace or newlines
    cleaned = cleaned.trim();
    
    // Find JSON object in response if there's extra text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    return cleaned;
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
}

// Export singleton instance
export const azureOpenAIService = new AzureOpenAIService();
