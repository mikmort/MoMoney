import { fileProcessingService } from '../services/fileProcessingService';
import { accountManagementService, AccountDetectionResponse } from '../services/accountManagementService';

// Mock external dependencies
jest.mock('../services/azureOpenAIService');
jest.mock('../services/accountManagementService');

// Mock dataService to avoid database operations in tests
jest.mock('../services/dataService', () => ({
  dataService: {
    getAllTransactions: jest.fn(() => Promise.resolve([])),
    addTransactions: jest.fn(() => Promise.resolve()),
    detectDuplicates: jest.fn(() => Promise.resolve({ duplicates: [], uniqueTransactions: [] }))
  }
}));

describe('Account Detection Confidence Thresholds', () => {
  let mockAccountService: jest.SpyInstance;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the account detection to return controlled confidence levels
    mockAccountService = jest.spyOn(accountManagementService, 'detectAccountFromFile');
  });

  afterEach(() => {
    mockAccountService.mockRestore();
  });

  describe('FileProcessingService confidence threshold (>= 0.95)', () => {
    it('should auto-assign account when confidence is exactly 0.95', async () => {
      // Mock high confidence detection
      mockAccountService.mockResolvedValue({
        detectedAccountId: 'chase-checking',
        confidence: 0.95,
        reasoning: 'Very high confidence match',
        suggestedAccounts: []
      } as AccountDetectionResponse);

      const mockFile = new File(['test,data,here'], 'chase_statement.csv', { type: 'text/csv' });
      const result = await fileProcessingService.processUploadedFile(mockFile);

      expect(result.needsAccountSelection).toBe(false);
      expect(result.file.accountId).toBe('chase-checking');
      expect(result.file.status).toBe('completed');
    });

    it('should auto-assign account when confidence is above 0.95', async () => {
      // Mock very high confidence detection
      mockAccountService.mockResolvedValue({
        detectedAccountId: 'chase-checking',
        confidence: 0.98,
        reasoning: 'Very high confidence match',
        suggestedAccounts: []
      } as AccountDetectionResponse);

      const mockFile = new File(['test,data,here'], 'chase_statement.csv', { type: 'text/csv' });
      const result = await fileProcessingService.processUploadedFile(mockFile);

      expect(result.needsAccountSelection).toBe(false);
      expect(result.file.accountId).toBe('chase-checking');
      expect(result.file.status).toBe('completed');
    });

    it('should require manual account selection when confidence is 0.94 (just below threshold)', async () => {
      // Mock confidence just below threshold
      mockAccountService.mockResolvedValue({
        detectedAccountId: 'chase-checking',
        confidence: 0.94,
        reasoning: 'Good match but not certain enough',
        suggestedAccounts: [{
          accountId: 'chase-checking',
          confidence: 0.94,
          reasoning: 'Good match but not certain enough'
        }]
      } as AccountDetectionResponse);

      const mockFile = new File(['test,data,here'], 'chase_statement.csv', { type: 'text/csv' });
      const result = await fileProcessingService.processUploadedFile(mockFile);

      expect(result.needsAccountSelection).toBe(true);
      expect(result.file.accountId).toBeUndefined();
      expect(result.file.status).toBe('awaiting-account-selection');
      expect(result.detectionResult).toBeDefined();
      expect(result.detectionResult?.confidence).toBe(0.94);
    });

    it('should require manual account selection when confidence is 0.90 (old high threshold)', async () => {
      // Mock confidence at old "high" threshold - should now require manual selection
      mockAccountService.mockResolvedValue({
        detectedAccountId: 'chase-checking',
        confidence: 0.90,
        reasoning: 'Good match but not very high confidence',
        suggestedAccounts: [{
          accountId: 'chase-checking',
          confidence: 0.90,
          reasoning: 'Good match but not very high confidence'
        }]
      } as AccountDetectionResponse);

      const mockFile = new File(['test,data,here'], 'chase_statement.csv', { type: 'text/csv' });
      const result = await fileProcessingService.processUploadedFile(mockFile);

      expect(result.needsAccountSelection).toBe(true);
      expect(result.file.accountId).toBeUndefined();
      expect(result.file.status).toBe('awaiting-account-selection');
      expect(result.detectionResult).toBeDefined();
    });

    it('should handle multiple similar accounts (e.g., two Chase cards) by requiring manual selection', async () => {
      // Mock a scenario where AI detects Chase but isn't very confident which one
      mockAccountService.mockResolvedValue({
        detectedAccountId: 'chase-sapphire',
        confidence: 0.85, // Not high enough for auto-assignment
        reasoning: 'Detected Chase institution but uncertain between multiple Chase accounts',
        suggestedAccounts: [
          {
            accountId: 'chase-sapphire',
            confidence: 0.85,
            reasoning: 'Could be Chase Sapphire card'
          },
          {
            accountId: 'chase-freedom',
            confidence: 0.83,
            reasoning: 'Could be Chase Freedom card'  
          }
        ]
      } as AccountDetectionResponse);

      const mockFile = new File(['test,data,here'], 'chase_december_statement.csv', { type: 'text/csv' });
      const result = await fileProcessingService.processUploadedFile(mockFile);

      expect(result.needsAccountSelection).toBe(true);
      expect(result.file.accountId).toBeUndefined();
      expect(result.file.status).toBe('awaiting-account-selection');
      expect(result.detectionResult).toBeDefined();
      expect(result.detectionResult?.suggestedAccounts).toHaveLength(2);
    });

    it('should handle detection failures gracefully by requiring manual selection', async () => {
      // Mock detection failure
      mockAccountService.mockRejectedValue(new Error('Account detection service unavailable'));

      const mockFile = new File(['test,data,here'], 'unknown_statement.csv', { type: 'text/csv' });
      const result = await fileProcessingService.processUploadedFile(mockFile);

      expect(result.needsAccountSelection).toBe(true);
      expect(result.file.accountId).toBeUndefined();
      expect(result.file.status).toBe('error');
    });
  });

  describe('Edge cases and boundary conditions', () => {
    it('should not auto-assign when confidence is exactly 0.949999 (just below 0.95)', async () => {
      mockAccountService.mockResolvedValue({
        detectedAccountId: 'test-account',
        confidence: 0.949999,
        reasoning: 'Just below threshold',
        suggestedAccounts: []
      } as AccountDetectionResponse);

      const mockFile = new File(['test,data'], 'test.csv', { type: 'text/csv' });
      const result = await fileProcessingService.processUploadedFile(mockFile);

      expect(result.needsAccountSelection).toBe(true);
      expect(result.file.accountId).toBeUndefined();
    });

    it('should auto-assign when confidence is exactly 1.0 (perfect confidence)', async () => {
      mockAccountService.mockResolvedValue({
        detectedAccountId: 'test-account',
        confidence: 1.0,
        reasoning: 'Perfect match',
        suggestedAccounts: []
      } as AccountDetectionResponse);

      const mockFile = new File(['test,data'], 'test.csv', { type: 'text/csv' });
      const result = await fileProcessingService.processUploadedFile(mockFile);

      expect(result.needsAccountSelection).toBe(false);
      expect(result.file.accountId).toBe('test-account');
      expect(result.file.status).toBe('completed');
    });

    it('should handle low confidence (< 0.6) by not showing AI suggestions', async () => {
      mockAccountService.mockResolvedValue({
        detectedAccountId: 'test-account',
        confidence: 0.3, // Very low confidence
        reasoning: 'Low confidence match',
        suggestedAccounts: []
      } as AccountDetectionResponse);

      const mockFile = new File(['test,data'], 'test.csv', { type: 'text/csv' });
      const result = await fileProcessingService.processUploadedFile(mockFile);

      expect(result.needsAccountSelection).toBe(true);
      expect(result.detectionResult).toBeUndefined(); // Should not show AI result when confidence < 0.6
    });

    it('should show AI suggestions when confidence is >= 0.6 but < 0.95', async () => {
      mockAccountService.mockResolvedValue({
        detectedAccountId: 'test-account',  
        confidence: 0.75, // Medium confidence
        reasoning: 'Medium confidence match',
        suggestedAccounts: [{
          accountId: 'test-account',
          confidence: 0.75,
          reasoning: 'Medium confidence match'
        }]
      } as AccountDetectionResponse);

      const mockFile = new File(['test,data'], 'test.csv', { type: 'text/csv' });
      const result = await fileProcessingService.processUploadedFile(mockFile);

      expect(result.needsAccountSelection).toBe(true);
      expect(result.detectionResult).toBeDefined(); // Should show AI result when confidence >= 0.6
      expect(result.detectionResult?.confidence).toBe(0.75);
    });
  });
});