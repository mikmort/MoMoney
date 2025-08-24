import { AzureOpenAIService } from '../services/azureOpenAIService';
import { AIClassificationRequest } from '../types';

// Mock the fetch function
global.fetch = jest.fn();

describe('PII Sanitization in Azure OpenAI Service', () => {
  let service: AzureOpenAIService;
  let originalEnv: any;
  const mockCategories = [
    {
      id: 'food-dining',
      name: 'Food & Dining',
      subcategories: [
        { id: 'restaurants', name: 'Restaurants' },
        { id: 'groceries', name: 'Groceries' }
      ]
    },
    {
      id: 'uncategorized',
      name: 'Uncategorized',
      subcategories: []
    }
  ];

  beforeEach(() => {
    // Store original environment
    originalEnv = process.env.REACT_APP_OPENAI_PROXY_URL;
    
    // Set proxy URL to enable the service
    process.env.REACT_APP_OPENAI_PROXY_URL = '/api/openai/chat/completions';
    
    service = new AzureOpenAIService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.REACT_APP_OPENAI_PROXY_URL = originalEnv;
    } else {
      delete process.env.REACT_APP_OPENAI_PROXY_URL;
    }
    
    jest.resetAllMocks();
  });

  describe('Transaction Description Sanitization', () => {
    it('should sanitize account numbers in transaction descriptions', async () => {
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                categoryId: 'food-dining',
                confidence: 0.8,
                reasoning: 'Restaurant transaction'
              })
            }
          }]
        }
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const request: AIClassificationRequest = {
        transactionText: 'Payment to account 1234567890 at STARBUCKS',
        amount: -5.50,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      await service.classifyTransaction(request);

      // Verify that the fetch was called with sanitized data
      const fetchCall = (fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const txMessage = requestBody.messages.find((msg: any) => msg.content.startsWith('TX:'));
      
      expect(txMessage.content).toContain('*******890'); // Account number should be masked
      expect(txMessage.content).toContain('STARBUCKS'); // Merchant name should be preserved
      expect(txMessage.content).not.toContain('1234567890'); // Original account number should not be present
    });

    it('should sanitize email addresses in transaction descriptions', async () => {
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                categoryId: 'uncategorized',
                confidence: 0.3,
                reasoning: 'Transfer transaction'
              })
            }
          }]
        }
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const request: AIClassificationRequest = {
        transactionText: 'Transfer to john.doe@example.com for lunch',
        amount: -25.00,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      await service.classifyTransaction(request);

      const fetchCall = (fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const txMessage = requestBody.messages.find((msg: any) => msg.content.startsWith('TX:'));
      
      expect(txMessage.content).toContain('[EMAIL]'); // Email should be replaced
      expect(txMessage.content).toContain('lunch'); // Other text should be preserved
      expect(txMessage.content).not.toContain('john.doe@example.com'); // Original email should not be present
    });

    it('should sanitize phone numbers in transaction descriptions', async () => {
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                categoryId: 'uncategorized',
                confidence: 0.3,
                reasoning: 'Contact transaction'
              })
            }
          }]
        }
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const request: AIClassificationRequest = {
        transactionText: 'Payment to contractor (555) 123-4567 for services',
        amount: -500.00,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      await service.classifyTransaction(request);

      const fetchCall = (fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const txMessage = requestBody.messages.find((msg: any) => msg.content.startsWith('TX:'));
      
      expect(txMessage.content).toContain('[PHONE]'); // Phone number should be replaced
      expect(txMessage.content).toContain('contractor'); // Other text should be preserved
      expect(txMessage.content).toContain('services'); // Other text should be preserved
      expect(txMessage.content).not.toContain('(555) 123-4567'); // Original phone should not be present
    });

    it('should sanitize addresses in transaction descriptions', async () => {
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                categoryId: 'food-dining',
                confidence: 0.7,
                reasoning: 'Delivery transaction'
              })
            }
          }]
        }
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const request: AIClassificationRequest = {
        transactionText: 'PIZZA DELIVERY to 123 Main Street',
        amount: -18.50,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      await service.classifyTransaction(request);

      const fetchCall = (fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const txMessage = requestBody.messages.find((msg: any) => msg.content.startsWith('TX:'));
      
      expect(txMessage.content).toContain('[ADDRESS]'); // Address should be replaced
      expect(txMessage.content).toContain('PIZZA DELIVERY'); // Business name should be preserved
      expect(txMessage.content).not.toContain('123 Main Street'); // Original address should not be present
    });

    it('should handle multiple types of PII in one transaction', async () => {
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                categoryId: 'uncategorized',
                confidence: 0.2,
                reasoning: 'Complex transaction with multiple PII types'
              })
            }
          }]
        }
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const request: AIClassificationRequest = {
        transactionText: 'Payment 1234567890 to contractor@work.com at 456 Oak Ave, call (555) 987-6543',
        amount: -750.00,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      await service.classifyTransaction(request);

      const fetchCall = (fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const txMessage = requestBody.messages.find((msg: any) => msg.content.startsWith('TX:'));
      
      expect(txMessage.content).toContain('*******890'); // Account number masked
      expect(txMessage.content).toContain('[EMAIL]'); // Email replaced
      expect(txMessage.content).toContain('[ADDRESS]'); // Address replaced  
      expect(txMessage.content).toContain('[PHONE]'); // Phone replaced
      expect(txMessage.content).toContain('Payment'); // Other text preserved
      
      // Verify original PII is not present
      expect(txMessage.content).not.toContain('1234567890');
      expect(txMessage.content).not.toContain('contractor@work.com');
      expect(txMessage.content).not.toContain('456 Oak Ave');
      expect(txMessage.content).not.toContain('(555) 987-6543');
    });

    it('should preserve merchant names and transaction context', async () => {
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                categoryId: 'food-dining',
                confidence: 0.9,
                reasoning: 'Clear restaurant transaction'
              })
            }
          }]
        }
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const request: AIClassificationRequest = {
        transactionText: 'MCDONALDS #456 PURCHASE AUTH #123456',
        amount: -8.99,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      await service.classifyTransaction(request);

      const fetchCall = (fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const txMessage = requestBody.messages.find((msg: any) => msg.content.startsWith('TX:'));
      
      expect(txMessage.content).toContain('MCDONALDS #456'); // Merchant name preserved
      expect(txMessage.content).toContain('PURCHASE'); // Transaction type preserved
      expect(txMessage.content).toContain('AUTH #***456'); // Auth number masked (6 digits treated as potential account number)
    });
  });

  describe('Batch Processing Sanitization', () => {
    it('should sanitize PII in batch transaction processing', async () => {
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: JSON.stringify([
                { categoryId: 'food-dining', confidence: 0.8, reasoning: 'Restaurant' },
                { categoryId: 'uncategorized', confidence: 0.3, reasoning: 'Transfer' }
              ])
            }
          }]
        }
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const requests: AIClassificationRequest[] = [
        {
          transactionText: 'STARBUCKS payment from account 1111222233',
          amount: -5.50,
          date: '2025-01-15',
          availableCategories: mockCategories
        },
        {
          transactionText: 'Transfer to alice@example.com',
          amount: -100.00,
          date: '2025-01-16', 
          availableCategories: mockCategories
        }
      ];

      await service.classifyTransactionsBatch(requests);

      const fetchCall = (fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const txMessage = requestBody.messages.find((msg: any) => msg.content.startsWith('TX:'));
      
      // Verify PII sanitization in batch data
      expect(txMessage.content).toContain('*******233'); // Account number masked
      expect(txMessage.content).toContain('[EMAIL]'); // Email replaced
      expect(txMessage.content).toContain('STARBUCKS'); // Merchant preserved
      expect(txMessage.content).toContain('Transfer'); // Context preserved
      
      // Verify original PII not present
      expect(txMessage.content).not.toContain('1111222233');
      expect(txMessage.content).not.toContain('alice@example.com');
    });
  });
});