import { Account } from '../types';
import { defaultAccounts, accountDetectionPatterns } from '../data/defaultAccounts';
import { AzureOpenAIService } from './azureOpenAIService';

export interface AccountDetectionRequest {
  fileName: string;
  fileContent?: string;
  sampleTransactions?: Array<{
    description: string;
    amount: number;
    date: string;
  }>;
}

export interface AccountDetectionResponse {
  detectedAccountId?: string;
  confidence: number;
  reasoning: string;
  suggestedAccounts: Array<{
    accountId: string;
    confidence: number;
    reasoning: string;
  }>;
}

export class AccountManagementService {
  private azureOpenAIService: AzureOpenAIService;
  private accounts: Account[] = [...defaultAccounts];

  constructor() {
    this.azureOpenAIService = new AzureOpenAIService();
  }

  // Get all active accounts
  getAccounts(): Account[] {
    return this.accounts.filter(account => account.isActive);
  }

  // Get account by ID
  getAccount(id: string): Account | undefined {
    return this.accounts.find(account => account.id === id);
  }

  // Add a new account
  addAccount(account: Omit<Account, 'id'>): Account {
    const newAccount: Account = {
      ...account,
      id: this.generateAccountId(account.name, account.institution)
    };
    
    this.accounts.push(newAccount);
    return newAccount;
  }

  // Update existing account
  updateAccount(id: string, updates: Partial<Account>): Account | null {
    const index = this.accounts.findIndex(account => account.id === id);
    if (index === -1) return null;

    this.accounts[index] = { ...this.accounts[index], ...updates };
    return this.accounts[index];
  }

  // Detect account from file information
  async detectAccountFromFile(request: AccountDetectionRequest): Promise<AccountDetectionResponse> {
    // First try pattern-based detection
    const patternResult = this.detectAccountByPatterns(request.fileName);
    
    if (patternResult.confidence > 0.8) {
      return {
        detectedAccountId: patternResult.accountId,
        confidence: patternResult.confidence,
        reasoning: `High confidence match based on filename pattern: "${request.fileName}"`,
        suggestedAccounts: []
      };
    }

    // If pattern detection fails or has low confidence, use AI
    try {
      const aiResult = await this.detectAccountWithAI(request);
      
      // Combine pattern and AI results
      const combinedSuggestions = this.combineDetectionResults(patternResult, aiResult);
      
      return {
        detectedAccountId: combinedSuggestions.length > 0 ? combinedSuggestions[0].accountId : undefined,
        confidence: combinedSuggestions.length > 0 ? combinedSuggestions[0].confidence : 0,
        reasoning: combinedSuggestions.length > 0 ? combinedSuggestions[0].reasoning : 'Could not detect account automatically',
        suggestedAccounts: combinedSuggestions
      };
    } catch (error) {
      console.warn('AI account detection failed, falling back to pattern matching:', error);
      
      return {
        detectedAccountId: patternResult.confidence > 0.5 ? patternResult.accountId : undefined,
        confidence: patternResult.confidence,
        reasoning: patternResult.confidence > 0.5 
          ? `Pattern-based match: "${request.fileName}"` 
          : 'Could not detect account automatically',
        suggestedAccounts: []
      };
    }
  }

  private detectAccountByPatterns(fileName: string): { accountId?: string; confidence: number } {
    const normalizedFileName = fileName.toLowerCase();
    
    for (const [accountId, patterns] of Object.entries(accountDetectionPatterns)) {
      for (const pattern of patterns) {
        if (normalizedFileName.includes(pattern.toLowerCase())) {
          // Higher confidence for more specific patterns
          const confidence = pattern.length > 10 ? 0.9 : 0.7;
          return { accountId, confidence };
        }
      }
    }
    
    return { confidence: 0 };
  }

  private async detectAccountWithAI(request: AccountDetectionRequest): Promise<Array<{
    accountId: string;
    confidence: number;
    reasoning: string;
  }>> {
    const availableAccounts = this.getAccounts();
    
    const systemPrompt = `You are a financial data analyst that helps detect which bank account a file belongs to based on file names and transaction data.

Available accounts:
${availableAccounts.map(acc => `- ${acc.id}: ${acc.name} (${acc.type}) at ${acc.institution}`).join('\n')}

Analyze the provided information and return ONLY a JSON array with account suggestions:
[
  {
    "accountId": "account_id",
    "confidence": 0.85,
    "reasoning": "brief explanation"
  }
]

Rules:
- Confidence should be 0-1 (1 being most confident)
- Only suggest accounts with confidence > 0.3
- Maximum 3 suggestions
- Consider institution names, account types, and transaction patterns`;

    const userPrompt = `File name: "${request.fileName}"
${request.sampleTransactions ? `
Sample transactions:
${request.sampleTransactions.map(t => `- ${t.description} | $${t.amount} | ${t.date}`).join('\n')}
` : ''}`;

    try {
      const completion = await this.azureOpenAIService.generateChatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], {
        maxTokens: 300,
        temperature: 0.1
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response from Azure OpenAI');
      }

      const suggestions = JSON.parse(responseContent.trim());
      
      // Validate suggestions
      return suggestions.filter((s: any) => 
        s.accountId && 
        s.confidence >= 0.3 && 
        availableAccounts.some(acc => acc.id === s.accountId)
      );

    } catch (error) {
      console.error('Error in AI account detection:', error);
      return [];
    }
  }

  private combineDetectionResults(
    patternResult: { accountId?: string; confidence: number },
    aiResults: Array<{ accountId: string; confidence: number; reasoning: string }>
  ): Array<{ accountId: string; confidence: number; reasoning: string }> {
    const combined = [...aiResults];
    
    // If pattern detection found something, boost its confidence or add it
    if (patternResult.accountId && patternResult.confidence > 0) {
      const existingIndex = combined.findIndex(r => r.accountId === patternResult.accountId);
      
      if (existingIndex >= 0) {
        // Boost confidence if AI also detected it
        combined[existingIndex].confidence = Math.min(1, combined[existingIndex].confidence + 0.2);
        combined[existingIndex].reasoning += ' (Pattern match confirmed)';
      } else {
        // Add pattern result if AI didn't detect it
        combined.push({
          accountId: patternResult.accountId,
          confidence: patternResult.confidence,
          reasoning: 'Filename pattern match'
        });
      }
    }
    
    // Sort by confidence (highest first)
    return combined.sort((a, b) => b.confidence - a.confidence);
  }

  private generateAccountId(name: string, institution: string): string {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const cleanInstitution = institution.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `${cleanInstitution}-${cleanName}`;
  }
}

// Singleton instance
export const accountManagementService = new AccountManagementService();
