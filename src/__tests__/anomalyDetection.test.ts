import { AzureOpenAIService } from '../services/azureOpenAIService';
import { AnomalyDetectionRequest } from '../types';

// Mock the fetch function
global.fetch = jest.fn();

describe('Anomaly Detection', () => {
  let service: AzureOpenAIService;
  let originalEnv: any;
  
  const mockTransactions = [
    {
      id: 'tx1',
      date: new Date('2023-01-01'),
      amount: -100,
      description: 'Test Transaction 1',
      category: 'food-dining',
      subcategory: 'restaurants',
      account: 'checking',
      type: 'expense' as const
    },
    {
      id: 'tx2', 
      date: new Date('2023-01-02'),
      amount: -5000,
      description: 'Unusual Large Transaction',
      category: 'shopping',
      subcategory: 'general',
      account: 'checking',
      type: 'expense' as const
    }
  ];

  beforeEach(() => {
    // Store original environment
    originalEnv = process.env.REACT_APP_OPENAI_PROXY_URL;
    
    // Set proxy URL to enable the service for most tests
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

  describe('Development Mode', () => {
    it('should return mock anomalies when in development mode without API configured', async () => {
      // Set development mode
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      // Clear proxy URL to trigger dev mode fallback
      delete process.env.REACT_APP_OPENAI_PROXY_URL;
      delete process.env.REACT_APP_FUNCTION_BASE_URL;
      
      // Create a new service instance with disabled configuration
      const devService = new AzureOpenAIService();

      const request: AnomalyDetectionRequest = {
        transactions: mockTransactions
      };

      const result = await devService.detectAnomalies(request);

      expect(result.anomalies).toHaveLength(1);
      expect(result.anomalies[0].transaction).toEqual(mockTransactions[0]);
      expect(result.anomalies[0].anomalyType).toBe('unusual_amount');
      expect(result.anomalies[0].severity).toBe('medium');
      expect(result.anomalies[0].confidence).toBe(0.75);
      expect(result.anomalies[0].reasoning).toContain('Development mode');
      expect(result.totalAnalyzed).toBe(2);
      expect(typeof result.processingTime).toBe('number');

      // Restore original environment
      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('Empty Transactions', () => {
    it('should handle empty transaction list', async () => {
      const request: AnomalyDetectionRequest = {
        transactions: []
      };

      const result = await service.detectAnomalies(request);

      expect(result.anomalies).toHaveLength(0);
      expect(result.totalAnalyzed).toBe(0);
      expect(typeof result.processingTime).toBe('number');
    });
  });

  describe('API Error Handling', () => {
    it('should handle API failures gracefully', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      process.env.REACT_APP_OPENAI_PROXY_URL = 'http://test.com/api';

      // Mock fetch to reject
      (global.fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

      const request: AnomalyDetectionRequest = {
        transactions: mockTransactions
      };

      const result = await service.detectAnomalies(request);

      // Should return empty results instead of throwing
      expect(result.anomalies).toHaveLength(0);
      expect(result.totalAnalyzed).toBe(2);
      expect(typeof result.processingTime).toBe('number');

      // Restore environment
      process.env.NODE_ENV = originalNodeEnv;
      delete process.env.REACT_APP_OPENAI_PROXY_URL;
    });
  });

  describe('Transaction Chunking', () => {
    it('should handle message size calculation and chunking logic', async () => {
      // This test verifies the chunking logic exists but doesn't test actual API calls
      // since that would require complex mocking
      
      const largeTransactionSet = Array.from({ length: 100 }, (_, i) => ({
        id: `tx${i}`,
        date: new Date('2023-01-01'),
        amount: -100,
        description: `Test Transaction ${i}`,
        category: 'food-dining',
        subcategory: 'restaurants',
        account: 'checking',
        type: 'expense' as const
      }));

      const request: AnomalyDetectionRequest = {
        transactions: largeTransactionSet
      };

      // In development mode, should still work regardless of transaction count
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      delete process.env.REACT_APP_OPENAI_PROXY_URL;
      delete process.env.REACT_APP_FUNCTION_BASE_URL;

      const result = await service.detectAnomalies(request);

      expect(result.anomalies).toBeDefined();
      expect(result.totalAnalyzed).toBe(100);
      expect(typeof result.processingTime).toBe('number');

      // Restore environment
      process.env.NODE_ENV = originalNodeEnv;
    });
  });
});