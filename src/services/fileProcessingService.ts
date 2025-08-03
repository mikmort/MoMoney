import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { StatementFile, Transaction, FileSchemaMapping, FileImportProgress, Category, Subcategory, AISchemaMappingRequest, AISchemaMappingResponse, AIClassificationRequest, AIClassificationResponse } from '../types';
import { accountManagementService, AccountDetectionRequest } from './accountManagementService';
import { azureOpenAIService } from './azureOpenAIService';
import { dataService } from './dataService';
import { defaultCategories } from '../data/defaultCategories';
import { v4 as uuidv4 } from 'uuid';

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
  private activeImports = new Map<string, FileImportProgress>();
  private cancellationTokens = new Map<string, boolean>();
  
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
    if (!file) {
      // For the case where assignAccountToFile calls this with null file
      // Return empty array for now - in production this would load from storage
      return [];
    }

    try {
      // Step 1: Read file content
      const fileContent = await this.readFileContent(file);
      
      // Step 2: Get schema mapping from AI
      const fileType = this.getFileType(file.name);
      const schemaMapping = await this.getAISchemaMapping(fileContent, fileType);
      
      // Step 3: Parse file data
      const rawData = await this.parseFileData(fileContent, fileType, schemaMapping.mapping);
      
      // Step 4: Convert to transactions with AI classification
      const categories = defaultCategories;
      const subcategories = defaultCategories.flatMap(cat => cat.subcategories);
      
      const transactions = await this.processTransactions(
        'temp-file-id',
        rawData,
        schemaMapping.mapping,
        categories,
        subcategories,
        accountId
      );
      
      return transactions;
      
    } catch (error) {
      console.error('Error parsing file transactions:', error);
      // Return empty array instead of mock data on error
      return [];
    }
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

  // Legacy compatibility method for existing FileImport component
  async processFile(
    file: File, 
    categories: any[], 
    subcategories: any[],
    accountId: string,
    onProgress?: (progress: any) => void
  ): Promise<{ statementFile: any; fileId: string }> {
    
    if (onProgress) {
      onProgress({
        fileId: 'temp-id',
        status: 'processing',
        progress: 50,
        currentStep: 'Processing file...',
        processedRows: 0,
        totalRows: 0,
        errors: []
      });
    }

    const result = await this.processUploadedFile(file, accountId);
    
    if (onProgress) {
      onProgress({
        fileId: result.file.id,
        status: 'completed',
        progress: 100,
        currentStep: 'File processing completed',
        processedRows: result.transactions?.length || 0,
        totalRows: result.transactions?.length || 0,
        errors: []
      });
    }

    return {
      statementFile: {
        ...result.file,
        status: result.needsAccountSelection ? 'awaiting-account-selection' : 'completed',
        transactionCount: result.transactions?.length || 0
      },
      fileId: result.file.id
    };
  }

  // Legacy compatibility method
  cancelImport(fileId: string): void {
    console.log(`Cancelling import for file: ${fileId}`);
    // Implementation would depend on how we want to handle cancellation
  }

  // Generate unique file ID
  private generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Method to cancel an active import
  private isCancelled(fileId: string): boolean {
    return this.cancellationTokens.get(fileId) === true;
  }

  // Clean up after import completion or cancellation
  private cleanup(fileId: string): void {
    this.activeImports.delete(fileId);
    this.cancellationTokens.delete(fileId);
  }

  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          resolve(result);
        } else if (result instanceof ArrayBuffer) {
          // For binary files like Excel
          resolve(new Uint8Array(result).toString());
        } else {
          reject(new Error('Failed to read file content'));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      
      if (file.type.includes('text') || file.name.endsWith('.csv') || file.name.endsWith('.ofx')) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  }

  private async getAISchemaMapping(fileContent: string, fileType: StatementFile['fileType']): Promise<AISchemaMappingResponse> {
    try {
      // Get a sample of the file content for AI analysis
      const sampleContent = this.getSampleContent(fileContent, fileType);
      
      const request: AISchemaMappingRequest = {
        fileContent: sampleContent,
        fileType,
        targetSchema: ['date', 'description', 'notes', 'category', 'subcategory', 'amount'],
      };

      const prompt = `Analyze this ${fileType.toUpperCase()} file content and map it to our transaction schema.

Target schema fields:
- date: Transaction date
- description: Transaction description  
- notes: Additional notes (optional)
- category: Transaction category (optional in source)
- subcategory: Transaction subcategory (optional in source)
- amount: Transaction amount

File content sample:
${request.fileContent}

Return ONLY a clean JSON response:
{
  "mapping": {
    "dateColumn": "column_name_or_index",
    "descriptionColumn": "column_name_or_index", 
    "amountColumn": "column_name_or_index",
    "categoryColumn": "column_name_or_index",
    "subcategoryColumn": "column_name_or_index",
    "notesColumn": "column_name_or_index",
    "hasHeaders": true/false,
    "skipRows": 0,
    "dateFormat": "DD.MM.YYYY or MM/DD/YYYY or YYYY-MM-DD etc",
    "amountFormat": "positive for debits or credits"
  },
  "confidence": 0.85,
  "reasoning": "Explanation of the mapping decisions",
  "suggestions": ["Any suggestions for the user"]
}`;

      const response = await azureOpenAIService.makeRequest(prompt);
      
      try {
        const cleanedResponse = this.cleanAIResponse(response);
        const aiResponse = JSON.parse(cleanedResponse);
        return aiResponse;
      } catch (parseError) {
        console.warn('Failed to parse AI schema mapping response:', parseError);
        return this.getDefaultSchemaMapping(fileType);
      }
    } catch (error) {
      console.warn('AI schema mapping failed, using default:', error);
      return this.getDefaultSchemaMapping(fileType);
    }
  }

  private getSampleContent(content: string, fileType: StatementFile['fileType']): string {
    if (fileType === 'csv') {
      const lines = content.split('\n').slice(0, 10);
      return lines.join('\n');
    }
    return content.substring(0, 2000);
  }

  private getDefaultSchemaMapping(fileType: StatementFile['fileType']): AISchemaMappingResponse {
    const mapping: FileSchemaMapping = {
      hasHeaders: true,
      skipRows: 0,
      dateFormat: 'MM/DD/YYYY',
      amountFormat: 'negative for debits',
      dateColumn: '0',
      descriptionColumn: '1',
      amountColumn: '2'
    };

    return {
      mapping,
      confidence: 0.5,
      reasoning: 'Using default mapping due to AI analysis failure',
      suggestions: ['Please verify the column mappings are correct'],
    };
  }

  private async parseFileData(content: string, fileType: StatementFile['fileType'], mapping: FileSchemaMapping): Promise<any[]> {
    switch (fileType) {
      case 'csv':
        return this.parseCSV(content, mapping);
      case 'excel':
        return this.parseExcel(content, mapping);
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  private async parseCSV(content: string, mapping: FileSchemaMapping): Promise<any[]> {
    return new Promise((resolve, reject) => {
      Papa.parse(content, {
        header: mapping.hasHeaders,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            console.warn('CSV parsing warnings:', results.errors);
          }
          
          let data = results.data;
          if (mapping.skipRows && mapping.skipRows > 0) {
            data = data.slice(mapping.skipRows);
          }
          
          resolve(data);
        },
        error: (error: any) => reject(error),
      });
    });
  }

  private async parseExcel(content: string, mapping: FileSchemaMapping): Promise<any[]> {
    try {
      const workbook = XLSX.read(content, { type: 'string' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      let data = XLSX.utils.sheet_to_json(firstSheet, { 
        header: mapping.hasHeaders ? 1 : undefined 
      });
      
      if (mapping.skipRows && mapping.skipRows > 0) {
        data = data.slice(mapping.skipRows);
      }
      
      return data;
    } catch (error) {
      throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processTransactions(
    fileId: string,
    rawData: any[],
    mapping: FileSchemaMapping,
    categories: Category[],
    subcategories: Subcategory[],
    accountId: string,
    onProgress?: (processed: number) => void
  ): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    
    for (let i = 0; i < rawData.length; i++) {
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      const transaction = await this.processRow(rawData[i], mapping, categories, subcategories, accountId);
      if (transaction) {
        const fullTransaction: Transaction = {
          ...transaction,
          id: uuidv4(),
          addedDate: new Date(),
          lastModifiedDate: new Date()
        };
        transactions.push(fullTransaction);
      }

      if (onProgress) {
        onProgress(i + 1);
      }
    }

    return transactions;
  }

  private async processRow(
    row: any,
    mapping: FileSchemaMapping,
    categories: Category[],
    subcategories: Subcategory[],
    accountId: string
  ): Promise<Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> | null> {
    try {
      const date = this.extractDate(row, mapping.dateColumn, mapping.dateFormat);
      const description = this.extractString(row, mapping.descriptionColumn);
      const amount = this.extractAmount(row, mapping.amountColumn);
      const notes = this.extractString(row, mapping.notesColumn);

      if (!date || !description || amount === null) {
        return null;
      }

      // Get AI categorization
      const aiClassification = await this.getAIClassification(
        description, 
        amount, 
        date.toISOString(), 
        categories, 
        subcategories
      );

      const transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
        date,
        description,
        notes,
        category: aiClassification.categoryId || 'Uncategorized',
        subcategory: aiClassification.subcategoryId,
        amount,
        account: accountManagementService.getAccount(accountId)?.name || 'Unknown Account',
        confidence: aiClassification.confidence,
        reasoning: aiClassification.reasoning,
        type: amount >= 0 ? 'income' : 'expense',
        isVerified: false,
        originalText: description
      };

      return transaction;
    } catch (error) {
      console.warn('Failed to process row:', row, error);
      return null;
    }
  }

  private extractDate(row: any, column?: string, format?: string): Date | null {
    if (!column) return null;
    
    const value = this.getColumnValue(row, column);
    if (!value) return null;

    try {
      const dateStr = String(value).trim();
      
      // Handle European format DD.MM.YYYY
      const europeanMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (europeanMatch) {
        const [, day, month, year] = europeanMatch;
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
      
      // Try parsing as-is first  
      let date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date;
      }

      return null;
    } catch {
      return null;
    }
  }

  private extractString(row: any, column?: string): string {
    if (!column) return '';
    const value = this.getColumnValue(row, column);
    return value ? String(value).trim() : '';
  }

  private extractAmount(row: any, column?: string): number | null {
    if (!column) return null;
    
    const value = this.getColumnValue(row, column);
    if (!value) return null;

    try {
      const valueStr = String(value).trim();
      
      // Handle European number format (e.g., "500.000,00")
      if (/^\-?[\d\.]+,\d+$/.test(valueStr)) {
        const cleanAmount = valueStr
          .replace(/\./g, '')
          .replace(',', '.');
        const amount = parseFloat(cleanAmount);
        return isNaN(amount) ? null : amount;
      }
      
      // Handle standard US format
      const cleanAmount = valueStr
        .replace(/[\$,\s]/g, '')
        .replace(/[()]/g, '');
      
      const amount = parseFloat(cleanAmount);
      return isNaN(amount) ? null : amount;
    } catch {
      return null;
    }
  }

  private getColumnValue(row: any, column: string): any {
    if (Array.isArray(row)) {
      const index = parseInt(column);
      return !isNaN(index) ? row[index] : null;
    } else {
      return row[column];
    }
  }

  private async getAIClassification(
    description: string, 
    amount: number, 
    date: string, 
    categories: Category[], 
    subcategories: Subcategory[]
  ): Promise<AIClassificationResponse> {
    try {
      const response = await azureOpenAIService.classifyTransaction({
        transactionText: description,
        amount,
        date,
        availableCategories: categories
      });
      
      return response;
    } catch (error) {
      console.error('AI classification failed:', error);
      return {
        categoryId: 'Uncategorized',
        confidence: 0.1,
        reasoning: 'AI classification failed, using default category',
      };
    }
  }

  private cleanAIResponse(response: string): string {
    let cleaned = response.trim();
    
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '');
    }
    
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/\s*```$/, '');
    }
    
    return cleaned.trim();
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
