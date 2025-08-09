import { AzureOpenAIService } from '../services/azureOpenAIService';
import { AIClassificationRequest } from '../types';

// Mock the fetch function
global.fetch = jest.fn();

describe('AzureOpenAI Service', () => {
  let service: AzureOpenAIService;
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
      id: 'transportation',
      name: 'Transportation',
      subcategories: [
        { id: 'gas', name: 'Gas & Fuel' },
        { id: 'public-transport', name: 'Public Transportation' }
      ]
    },
    {
      id: 'uncategorized',
      name: 'Uncategorized',
      subcategories: []
    }
  ];

  beforeEach(() => {
    service = new AzureOpenAIService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Catalog Constraint', () => {
    it('should constrain AI response to valid category IDs', async () => {
      // Mock successful AI response with valid category
      const mockResponse = {
        success: true,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                categoryId: 'food-dining',
                subcategoryId: 'restaurants',
                confidence: 0.85,
                reasoning: 'Transaction at restaurant'
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
        transactionText: 'McDonald\'s Restaurant',
        amount: -12.50,
        date: '2025-01-15',
        availableCategories: mockCategories
      };

      const result = await service.classifyTransaction(request);

      expect(result.categoryId).toBe('food-dining');
      expect(result.subcategoryId).toBe('restaurants');
      expect(result.confidence).toBe(0.85);
    });

    it('should map category name to ID when AI returns name instead of ID', async () => {
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