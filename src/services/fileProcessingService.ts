import { StatementFile, Transaction } from '../types';
import { accountManagementService, AccountDetectionRequest } from './accountManagementService';
// import { azureOpenAIService } from './azureOpenAIService'; // Future use for enhanced file parsing

export interface FileProcessingResult {
  file: StatementFile;
  needsAccountSelection: boolean;
  detectionResult?: {
    detectedAccountId?: string;
    confidence: number;
    reasoning: string;
    suggestedAccounts: Array<{
      accountId: string;
      confidence: number;
      reasoning: string;
    }>;
  };
  transactions?: Transaction[];
}

export class FileProcessingService {
  
  async processUploadedFile(file: File, accountId?: string): Promise<FileProcessingResult> {
    // Create initial StatementFile record
    const statementFile: StatementFile = {
      id: this.generateFileId(),
      filename: file.name,
      fileSize: file.size,
      uploadDate: new Date(),
      status: 'processing',
      fileType: this.getFileType(file.name)
    };

    try {
      // If accountId is provided, use it directly
      if (accountId) {
        statementFile.accountId = accountId;
        statementFile.status = 'completed';
        
        // Parse transactions and assign account
        const transactions = await this.parseFileTransactions(file, accountId);
        statementFile.transactionCount = transactions.length;

        return {
          file: statementFile,
          needsAccountSelection: false,
          transactions
        };
      }

      // Otherwise, try to detect the account from the file
      const detectionRequest: AccountDetectionRequest = {
        fileName: file.name,
        // In a real implementation, you might also parse some content from the file
        // fileContent: await this.extractFileContent(file)
      };

      const detectionResult = await accountManagementService.detectAccountFromFile(detectionRequest);
      
      // Update statement file with detection results
      statementFile.detectedAccountId = detectionResult.detectedAccountId;
      statementFile.accountDetectionConfidence = detectionResult.confidence;
      statementFile.accountDetectionReasoning = detectionResult.reasoning;

      // If we have high confidence detection (>= 0.8), auto-assign the account
      if (detectionResult.confidence >= 0.8 && detectionResult.detectedAccountId) {
        statementFile.accountId = detectionResult.detectedAccountId;
        statementFile.status = 'completed';
        
        // Parse transactions and assign account
        const transactions = await this.parseFileTransactions(file, detectionResult.detectedAccountId);
        statementFile.transactionCount = transactions.length;

        return {
          file: statementFile,
          needsAccountSelection: false,
          detectionResult,
          transactions
        };
      } else {
        // Need user to select account
        statementFile.status = 'awaiting-account-selection';
        
        return {
          file: statementFile,
          needsAccountSelection: true,
          detectionResult
        };
      }

    } catch (error) {
      console.error('Error processing file:', error);
      statementFile.status = 'error';
      statementFile.errorMessage = 'Failed to process file';
      
      return {
        file: statementFile,
        needsAccountSelection: true // Let user manually select account
      };
    }
  }

  async assignAccountToFile(fileId: string, accountId: string): Promise<Transaction[]> {
    // In a real implementation, you would:
    // 1. Retrieve the file from storage
    // 2. Parse transactions from the file
    // 3. Assign the account to all transactions
    // 4. Update the file status
    
    // For now, we'll simulate this with mock data
    const mockTransactions = await this.parseFileTransactions(null, accountId);
    return mockTransactions;
  }

  private async parseFileTransactions(file: File | null, accountId: string): Promise<Transaction[]> {
    // This is a simplified mock implementation
    // In a real application, you would:
    // 1. Parse CSV/Excel files using libraries like Papa Parse or xlsx
    // 2. Extract text from PDFs using PDF parsing libraries
    // 3. Use OCR for image files
    // 4. Apply AI classification to each transaction
    
    // Generate mock transactions for demonstration
    const currentDate = new Date();
    const mockTransactions: Transaction[] = [
      {
        id: `${Date.now()}-1`,
        date: new Date('2025-08-01'),
        amount: -125.50,
        description: 'Grocery Store Purchase',
        category: 'Food & Dining',
        subcategory: 'Groceries',
        account: accountManagementService.getAccount(accountId)?.name || 'Unknown Account',
        type: 'expense',
        confidence: 0.85,
        isVerified: false,
        originalText: 'GROCERY STORE 123 MAIN ST',
        addedDate: currentDate,
        lastModifiedDate: currentDate
      },
      {
        id: `${Date.now()}-2`,
        date: new Date('2025-08-02'),
        amount: -45.00,
        description: 'Gas Station',
        category: 'Transportation',
        subcategory: 'Fuel/Gas',
        account: accountManagementService.getAccount(accountId)?.name || 'Unknown Account',
        type: 'expense',
        confidence: 0.92,
        isVerified: false,
        originalText: 'SHELL GAS STATION',
        addedDate: currentDate,
        lastModifiedDate: currentDate
      },
      {
        id: `${Date.now()}-3`,
        date: new Date('2025-08-03'),
        amount: 2500.00,
        description: 'Direct Deposit - Salary',
        category: 'Salary & Wages',
        subcategory: 'Primary Job',
        account: accountManagementService.getAccount(accountId)?.name || 'Unknown Account',
        type: 'income',
        confidence: 0.95,
        isVerified: false,
        originalText: 'DIRECT DEPOSIT PAYROLL',
        addedDate: currentDate,
        lastModifiedDate: currentDate
      }
    ];

    // In a real implementation, you would also:
    // 1. Apply AI classification to determine categories
    // 2. Check for duplicates against existing transactions
    // 3. Validate transaction data
    
    return mockTransactions;
  }

  private getFileType(filename: string): 'pdf' | 'csv' | 'excel' | 'image' {
    const extension = filename.toLowerCase().split('.').pop();
    
    switch (extension) {
      case 'pdf':
        return 'pdf';
      case 'csv':
        return 'csv';
      case 'xlsx':
      case 'xls':
        return 'excel';
      case 'png':
      case 'jpg':
      case 'jpeg':
        return 'image';
      default:
        return 'csv'; // Default fallback
    }
  }

  private generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Future methods for real file parsing:
  
  /*
  private async extractFileContent(file: File): Promise<string> {
    // Implementation would depend on file type
    // - CSV: Use Papa Parse
    // - Excel: Use xlsx library
    // - PDF: Use pdf-parse or similar
    // - Images: Use OCR service
  }

  private async parseCSVTransactions(content: string, accountId: string): Promise<Transaction[]> {
    // Parse CSV content and convert to Transaction objects
  }

  private async parsePDFTransactions(file: File, accountId: string): Promise<Transaction[]> {
    // Extract text from PDF and parse transactions
  }

  private async parseImageTransactions(file: File, accountId: string): Promise<Transaction[]> {
    // Use OCR to extract text from image, then parse
  }
  */
}

// Singleton instance
export const fileProcessingService = new FileProcessingService();
