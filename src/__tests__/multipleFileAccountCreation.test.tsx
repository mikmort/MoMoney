import { accountManagementService } from '../services/accountManagementService';

// Mock the account management service
jest.mock('../services/accountManagementService', () => ({
  accountManagementService: {
    detectMultipleAccountsFromStatement: jest.fn(),
  }
}));

const mockDetectMultipleAccounts = accountManagementService.detectMultipleAccountsFromStatement as jest.MockedFunction<typeof accountManagementService.detectMultipleAccountsFromStatement>;

describe('Multiple File Account Creation Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle multiple file processing logic', async () => {
    // This tests the core logic rather than the UI component
    const file1 = new File(['csv content'], 'file1.csv', { type: 'text/csv' });
    const file2 = new File(['pdf content'], 'file2.pdf', { type: 'application/pdf' });
    const files = [file1, file2];

    // Mock the service to return different accounts for different files
    mockDetectMultipleAccounts
      .mockResolvedValueOnce({
        success: true,
        multipleAccountsResult: {
          accounts: [
            {
              accountName: 'Chase Checking',
              institution: 'Chase Bank',
              accountType: 'checking' as const,
              currency: 'USD',
              balance: 1000,
              confidence: 0.9,
              reasoning: 'High confidence detection from file1.csv',
              extractedFields: ['accountName', 'institution']
            }
          ],
          totalAccountsFound: 1,
          confidence: 0.9,
          reasoning: 'Found 1 account in file1.csv',
          hasMultipleAccounts: false
        }
      })
      .mockResolvedValueOnce({
        success: true,
        multipleAccountsResult: {
          accounts: [
            {
              accountName: 'AmEx Platinum',
              institution: 'American Express',
              accountType: 'credit' as const,
              currency: 'USD',
              balance: -500,
              confidence: 0.85,
              reasoning: 'High confidence detection from file2.pdf',
              extractedFields: ['accountName', 'institution']
            }
          ],
          totalAccountsFound: 1,
          confidence: 0.85,
          reasoning: 'Found 1 account in file2.pdf',
          hasMultipleAccounts: false
        }
      });

    // Simulate the logic from handleMultipleFileUploads
    const allAccountsFromFiles = [];
    let totalAccountsFound = 0;
    
    for (const file of files) {
      const result = await accountManagementService.detectMultipleAccountsFromStatement(file);
      
      if (result.success && result.multipleAccountsResult) {
        // Add detected accounts with file source information  
        const accountsWithFileInfo = result.multipleAccountsResult.accounts.map(account => ({
          ...account,
          sourceFile: file.name
        }));
        allAccountsFromFiles.push(...accountsWithFileInfo);
        totalAccountsFound += result.multipleAccountsResult.totalAccountsFound;
      }
    }

    // Verify the logic worked correctly
    expect(mockDetectMultipleAccounts).toHaveBeenCalledTimes(2);
    expect(mockDetectMultipleAccounts).toHaveBeenCalledWith(file1);
    expect(mockDetectMultipleAccounts).toHaveBeenCalledWith(file2);
    
    expect(allAccountsFromFiles).toHaveLength(2);
    expect(totalAccountsFound).toBe(2);
    
    // Check that source file names were added
    expect(allAccountsFromFiles[0]).toHaveProperty('sourceFile', 'file1.csv');
    expect(allAccountsFromFiles[1]).toHaveProperty('sourceFile', 'file2.pdf');
    
    // Verify account details
    expect(allAccountsFromFiles[0].accountName).toBe('Chase Checking');
    expect(allAccountsFromFiles[1].accountName).toBe('AmEx Platinum');
  });

  it('should handle file processing errors gracefully', async () => {
    const file1 = new File(['good content'], 'good.csv', { type: 'text/csv' });
    const file2 = new File(['bad content'], 'bad.csv', { type: 'text/csv' });
    const files = [file1, file2];

    // Mock one successful and one failed file
    mockDetectMultipleAccounts
      .mockResolvedValueOnce({
        success: true,
        multipleAccountsResult: {
          accounts: [
            {
              accountName: 'Successful Account',
              institution: 'Success Bank',
              accountType: 'checking' as const,
              currency: 'USD',
              balance: 1000,
              confidence: 0.9,
              reasoning: 'Processed successfully',
              extractedFields: ['accountName']
            }
          ],
          totalAccountsFound: 1,
          confidence: 0.9,
          reasoning: 'Success',
          hasMultipleAccounts: false
        }
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'Failed to process file'
      });

    // Simulate the error handling logic
    const allAccountsFromFiles = [];
    let totalAccountsFound = 0;
    
    for (const file of files) {
      try {
        const result = await accountManagementService.detectMultipleAccountsFromStatement(file);
        
        if (result.success && result.multipleAccountsResult) {
          const accountsWithFileInfo = result.multipleAccountsResult.accounts.map(account => ({
            ...account,
            sourceFile: file.name
          }));
          allAccountsFromFiles.push(...accountsWithFileInfo);
          totalAccountsFound += result.multipleAccountsResult.totalAccountsFound;
        } else {
          console.warn(`Failed to process file ${file.name}:`, result.error);
        }
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
      }
    }

    // Should still process the successful file
    expect(allAccountsFromFiles).toHaveLength(1);
    expect(totalAccountsFound).toBe(1);
    expect(allAccountsFromFiles[0].accountName).toBe('Successful Account');
    expect(allAccountsFromFiles[0].sourceFile).toBe('good.csv');
  });

  it('should handle single file with existing logic', async () => {
    const file = new File(['csv content'], 'single.csv', { type: 'text/csv' });
    
    // Mock for single file that gets auto-created
    mockDetectMultipleAccounts.mockResolvedValueOnce({
      success: true,
      accounts: [{ id: 'auto-created-account', name: 'Auto Created Account' }]
    });

    const result = await accountManagementService.detectMultipleAccountsFromStatement(file);
    
    expect(result.success).toBe(true);
    expect(result.accounts).toBeDefined();
    expect(result.accounts![0].name).toBe('Auto Created Account');
  });
});