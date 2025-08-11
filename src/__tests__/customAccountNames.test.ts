import { accountManagementService } from '../services/accountManagementService';
import { MultipleAccountAnalysisResponse } from '../types';

describe('AccountManagementService - Custom Account Names', () => {
  test('should create accounts with custom names when provided', async () => {
    // Mock analysis result with detected accounts
    const mockAnalysisResult: MultipleAccountAnalysisResponse = {
      accounts: [
        {
          accountName: 'Account 1',
          institution: 'Chase Bank',
          accountType: 'checking',
          currency: 'USD',
          balance: 1000,
          confidence: 0.8,
          reasoning: 'Test account 1',
          extractedFields: ['name', 'institution']
        },
        {
          accountName: 'Account 2', 
          institution: 'Wells Fargo',
          accountType: 'savings',
          currency: 'USD',
          balance: 2000,
          confidence: 0.7,
          reasoning: 'Test account 2',
          extractedFields: ['name', 'institution']
        }
      ],
      totalAccountsFound: 2,
      confidence: 0.75,
      reasoning: 'Multiple accounts detected',
      hasMultipleAccounts: true
    };

    // Custom names for the accounts
    const customNames = {
      0: 'My Custom Chase Checking',
      1: 'My Custom Wells Savings'
    };

    // Select both accounts for creation
    const selectedIndices = [0, 1];

    // Create accounts with custom names
    const result = await accountManagementService.createAccountsFromMultipleAnalysis(
      mockAnalysisResult,
      selectedIndices,
      customNames
    );

    // Verify the result
    expect(result.success).toBe(true);
    expect(result.createdAccounts).toHaveLength(2);
    expect(result.createdAccounts![0].name).toBe('My Custom Chase Checking');
    expect(result.createdAccounts![1].name).toBe('My Custom Wells Savings');
    expect(result.errors).toBeUndefined();

    // Clean up
    if (result.createdAccounts) {
      for (const account of result.createdAccounts) {
        accountManagementService.deleteAccount(account.id);
      }
    }
  });

  test('should fall back to original names when custom names not provided', async () => {
    const mockAnalysisResult: MultipleAccountAnalysisResponse = {
      accounts: [
        {
          accountName: 'Original Account Name',
          institution: 'Test Bank',
          accountType: 'checking', 
          currency: 'USD',
          balance: 500,
          confidence: 0.9,
          reasoning: 'Test account',
          extractedFields: ['name']
        }
      ],
      totalAccountsFound: 1,
      confidence: 0.9,
      reasoning: 'Single account detected',
      hasMultipleAccounts: false
    };

    const result = await accountManagementService.createAccountsFromMultipleAnalysis(
      mockAnalysisResult,
      [0],
      undefined // No custom names provided
    );

    expect(result.success).toBe(true);
    expect(result.createdAccounts).toHaveLength(1);
    expect(result.createdAccounts![0].name).toBe('Original Account Name');

    // Clean up
    if (result.createdAccounts) {
      accountManagementService.deleteAccount(result.createdAccounts[0].id);
    }
  });

  test('should use fallback name when neither custom nor original name available', async () => {
    const mockAnalysisResult: MultipleAccountAnalysisResponse = {
      accounts: [
        {
          // No accountName provided
          institution: 'Test Bank',
          accountType: 'checking',
          currency: 'USD', 
          balance: 500,
          confidence: 0.5,
          reasoning: 'Test account with no name',
          extractedFields: ['institution']
        }
      ],
      totalAccountsFound: 1,
      confidence: 0.5,
      reasoning: 'Account with no name detected',
      hasMultipleAccounts: false
    };

    const result = await accountManagementService.createAccountsFromMultipleAnalysis(
      mockAnalysisResult,
      [0],
      undefined
    );

    expect(result.success).toBe(true);
    expect(result.createdAccounts).toHaveLength(1);
    expect(result.createdAccounts![0].name).toBe('Account 1'); // Fallback name

    // Clean up
    if (result.createdAccounts) {
      accountManagementService.deleteAccount(result.createdAccounts[0].id);
    }
  });
});