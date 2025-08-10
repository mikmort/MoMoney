import { Account, AccountStatementAnalysisResponse } from '../types';
import * as XLSX from 'xlsx';
import { defaultAccounts, accountDetectionPatterns } from '../data/defaultAccounts';
import { AzureOpenAIService } from './azureOpenAIService';

// Import dataService for validation
let dataService: any = null;
const getDataService = async () => {
  if (!dataService) {
    const { dataService: ds } = await import('./dataService');
    dataService = ds;
  }
  return dataService;
};

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
  private readonly storageKey = 'mo-money-accounts';

  constructor() {
    this.azureOpenAIService = new AzureOpenAIService();
    this.loadFromStorage();
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
    // Defensive: ensure any provided maskedAccountNumber is canonical (Ending in XXX)
    const sanitizeMask = (val: any): string | undefined => {
      const digits = String(val ?? '').match(/\d/g)?.join('') || '';
      return digits.length >= 3 ? `Ending in ${digits.slice(-3)}` : undefined;
    };

    const newAccount: Account = {
      ...account,
      maskedAccountNumber: sanitizeMask((account as any).maskedAccountNumber),
      id: this.generateAccountId(account.name, account.institution)
    };
    
    this.accounts.push(newAccount);

    this.saveToStorage();

    return newAccount;
  }

  // Update existing account
  updateAccount(id: string, updates: Partial<Account>): Account | null {
    const index = this.accounts.findIndex(account => account.id === id);
    if (index === -1) return null;

    const sanitizeMask = (val: any): string | undefined => {
      const digits = String(val ?? '').match(/\d/g)?.join('') || '';
      return digits.length >= 3 ? `Ending in ${digits.slice(-3)}` : undefined;
    };

    this.accounts[index] = { ...this.accounts[index], ...updates, maskedAccountNumber: sanitizeMask(updates.maskedAccountNumber ?? this.accounts[index].maskedAccountNumber) };
    this.saveToStorage();
    return this.accounts[index];
  }


  // Delete account
  async deleteAccount(id: string): Promise<boolean> {
    const account = this.getAccount(id);
    if (!account) return false;

    // Check if account has associated transactions
    try {
      const ds = await getDataService();
      const transactions = await ds.getAllTransactions();
      const accountTransactions = transactions.filter((t: any) => 
        t.account === account.name || t.account === account.id
      );

      if (accountTransactions.length > 0) {
        throw new Error(`Cannot delete account "${account.name}". It has ${accountTransactions.length} associated transaction(s).`);
      }

      // If no transactions, proceed with deletion
      const index = this.accounts.findIndex(account => account.id === id);
      if (index === -1) return false;

      this.accounts.splice(index, 1);
      this.saveToStorage();
      return true;
    } catch (error) {
      console.error('Error checking account transactions:', error);
      throw error;
    }
  }


  // Replace all accounts (used for import)
  replaceAccounts(accounts: Account[]): void {
    this.accounts = [...accounts];
    this.saveToStorage();
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

    const combinedPrompt = `${systemPrompt}

${userPrompt}`;

    try {
      const responseContent = await this.azureOpenAIService.makeRequest(combinedPrompt, 300);
      if (!responseContent) {
        throw new Error('No response from Azure OpenAI');
      }

      // Clean the response to handle markdown code blocks
      const cleanedResponse = this.cleanAIResponse(responseContent);
      let suggestions: any[] = [];
      try {
        const parsed = JSON.parse(cleanedResponse);
        suggestions = Array.isArray(parsed) ? parsed : (Array.isArray((parsed as any)?.results) ? (parsed as any).results : []);
      } catch {
        // If parsing fails (e.g., mocked non-JSON string), return no AI suggestions
        suggestions = [];
      }

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

  private generateAccountId(name: string, institution: string): string {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const cleanInstitution = institution.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `${cleanInstitution}-${cleanName}`;
  }

  // Persistence helpers
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.accounts = JSON.parse(stored);
      }
    } catch (err) {
      console.error('Failed to load accounts from storage:', err);
      // keep defaults
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.accounts));
    } catch (err) {
      console.error('Failed to save accounts to storage:', err);
    }
  }

  /**
   * Create a new account by analyzing an uploaded bank statement
   */
  async createAccountFromStatement(file: File): Promise<{
    success: boolean;
    account?: Account;
    analysis?: AccountStatementAnalysisResponse;
    error?: string;
  }> {
    try {
      console.log(`🏦 Creating account from statement: ${file.name}`);
      
  // Read file content for AI analysis (type-aware to avoid binary gibberish)
  const fileContent = await this.readStatementText(file);
      
      // Analyze the statement to extract account information
      const analysis = await this.azureOpenAIService.extractAccountInfoFromStatement({
        fileContent,
        fileName: file.name,
        fileType: this.getFileType(file.name) as 'pdf' | 'csv' | 'excel' | 'image'
      });

      console.log(`📊 Statement analysis completed with confidence: ${analysis.confidence}`);
      console.log(`📋 Extracted fields: ${analysis.extractedFields.join(', ')}`);

      // If confidence is too low, return for user review
      if (analysis.confidence < 0.3) {
        return {
          success: false,
          analysis,
          error: 'AI confidence too low to automatically create account. Please review and create manually.'
        };
      }

      // Create account from extracted information
      const accountData: Omit<Account, 'id'> = {
        name: analysis.accountName || `Account from ${file.name}`,
        type: analysis.accountType || 'checking',
        institution: analysis.institution || 'Unknown Institution',
        currency: analysis.currency || 'USD',
        balance: analysis.balance,
        historicalBalance: analysis.balance,
        historicalBalanceDate: analysis.balanceDate,
        maskedAccountNumber: analysis.maskedAccountNumber,
        lastSyncDate: new Date(),
        isActive: true
      };

      const newAccount = this.addAccount(accountData);
      
      console.log(`✅ Successfully created account: ${newAccount.id} (${newAccount.name})`);
      
      return {
        success: true,
        account: newAccount,
        analysis
      };

    } catch (error) {
      console.error('Error creating account from statement:', error);
      return {
        success: false,
        error: 'Failed to process statement: ' + (error instanceof Error ? error.message : 'Unknown error')
      };
    }
  }

  /**
   * Calculate current account balance based on historical balance and transactions
   */
  async calculateCurrentBalance(accountId: string): Promise<number | null> {
    const account = this.getAccount(accountId);
    if (!account) return null;

    // If we have a current balance that's more recent, use it
    if (account.balance !== undefined && (!account.historicalBalanceDate || 
        (account.lastSyncDate && account.lastSyncDate > account.historicalBalanceDate))) {
      return account.balance;
    }

    // If we have a historical balance, calculate current balance from it
    if (account.historicalBalance !== undefined && account.historicalBalanceDate) {
      try {
        const ds = await getDataService();
        const allTransactions = await ds.getAllTransactions();
        
        // Filter transactions for this account that are after the historical balance date
        const accountTransactions = allTransactions.filter((t: any) => 
          (t.account === account.name || t.account === account.id) &&
          t.date > account.historicalBalanceDate!
        );

        // Calculate balance change since historical date
        const balanceChange = accountTransactions.reduce((sum: number, t: any) => {
          // For credit accounts, positive amounts increase the balance (more debt)
          // For other accounts, positive amounts increase the balance (more money)
          return sum + t.amount;
        }, 0);

        const currentBalance = account.historicalBalance + balanceChange;
        
        console.log(`💰 Calculated current balance for ${account.name}: ${account.historicalBalance} + ${balanceChange} = ${currentBalance}`);
        
        // Update the account with the calculated balance
        this.updateAccount(accountId, { 
          balance: currentBalance, 
          lastSyncDate: new Date() 
        });
        
        return currentBalance;
      } catch (error) {
        console.error('Error calculating current balance:', error);
        return account.historicalBalance;
      }
    }

    return account.balance || 0;
  }

  private async readFileContent(file: File): Promise<string> {
    // Deprecated: kept for compatibility. Prefer readStatementText for type-aware extraction.
    return this.readStatementText(file);
  }

  // Type-aware text extraction for statements to feed the AI meaningful content
  private async readStatementText(file: File): Promise<string> {
    const fileType = this.getFileType(file.name);

    const readAsArrayBuffer = (): Promise<ArrayBuffer> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result;
          if (result instanceof ArrayBuffer) resolve(result);
          else if (typeof result === 'string') resolve(new TextEncoder().encode(result).buffer);
          else reject(new Error('Failed to read file content'));
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
      });

    const stripBOM = (s: string) => (s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
    const countReplacement = (s: string) => (s.match(/\uFFFD/g) || []).length;
    const countC1Controls = (s: string) => {
      let count = 0;
      for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        if (code >= 0x80 && code <= 0x9f) count++;
      }
      return count;
    };
    const tryDecode = (buf: ArrayBuffer, enc: string) => {
      try {
        const dec = new TextDecoder(enc as any, { fatal: false });
        return stripBOM(dec.decode(new DataView(buf)));
      } catch {
        return '';
      }
    };

    const extractAsciiFromBinary = (view: Uint8Array, maxChars = 8000): string => {
      // Heuristic: keep printable ASCII and whitespace, collapse long non-text regions
      let out = '';
      let run = '';
      const pushRun = () => {
        if (run.length) {
          out += run + '\n';
          run = '';
        }
      };
      for (let i = 0; i < view.length && out.length < maxChars; i++) {
        const b = view[i];
        if ((b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13) {
          run += String.fromCharCode(b);
          if (run.length > 256) {
            out += run;
            run = '';
          }
        } else if (run.length) {
          pushRun();
        }
      }
      pushRun();
      // Basic cleanup: collapse excessive whitespace
      return out.replace(/[\t ]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    };

    try {
      const buffer = await readAsArrayBuffer();
      const view = new Uint8Array(buffer);

      if (fileType === 'csv') {
        // Try robust text decoding for CSV-like content
        // Quick BOM-based detection
        const hasUTF16LE = view.length >= 2 && view[0] === 0xff && view[1] === 0xfe;
        const hasUTF16BE = view.length >= 2 && view[0] === 0xfe && view[1] === 0xff;
        if (hasUTF16LE) return new TextDecoder('utf-16le').decode(new DataView(buffer));
        if (hasUTF16BE) return new TextDecoder('utf-16be' as any).decode(new DataView(buffer));

        const utf8 = tryDecode(buffer, 'utf-8');
        const utf8Repl = countReplacement(utf8);
        if (utf8Repl === 0) return utf8;

        const cp1252 = tryDecode(buffer, 'windows-1252');
        const cp1252Repl = countReplacement(cp1252);
        const cp1252C1 = countC1Controls(cp1252);
        const iso88591 = tryDecode(buffer, 'iso-8859-1');
        const isoRepl = countReplacement(iso88591);
        const isoC1 = countC1Controls(iso88591);
        const iso885915 = tryDecode(buffer, 'iso-8859-15');
        const iso15Repl = countReplacement(iso885915);
        const iso15C1 = countC1Controls(iso885915);
        type Candidate = { text: string; repl: number; c1: number; label: string };
        const candidates: Candidate[] = [
          { text: utf8, repl: utf8Repl, c1: countC1Controls(utf8), label: 'utf8' },
          { text: cp1252, repl: cp1252Repl, c1: cp1252C1, label: 'cp1252' },
          { text: iso88591, repl: isoRepl, c1: isoC1, label: 'iso' },
          { text: iso885915, repl: iso15Repl, c1: iso15C1, label: 'iso15' }
        ];
        const best = candidates.reduce((best, cur) => {
          if (cur.repl !== best.repl) return cur.repl < best.repl ? cur : best;
          if (cur.c1 !== best.c1) return cur.c1 < best.c1 ? cur : best;
          // Prefer utf8 over others on ties
          const pref = ['utf8', 'cp1252', 'iso15', 'iso'];
          return pref.indexOf(cur.label) < pref.indexOf(best.label) ? cur : best;
        });
        return best.text;
      }

      if (fileType === 'excel') {
        try {
          // Use XLSX to extract a CSV-like preview text from the first sheet
          const wb = XLSX.read(buffer, { type: 'array' });
          const sheetName = wb.SheetNames[0];
          const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
          const csv = sheet ? XLSX.utils.sheet_to_csv(sheet, { blankrows: false }) : '';
          const header = `Workbook sheets: ${wb.SheetNames.join(', ')}\nUsing sheet: ${sheetName || 'N/A'}\n`;
          return (header + (csv || '')).slice(0, 8000);
        } catch (e) {
          // Fall back to ASCII extraction from binary (likely poor for XLSX)
          return extractAsciiFromBinary(view);
        }
      }

      if (fileType === 'pdf') {
        // Prefer pdfjs-dist extraction; fallback to ASCII heuristic if unavailable
        const extractWithPdfJs = async (): Promise<string> => {
          try {
            const pdfjs: any = await import('pdfjs-dist/build/pdf');
            try {
              const worker: any = await import('pdfjs-dist/build/pdf.worker.min.js');
              if (worker && (worker as any).default && pdfjs.GlobalWorkerOptions) {
                pdfjs.GlobalWorkerOptions.workerSrc = (worker as any).default;
              }
            } catch {}

            const loadingTask = pdfjs.getDocument({ data: buffer });
            const pdf = await loadingTask.promise;
            const maxPages = Math.min(pdf.numPages || 1, 8);
            let combined = '';
            for (let i = 1; i <= maxPages; i++) {
              const page = await pdf.getPage(i);
              const tc = await page.getTextContent();
              const pageText = (tc.items || [])
                .map((it: any) => (typeof it?.str === 'string' ? it.str : ''))
                .filter(Boolean)
                .join(' ');
              combined += pageText + '\n\n';
              if (combined.length > 9000) break;
            }
            // Basic whitespace cleanup and truncate for prompt safety
            return combined.replace(/[\t ]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, 8000).trim();
          } catch (e) {
            return '';
          }
        };

        const pdfText = await extractWithPdfJs();
        if (pdfText && pdfText.length > 50) return pdfText;

        // Fallback heuristic ASCII extraction if pdfjs failed
        const text = extractAsciiFromBinary(view);
        return text || '';
      }

      // Images or unknown types: no reliable text in-browser
      return '';
    } catch (e) {
      console.warn('Failed to read statement text:', e);
      return '';
    }
  }

  private getFileType(filename: string): 'pdf' | 'csv' | 'excel' | 'image' {
    const extension = filename.toLowerCase().split('.').pop();
    
    switch (extension) {
      case 'pdf':
        return 'pdf';
      case 'csv':
        return 'csv';
      case 'xlsx':
      case 'xls':
        return 'excel';
      case 'png':
      case 'jpg':
      case 'jpeg':
        return 'image';
      default:
        return 'csv'; // Default fallback
    }
  }
}

// Singleton instance
export const accountManagementService = new AccountManagementService();
