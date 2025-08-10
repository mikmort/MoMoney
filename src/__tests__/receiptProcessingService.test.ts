import { receiptProcessingService } from '../services/receiptProcessingService';

// Mock the Azure OpenAI service
jest.mock('../services/azureOpenAIService', () => ({
  azureOpenAIService: {
    makeRequest: jest.fn()
  }
}));

// Mock the data service
jest.mock('../services/dataService', () => ({
  dataService: {
    detectDuplicates: jest.fn()
  }
}));

// Mock the account management service
jest.mock('../services/accountManagementService', () => ({
  accountManagementService: {
    getAccount: jest.fn(),
    getAccounts: jest.fn()
  }
}));

// Mock pdfjs-dist for browser compatibility
const mockPdfjsLib = {
  getDocument: jest.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: jest.fn(() => Promise.resolve({
        getTextContent: jest.fn(() => Promise.resolve({
          items: [{ str: 'Mock PDF content' }]
        }))
      }))
    })
  })),
  GlobalWorkerOptions: {
    workerSrc: ''
  }
};

jest.mock('pdfjs-dist', () => mockPdfjsLib);

// Mock the require call as well
jest.doMock('pdfjs-dist', () => mockPdfjsLib);

describe('ReceiptProcessingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processReceipt', () => {
    it('should process a PDF receipt file', async () => {
      const mockFile = new File(['test'], 'receipt.pdf', { type: 'application/pdf' });
      
      // Mock dependencies
      const { azureOpenAIService } = require('../services/azureOpenAIService');
      const { dataService } = require('../services/dataService');
      const { accountManagementService } = require('../services/accountManagementService');
      
      azureOpenAIService.makeRequest.mockResolvedValue(JSON.stringify({
        date: '2024-01-15',
        amount: 25.99,
        vendor: 'Coffee Shop',
        description: 'Coffee and pastry',
        category: 'Food & Dining',
        location: '123 Main St',
        confidence: 0.85,
        reasoning: 'Clear receipt with all details visible'
      }));
      
      dataService.detectDuplicates.mockResolvedValue({
        duplicates: [],
        uniqueTransactions: []
      });
      
      accountManagementService.getAccount.mockReturnValue({
        id: 'test-account',
        name: 'Test Account',
        type: 'checking'
      });

      const result = await receiptProcessingService.processReceipt({
        file: mockFile,
        accountId: 'test-account'
      });

      expect(result).toBeDefined();
      expect(result.extractedData.vendor).toBe('Coffee Shop');
      expect(result.extractedData.amount).toBe(25.99);
      expect(result.extractedData.confidence).toBe(0.85);
      expect(result.attachedFile).toBeDefined();
      expect(result.attachedFile.originalName).toBe('receipt.pdf');
      expect(result.attachedFile.type).toBe('pdf');
      expect(result.suggestedTransaction).toBeDefined();
      expect(result.suggestedTransaction.description).toBe('Coffee and pastry');
      expect(result.suggestedTransaction.amount).toBe(-25.99); // Should be negative for expense
      expect(result.suggestedTransaction.attachedFileId).toBe(result.attachedFile.id);
    });

    it('should process an image receipt file', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      
      const { azureOpenAIService } = require('../services/azureOpenAIService');
      const { dataService } = require('../services/dataService');
      const { accountManagementService } = require('../services/accountManagementService');
      
      azureOpenAIService.makeRequest.mockResolvedValue(JSON.stringify({
        date: '2024-01-16',
        amount: 15.50,
        vendor: 'Gas Station',
        description: 'Fuel purchase',
        category: 'Gas & Fuel',
        location: null,
        confidence: 0.75,
        reasoning: 'Image receipt processed with OCR'
      }));
      
      dataService.detectDuplicates.mockResolvedValue({
        duplicates: [],
        uniqueTransactions: []
      });
      
      accountManagementService.getAccount.mockReturnValue({
        id: 'test-account',
        name: 'Test Account',
        type: 'credit'
      });

      const result = await receiptProcessingService.processReceipt({
        file: mockFile,
        accountId: 'test-account'
      });

      expect(result.attachedFile.type).toBe('image');
      expect(result.extractedData.vendor).toBe('Gas Station');
      expect(result.suggestedTransaction.category).toBe('Fuel/Gas');
    });

    it('should handle AI extraction failure gracefully', async () => {
      const mockFile = new File(['test'], 'receipt.pdf', { type: 'application/pdf' });
      
      const { azureOpenAIService } = require('../services/azureOpenAIService');
      const { dataService } = require('../services/dataService');
      const { accountManagementService } = require('../services/accountManagementService');
      
      // Mock AI failure
      azureOpenAIService.makeRequest.mockRejectedValue(new Error('AI service unavailable'));
      
      dataService.detectDuplicates.mockResolvedValue({
        duplicates: [],
        uniqueTransactions: []
      });
      
      accountManagementService.getAccount.mockReturnValue({
        id: 'test-account',
        name: 'Test Account',
        type: 'checking'
      });

      const result = await receiptProcessingService.processReceipt({
        file: mockFile,
        accountId: 'test-account'
      });

      expect(result.extractedData.confidence).toBe(0.1);
      expect(result.extractedData.reasoning).toBe('AI extraction failed, manual review needed');
      expect(result.suggestedTransaction.description).toBe('Receipt: receipt.pdf');
      expect(result.suggestedTransaction.category).toBe('Uncategorized');
    });

    it('should detect potential duplicates', async () => {
      const mockFile = new File(['test'], 'receipt.pdf', { type: 'application/pdf' });
      
      const { azureOpenAIService } = require('../services/azureOpenAIService');
      const { dataService } = require('../services/dataService');
      const { accountManagementService } = require('../services/accountManagementService');
      
      azureOpenAIService.makeRequest.mockResolvedValue(JSON.stringify({
        date: '2024-01-15',
        amount: 25.99,
        vendor: 'Coffee Shop',
        description: 'Coffee and pastry',
        category: 'Food & Dining',
        confidence: 0.85,
        reasoning: 'Clear receipt'
      }));
      
      // Mock duplicate detection
      dataService.detectDuplicates.mockResolvedValue({
        duplicates: [{
          existingTransaction: { id: 'existing-1', description: 'Coffee Shop', amount: -25.99 },
          newTransaction: { description: 'Coffee and pastry', amount: -25.99 },
          matchFields: ['amount', 'description'],
          similarity: 0.9,
          matchType: 'exact'
        }],
        uniqueTransactions: []
      });
      
      accountManagementService.getAccount.mockReturnValue({
        id: 'test-account',
        name: 'Test Account',
        type: 'checking'
      });

      const result = await receiptProcessingService.processReceipt({
        file: mockFile,
        accountId: 'test-account'
      });

      expect(result.duplicateCheck.hasDuplicates).toBe(true);
      expect(result.duplicateCheck.potentialDuplicates).toHaveLength(1);
      expect(result.duplicateCheck.potentialDuplicates[0].similarity).toBe(0.9);
    });
  });

  describe('getAttachedFile', () => {
    it('should retrieve stored file by ID', async () => {
      const mockFile = new File(['test'], 'receipt.pdf', { type: 'application/pdf' });
      
      // Mock the required services to process a file first
      const { azureOpenAIService } = require('../services/azureOpenAIService');
      const { dataService } = require('../services/dataService');
      const { accountManagementService } = require('../services/accountManagementService');
      
      azureOpenAIService.makeRequest.mockResolvedValue(JSON.stringify({
        date: '2024-01-15',
        amount: 25.99,
        confidence: 0.85,
        reasoning: 'Test'
      }));
      
      dataService.detectDuplicates.mockResolvedValue({
        duplicates: [],
        uniqueTransactions: []
      });
      
      accountManagementService.getAccount.mockReturnValue({
        id: 'test-account',
        name: 'Test Account'
      });

      // Process the receipt to store it
      const result = await receiptProcessingService.processReceipt({
        file: mockFile,
        accountId: 'test-account'
      });

      // Retrieve the stored file
      const retrievedFile = await receiptProcessingService.getAttachedFile(result.attachedFile.id);

      expect(retrievedFile).toBeDefined();
      expect(retrievedFile?.originalName).toBe('receipt.pdf');
      expect(retrievedFile?.type).toBe('pdf');
    });

    it('should return null for non-existent file ID', async () => {
      const retrievedFile = await receiptProcessingService.getAttachedFile('non-existent-id');
      expect(retrievedFile).toBeNull();
    });
  });
});