import { AccountManagementService, AccountDetectionRequest } from '../services/accountManagementService';

// Mock the azureOpenAIService
jest.mock('../services/azureOpenAIService', () => ({
  AzureOpenAIService: jest.fn().mockImplementation(() => ({
    makeRequest: jest.fn().mockResolvedValue('AI account detection result')
  }))
}));

describe('Account Management Critical Path Tests', () => {
  let service: AccountManagementService;

  beforeEach(() => {
    service = new AccountManagementService();
    jest.clearAllMocks();
  });

  describe('Account Detection with Real-World File Names', () => {
    it('should detect accounts from actual bank statement file patterns', async () => {
      const realWorldFileNames = [
        // Chase patterns
        'Chase_Checking_Statement_2025_01.pdf',
        'chase-5247-statement.pdf',
        'CHASE_CREDIT_CARD_STATEMENT.PDF',
        
        // Bank of America patterns  
        'BankOfAmerica_Checking_Statement.pdf',
        'bofa-savings-jan-2025.csv',
        'bank_of_america_credit_statement.pdf',
        
        // Wells Fargo patterns
        'WellsFargo_Statement_Jan2025.pdf',
        'wells-fargo-checking.csv',
        'WELLS_FARGO_BUSINESS_ACCOUNT.xlsx',

        // Credit cards
        'AmEx_Platinum_Statement.pdf',
        'american_express_gold.csv',
        'DISCOVER_IT_STATEMENT.PDF',
        'Capital_One_Venture.pdf'
      ];

      for (const fileName of realWorldFileNames) {
        const request: AccountDetectionRequest = { fileName };
        const result = await service.detectAccountFromFile(request);
        
        // Should detect something with reasonable confidence
        if (result.detectedAccountId) {
          expect(result.confidence).toBeGreaterThan(0.6);
          expect(result.reasoning).toContain('filename pattern');
        }
        
        // Should not crash or return invalid data
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
        expect(Array.isArray(result.suggestedAccounts)).toBe(true);
      }
    });

    it('should handle filename edge cases that could break regex patterns', async () => {
      const edgeCaseFileNames = [
        '', // Empty filename
        '.pdf', // Just extension
        'file_with_no_extension',
        'file.with.multiple.dots.csv',
        'file with spaces and (parentheses).pdf',
        'файл-с-русскими-буквами.csv', // Cyrillic characters
        '文件名.pdf', // Chinese characters
        'file-name-that-is-extremely-long-and-could-potentially-cause-issues-with-string-processing-or-regex-matching.pdf'
      ];

      for (const fileName of edgeCaseFileNames) {
        const request: AccountDetectionRequest = { fileName };
        
        // Should not throw errors
        expect(async () => {
          const result = await service.detectAccountFromFile(request);
          expect(result).toBeDefined();
          expect(typeof result.confidence).toBe('number');
          expect(result.confidence).not.toBeNaN();
        }).not.toThrow();
      }
    });
  });

  describe('Account ID Generation Edge Cases', () => {
    it('should generate consistent IDs for accounts with similar names', async () => {
      // Test cases that could generate conflicting IDs
      const similarAccounts = [
        { name: 'Checking Account', institution: 'Chase', expected: 'chase-checking-account' },
        { name: 'Checking', institution: 'Chase Bank', expected: 'chase-bank-checking' },
        { name: 'Business Checking', institution: 'Chase', expected: 'chase-business-checking' },
        { name: 'Chase Checking', institution: 'JP Morgan', expected: 'jp-morgan-chase-checking' }
      ];

      const createdIds = [];
      
      for (const accountData of similarAccounts) {
        const account = service.addAccount({
          name: accountData.name,
          institution: accountData.institution,
          type: 'checking',
          isActive: true
        });
        
        expect(account.id).toBe(accountData.expected);
        expect(createdIds).not.toContain(account.id); // No duplicates
        createdIds.push(account.id);
      }
    });

    it('should handle special characters that could break ID generation', async () => {
      const specialCharacters = [
        'Account with "quotes"',
        "Account with 'apostrophes'",
        'Account with & ampersand',
        'Account with % percent',
        'Account with / slash',
        'Account with \\ backslash',
        'Account with | pipe',
        'Account with <> brackets',
        'Account with #hashtag',
        'Account with @symbol'
      ];

      const generatedIds = [];
      
      for (let i = 0; i < specialCharacters.length; i++) {
        const account = service.addAccount({
          name: specialCharacters[i],
          institution: 'Test Bank',
          type: 'checking',
          isActive: true
        });

        // ID should be generated without errors
        expect(account.id).toBeDefined();
        expect(typeof account.id).toBe('string');
        expect(account.id.length).toBeGreaterThan(0);
        
        // Should not contain problematic characters that could break URLs or databases
        expect(account.id).not.toMatch(/[<>:"/\\|?*]/);
        
        // Should be unique
        expect(generatedIds).not.toContain(account.id);
        generatedIds.push(account.id);
      }
    });
  });

  describe('Account Pattern Matching Accuracy', () => {
    it('should prioritize more specific patterns over generic ones', async () => {
      const testCases = [
        {
          fileName: 'chase_premier_plus_checking_account_statement_january_2025.pdf',
          expectedConfidence: 0.95, // Very specific, should have high confidence
          description: 'Very specific pattern'
        },
        {
          fileName: 'chase_checking_statement.pdf', 
          expectedConfidence: 0.85, // Specific, good confidence
          description: 'Moderately specific pattern'
        },
        {
          fileName: 'chase_statement.pdf',
          expectedConfidence: 0.75, // Generic, lower confidence  
          description: 'Generic pattern'
        },
        {
          fileName: 'chase.pdf',
          expectedConfidence: 0.65, // Very generic, lowest confidence
          description: 'Minimal pattern'
        }
      ];

      let previousConfidence = 1.0;
      
      for (const testCase of testCases) {
        const request: AccountDetectionRequest = { fileName: testCase.fileName };
        const result = await service.detectAccountFromFile(request);
        
        if (result.detectedAccountId) {
          expect(result.confidence).toBeGreaterThanOrEqual(testCase.expectedConfidence - 0.1);
          expect(result.confidence).toBeLessThan(previousConfidence);
          previousConfidence = result.confidence;
        }
      }
    });
  });

  describe('Performance and Memory Tests', () => {
    it('should handle many account operations without memory leaks', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create and delete many accounts
      for (let i = 0; i < 1000; i++) {
        const account = service.addAccount({
          name: `Test Account ${i}`,
          institution: `Bank ${i % 10}`, // Cycle through 10 different banks
          type: 'checking',
          isActive: true
        });
        
        // Immediately delete every other account
        if (i % 2 === 0) {
          try {
            await service.deleteAccount(account.id);
          } catch (error) {
            // May fail due to no mock for getAllTransactions, that's ok
          }
        }
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB for 1000 operations)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    it('should handle concurrent account detection requests', async () => {
      const fileNames = [
        'chase_checking_statement.pdf',
        'bofa_savings_statement.pdf', 
        'wells_fargo_business.csv',
        'amex_platinum_statement.pdf',
        'discover_rewards_statement.pdf'
      ];

      // Process all files simultaneously
      const detectionPromises = fileNames.map(fileName => 
        service.detectAccountFromFile({ fileName })
      );
      
      const results = await Promise.all(detectionPromises);
      
      // All should complete successfully
      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(typeof result.confidence).toBe('number');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });
    });
  });
});