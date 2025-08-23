import { fileProcessingService } from '../services/fileProcessingService';
import { azureOpenAIService } from '../services/azureOpenAIService';

// Mock the entire pdfjs-dist module
jest.mock('pdfjs-dist', () => {
  const mockPage = {
    getTextContent: jest.fn(() => Promise.resolve({
      items: [
        { str: 'Bank Statement' },
        { str: 'Date' },
        { str: 'Description' },
        { str: 'Amount' },
        { str: '01/15/2024' },
        { str: 'STARBUCKS STORE #123' },
        { str: '-4.85' },
        { str: '01/16/2024' },
        { str: 'GROCERY OUTLET' },
        { str: '-25.40' },
        { str: '01/17/2024' },
        { str: 'DEPOSIT - PAYCHECK' },
        { str: '2500.00' }
      ]
    }))
  };

  const mockPDF = {
    numPages: 1,
    getPage: jest.fn(() => Promise.resolve(mockPage))
  };

  const mockLoadingTask = {
    promise: Promise.resolve(mockPDF)
  };

  return {
    getDocument: jest.fn(() => mockLoadingTask),
    GlobalWorkerOptions: {
      workerSrc: ''
    }
  };
});

// Mock the Azure OpenAI service to return structured transaction data
const originalMakeRequest = azureOpenAIService.makeRequest;

describe('PDF Transaction Import', () => {
  beforeEach(() => {
    // Only clear specific mock calls, not implementations
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore original implementation
    jest.restoreAllMocks();
  });

  test('should detect PDF file type correctly', () => {
    const service = fileProcessingService as any;
    expect(service.getFileType('statement.pdf')).toBe('pdf');
    expect(service.getFileType('STATEMENT.PDF')).toBe('pdf');
    expect(service.getFileType('bank-statement.pdf')).toBe('pdf');
  });

  test('should extract text from PDF using pdfjs-dist', async () => {
    const service = fileProcessingService as any;
    
    // Mock PDF content as base64
    const mockBase64Content = Buffer.from('fake pdf content').toString('base64');
    
    const extractedText = await service.extractTextFromPDF(mockBase64Content);
    
    // Test that the mocked PDF.js functions were called
    const pdfjsLib = require('pdfjs-dist');
    expect(pdfjsLib.getDocument).toHaveBeenCalled();
    expect(extractedText).toContain('Bank Statement');
    expect(extractedText).toContain('STARBUCKS STORE #123');
    expect(extractedText).toContain('GROCERY OUTLET');
    expect(extractedText).toContain('DEPOSIT - PAYCHECK');
  });

  test('should use AI to extract structured transactions from PDF text', async () => {
    const service = fileProcessingService as any;
    
    // Set up a spy to see what's happening with the AI service
    const mockMakeRequest = jest.spyOn(azureOpenAIService, 'makeRequest');
    mockMakeRequest.mockResolvedValue(JSON.stringify([
      {
        date: '2024-01-15',
        description: 'STARBUCKS STORE #123',
        amount: -4.85,
        category: 'Food & Dining'
      },
      {
        date: '2024-01-16', 
        description: 'GROCERY OUTLET',
        amount: -25.40,
        category: 'Groceries'
      },
      {
        date: '2024-01-17',
        description: 'DEPOSIT - PAYCHECK',
        amount: 2500.00,
        category: 'Income'
      }
    ]));
    
    const mockPDFText = 'Bank Statement Date Description Amount 01/15/2024 STARBUCKS STORE #123 -4.85';
    
    const transactions = await service.extractTransactionsFromPDFWithAI(mockPDFText);
    
    expect(azureOpenAIService.makeRequest).toHaveBeenCalledWith(
      expect.stringContaining('Extract bank statement transactions as pure JSON array'),
      2000
    );
    
    expect(transactions).toHaveLength(3);
    expect(transactions[0]).toEqual({
      date: '2024-01-15',
      description: 'STARBUCKS STORE #123',
      amount: -4.85,
      category: 'Food & Dining'
    });
    expect(transactions[1]).toEqual({
      date: '2024-01-16',
      description: 'GROCERY OUTLET', 
      amount: -25.40,
      category: 'Groceries'
    });
    expect(transactions[2]).toEqual({
      date: '2024-01-17',
      description: 'DEPOSIT - PAYCHECK',
      amount: 2500.00,
      category: 'Income'
    });
  });

  test('should handle AI extraction failures gracefully', async () => {
    const service = fileProcessingService as any;
    
    // Mock AI failure for this specific test
    const mockFailure = jest.spyOn(azureOpenAIService, 'makeRequest')
      .mockRejectedValueOnce(new Error('AI service unavailable'));
    
    const mockPDFText = 'Some PDF text';
    const transactions = await service.extractTransactionsFromPDFWithAI(mockPDFText);
    
    // Should return empty array on failure rather than throwing
    expect(transactions).toEqual([]);
    
    // Restore the mock for other tests
    mockFailure.mockRestore();
  });

  test('should handle malformed AI JSON response gracefully', async () => {
    const service = fileProcessingService as any;
    
    // Mock invalid JSON response for this specific test
    const mockInvalidResponse = jest.spyOn(azureOpenAIService, 'makeRequest')
      .mockResolvedValueOnce('invalid json response');
    
    const mockPDFText = 'Some PDF text';
    const transactions = await service.extractTransactionsFromPDFWithAI(mockPDFText);
    
    // Should return empty array on parsing failure
    expect(transactions).toEqual([]);
    
    // Restore the mock for other tests
    mockInvalidResponse.mockRestore();
  });

  test('should parse PDF files through the main parseFileData method', async () => {
    const service = fileProcessingService as any;
    
    const mockSchemaMapping = {
      hasHeaders: true,
      skipRows: 0,
      dateFormat: 'YYYY-MM-DD',
      amountFormat: 'negative for debits',
      dateColumn: 'date',
      descriptionColumn: 'description', 
      amountColumn: 'amount'
    };

    // Mock base64 PDF content
    const mockBase64Content = Buffer.from('fake pdf content').toString('base64');
    
    const result = await service.parseFileData(mockBase64Content, 'pdf', mockSchemaMapping);
    
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      date: '2024-01-15',
      description: 'STARBUCKS STORE #123',
      amount: -4.85,
      category: 'Food & Dining'
    });
  });

  test('should handle PDF text extraction errors', async () => {
    const service = fileProcessingService as any;
    
    // Mock PDF.js failure for this specific test
    const pdfjsLib = require('pdfjs-dist');
    const originalGetDocument = pdfjsLib.getDocument;
    pdfjsLib.getDocument = jest.fn(() => ({
      promise: Promise.reject(new Error('Invalid PDF'))
    }));
    
    const mockBase64Content = Buffer.from('invalid pdf').toString('base64');
    
    await expect(service.extractTextFromPDF(mockBase64Content))
      .rejects.toThrow('PDF text extraction failed');
    
    // Restore original mock
    pdfjsLib.getDocument = originalGetDocument;
  });

  test('should handle various PDF base64 formats', async () => {
    const service = fileProcessingService as any;
    
    // Test with data URL prefix
    const validBase64 = Buffer.from('fake pdf content').toString('base64');
    const dataUrlContent = `data:application/pdf;base64,${validBase64}`;
    await service.extractTextFromPDF(dataUrlContent);
    
    // Test with plain base64
    await service.extractTextFromPDF(validBase64);
    
    const pdfjsLib = require('pdfjs-dist');
    expect(pdfjsLib.getDocument).toHaveBeenCalledTimes(2);
  });

  test('should handle AI responses with markdown code blocks', async () => {
    const service = fileProcessingService as any;
    
    // Mock AI response with markdown code blocks
    const mockMarkdownResponse = jest.spyOn(azureOpenAIService, 'makeRequest')
      .mockResolvedValueOnce(`\`\`\`json
[
  {
    "date": "2024-01-15",
    "description": "TEST TRANSACTION",
    "amount": -10.00,
    "category": "Test"
  }
]
\`\`\``);
    
    const mockPDFText = 'Some PDF text';
    const transactions = await service.extractTransactionsFromPDFWithAI(mockPDFText);
    
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toEqual({
      date: '2024-01-15',
      description: 'TEST TRANSACTION',
      amount: -10.00,
      category: 'Test'
    });
    
    // Restore the mock
    mockMarkdownResponse.mockRestore();
  });
});