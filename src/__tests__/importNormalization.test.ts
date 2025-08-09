import { AccountManagementService, AccountDetectionRequest } from '../services/accountManagementService';

// Mock the azureOpenAIService
jest.mock('../services/azureOpenAIService', () => ({
  AzureOpenAIService: jest.fn().mockImplementation(() => ({
    makeRequest: jest.fn().mockResolvedValue('AI account detection result')
  }))
}));

describe('AccountManagementService Import Normalization', () => {
  let service: AccountManagementService;

  beforeEach(() => {
    service = new AccountManagementService();
    jest.clearAllMocks();
  });

  describe('File Name Normalization', () => {
    it('should normalize file names to lowercase for pattern matching', async () => {
      const request: AccountDetectionRequest = {
        fileName: 'CHASE_CHECKING_Statement_2025.pdf'
      };

      const result = await service.detectAccountFromFile(request);

      // Should detect Chase account despite uppercase filename
      expect(result.detectedAccountId).toBe('chase-checking');
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.reasoning).toContain('based on filename pattern');
    });

    it('should handle mixed case and special characters in file names', async () => {
      const request: AccountDetectionRequest = {
        fileName: 'bank_of_AMERICA-savings Statement (2025).PDF'
      };

      const result = await service.detectAccountFromFile(request);

      // Should detect Bank of America savings account despite mixed case and special characters
      expect(result.detectedAccountId).toBe('savings-primary');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should normalize file names with spaces and underscores', async () => {
      const request: AccountDetectionRequest = {
        fileName: 'amex_platinum Statement.csv'
      };

      const result = await service.detectAccountFromFile(request);

      // Should detect AmEx account despite mixed separators  
      expect(result.detectedAccountId).toBe('amex-platinum');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should handle file extensions and variations', async () => {
      const testCases = [
        'chase-statement.pdf',
        'chase_statement.csv',
      ];

      for (const fileName of testCases) {
        const request: AccountDetectionRequest = { fileName };
        const result = await service.detectAccountFromFile(request);
        
        expect(result.detectedAccountId).toBe('chase-checking');
        expect(result.confidence).toBeGreaterThan(0.6);
      }
    });
  });

  describe('Pattern Matching Normalization', () => {
    it('should give higher confidence for longer, more specific patterns', async () => {
      const specificRequest: AccountDetectionRequest = {
        fileName: 'chase_checking_account_statement_january_2025.pdf'
      };

      const genericRequest: AccountDetectionRequest = {
        fileName: 'chase.pdf'
      };

      const specificResult = await service.detectAccountFromFile(specificRequest);
      const genericResult = await service.detectAccountFromFile(genericRequest);

      // Both should detect chase-checking, but specific should have higher confidence
      expect(specificResult.detectedAccountId).toBe('chase-checking');
      expect(genericResult.detectedAccountId).toBe('chase-checking');
      expect(specificResult.confidence).toBeGreaterThan(genericResult.confidence);
      expect(specificResult.confidence).toBeGreaterThan(0.8);
      expect(genericResult.confidence).toBeGreaterThan(0.6);
    });

    it('should handle partial pattern matches case-insensitively', async () => {
      const request: AccountDetectionRequest = {
        fileName: 'MyBankStatements_DISCOVER_card.pdf'
      };

      const result = await service.detectAccountFromFile(request);

      expect(result.detectedAccountId).toBe('discover-card');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should return low confidence when no patterns match', async () => {
      const request: AccountDetectionRequest = {
        fileName: 'random_file_name_without_bank_patterns.pdf'
      };

      const result = await service.detectAccountFromFile(request);

      expect(result.detectedAccountId).toBeUndefined();
      expect(result.confidence).toBeLessThan(0.6);
      expect(result.suggestedAccounts).toHaveLength(0);
    });
  });

  describe('Account ID Generation Normalization', () => {
    it('should generate normalized account IDs from name and institution', () => {
      const account1 = service.addAccount({
        name: 'My Checking Account',
        institution: 'Chase Bank',
        type: 'checking',
        isActive: true
      });

      const account2 = service.addAccount({
        name: 'MY CHECKING ACCOUNT',  // Same but uppercase
        institution: 'CHASE BANK',    // Same but uppercase
        type: 'checking',
        isActive: true
      });

      // Should generate consistent IDs regardless of case
      expect(account1.id).toBe('chase-bank-my-checking-account');
      expect(account2.id).toBe('chase-bank-my-checking-account');
    });

    it('should handle special characters in account names for ID generation', () => {
      const account = service.addAccount({
        name: 'My Savings & Investment Account!',
        institution: 'Bank of America (BoA)',
        type: 'savings',
        isActive: true
      });

      // Should normalize special characters in ID
      expect(account.id).toBe('bank-of-america--boa--my-savings---investment-account-');
    });

    it('should generate different IDs for different accounts', () => {
      const account1 = service.addAccount({
        name: 'Checking',
        institution: 'Chase',
        type: 'checking',
        isActive: true
      });

      const account2 = service.addAccount({
        name: 'Savings',
        institution: 'Chase', 
        type: 'savings',
        isActive: true
      });

      expect(account1.id).not.toBe(account2.id);
      expect(account1.id).toBe('chase-checking');
      expect(account2.id).toBe('chase-savings');
    });
  });

  describe('Data Consistency', () => {
    it('should maintain account data integrity during normalization', () => {
      const originalData = {
        name: 'My Premier Checking',
        institution: 'Wells Fargo Bank',
        type: 'checking' as const,
        balance: 1500.50,
        isActive: true
      };

      const account = service.addAccount(originalData);

      // Original data should be preserved exactly
      expect(account.name).toBe(originalData.name);
      expect(account.institution).toBe(originalData.institution);
      expect(account.type).toBe(originalData.type);
      expect(account.balance).toBe(originalData.balance);
      expect(account.isActive).toBe(originalData.isActive);
      
      // Only ID should be normalized/generated
      expect(account.id).toBeDefined();
      expect(account.id).toBe('wells-fargo-bank-my-premier-checking');
    });

    it('should handle edge cases in normalization without errors', () => {
      const edgeCases = [
        { name: '', institution: 'Bank', type: 'checking' as const, isActive: true },
        { name: 'Account', institution: '', type: 'savings' as const, isActive: true },
        { name: '123', institution: '456', type: 'credit' as const, isActive: true },
        { name: 'Special!@#$%^&*()_+', institution: 'Symbols[]{}|\\', type: 'investment' as const, isActive: true }
      ];

      edgeCases.forEach(data => {
        expect(() => {
          const account = service.addAccount(data);
          expect(account.id).toBeDefined();
          expect(typeof account.id).toBe('string');
          expect(account.id.length).toBeGreaterThan(0);
        }).not.toThrow();
      });
    });
  });
});