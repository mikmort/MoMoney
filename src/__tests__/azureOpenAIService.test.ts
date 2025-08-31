import { AzureOpenAIService } from '../services/azureOpenAIService';
import { AIClassificationRequest } from '../types';

// Mock the fetch function
global.fetch = jest.fn();

describe('AzureOpenAI Service', () => {
  let service: AzureOpenAIService;
  let originalEnv: any;
  const mockCategories = [
    {
      id: 'food-dining',
      name: 'Food & Dining',
      type: 'expense' as const,
      subcategories: [
        { id: 'restaurants', name: 'Restaurants' },
        { id: 'groceries', name: 'Groceries' }
      ]
    },
    {
      id: 'transportation',
      name: 'Transportation',
      type: 'expense' as const,
      subcategories: [
        { id: 'gas', name: 'Gas & Fuel' },
        { id: 'public-transport', name: 'Public Transportation' }
      ]
    },
    {
      id: 'uncategorized',
      name: 'Uncategorized',
      type: 'expense' as const,
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

  describe('Financial Edge Cases', () => {
    it('should handle extremely large transaction amounts without overflow', async () => {
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                categoryId: 'uncategorized',
                confidence: 0.3,
                reasoning: 'Unusual large amount transaction'
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
        transactionText: 'Large Investment Transfer',
        amount: -999999999.99, // Nearly a billion
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      const result = await service.classifyTransaction(request);

      expect(result.categoryId).toBe('uncategorized');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should handle malformed JSON responses gracefully', async () => {
      // Mock response with malformed JSON that could cause parsing errors
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: '{"categoryId": "food-dining", "confidence": invalid_number, "reasoning":}'
            }
          }]
        }
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const request: AIClassificationRequest = {
        transactionText: 'Coffee Shop',
        amount: -4.50,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      const result = await service.classifyTransaction(request);

      expect(result.categoryId).toBe('uncategorized');
      expect(result.confidence).toBe(0.1);
      expect(result.reasoning).toBe('Failed to classify using AI - using fallback');
    });

    it('should handle network timeout scenarios', async () => {
      // Mock network timeout
      (fetch as jest.Mock).mockImplementationOnce(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      );

      const request: AIClassificationRequest = {
        transactionText: 'Test Transaction',
        amount: -25.00,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      const result = await service.classifyTransaction(request);

      expect(result.categoryId).toBe('uncategorized');
      expect(result.confidence).toBe(0.1);
      expect(result.reasoning).toBe('Failed to classify using AI - using fallback');
    });

    it('should preserve category validation even with complex AI responses', async () => {
      // Mock AI response with category name instead of ID
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                categoryId: 'Food & Dining', // Name instead of ID
                subcategoryId: 'Restaurants', // Name instead of ID
                confidence: 0.75,
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
        transactionText: 'Burger King',
        amount: -8.99,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      const result = await service.classifyTransaction(request);

      expect(result.categoryId).toBe('food-dining');
      expect(result.subcategoryId).toBe('restaurants');
    });

    it('should fallback to uncategorized for invalid category ID', async () => {
      // Mock AI response with invalid category ID
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                categoryId: 'invalid-category',
                subcategoryId: 'invalid-sub',
                confidence: 0.90,
                reasoning: 'Invalid categorization'
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
        transactionText: 'Unknown Merchant',
        amount: -25.00,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      const result = await service.classifyTransaction(request);

      expect(result.categoryId).toBe('uncategorized');
      expect(result.subcategoryId).toBeUndefined();
      expect(result.confidence).toBe(0.90);
    });

    it('should clear invalid subcategory but keep valid category', async () => {
      // Mock AI response with valid category but invalid subcategory
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                categoryId: 'food-dining',
                subcategoryId: 'invalid-subcategory',
                confidence: 0.80,
                reasoning: 'Food transaction'
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
        transactionText: 'Food Truck',
        amount: -15.00,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      const result = await service.classifyTransaction(request);

      expect(result.categoryId).toBe('food-dining');
      expect(result.subcategoryId).toBeUndefined(); // Invalid subcategory should be cleared
      expect(result.confidence).toBe(0.80);
    });
  });

  describe('Fallback Behavior', () => {
    it('should return fallback when OpenAI proxy request fails', async () => {
      // Mock failed network request
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const request: AIClassificationRequest = {
        transactionText: 'Test Transaction',
        amount: -50.00,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      const result = await service.classifyTransaction(request);

      expect(result.categoryId).toBe('uncategorized');
      expect(result.confidence).toBe(0.1);
      expect(result.reasoning).toBe('Failed to classify using AI - using fallback');
    });

    it('should return fallback when OpenAI proxy returns error', async () => {
      // Mock error response from proxy
      const mockResponse = {
        success: false,
        error: 'OpenAI API error'
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const request: AIClassificationRequest = {
        transactionText: 'Test Transaction',
        amount: -30.00,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      const result = await service.classifyTransaction(request);

      expect(result.categoryId).toBe('uncategorized');
      expect(result.confidence).toBe(0.1);
      expect(result.reasoning).toBe('Failed to classify using AI - using fallback');
    });

    it('should return fallback when response content is invalid JSON', async () => {
      // Mock response with invalid JSON
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: 'Invalid JSON response'
            }
          }]
        }
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const request: AIClassificationRequest = {
        transactionText: 'Test Transaction',
        amount: -20.00,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      const result = await service.classifyTransaction(request);

      expect(result.categoryId).toBe('uncategorized');
      expect(result.confidence).toBe(0.1);
      expect(result.reasoning).toBe('Failed to classify using AI - using fallback');
    });

    it('should handle markdown code blocks in AI response', async () => {
      // Mock AI response wrapped in markdown code blocks
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: '```json\n{\n  "categoryId": "transportation",\n  "subcategoryId": "gas",\n  "confidence": 0.85,\n  "reasoning": "Gas station transaction"\n}\n```'
            }
          }]
        }
      };

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const request: AIClassificationRequest = {
        transactionText: 'Shell Gas Station',
        amount: -45.00,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      const result = await service.classifyTransaction(request);

      expect(result.categoryId).toBe('transportation');
      expect(result.subcategoryId).toBe('gas');
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toBe('Gas station transaction');
    });

    it('should provide default values for missing fields in AI response', async () => {
      // Mock AI response with missing fields
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                categoryId: 'food-dining'
                // Missing subcategoryId, confidence, and reasoning
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
        transactionText: 'Restaurant Transaction',
        amount: -25.00,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      const result = await service.classifyTransaction(request);

      expect(result.categoryId).toBe('food-dining');
      expect(result.subcategoryId).toBeUndefined();
      expect(result.confidence).toBe(0.5); // Default confidence
      expect(result.reasoning).toBe('AI classification'); // Default reasoning
    });
  });
});