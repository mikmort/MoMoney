import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { StatementFile, Transaction, FileSchemaMapping, FileImportProgress, Category, Subcategory, AISchemaMappingRequest, AISchemaMappingResponse, AIClassificationRequest, AIClassificationResponse, DuplicateDetectionResult } from '../types';
import { accountManagementService, AccountDetectionRequest } from './accountManagementService';
import { azureOpenAIService } from './azureOpenAIService';
import { dataService } from './dataService';
import { rulesService } from './rulesService';
import { transferDetectionService } from './transferDetectionService';
import { defaultCategories } from '../data/defaultCategories';
import { currencyDisplayService } from './currencyDisplayService';
import { userPreferencesService } from './userPreferencesService';
import { sanitizeFileContent } from '../utils/piiSanitization';
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
  duplicateDetection?: DuplicateDetectionResult;
  needsDuplicateResolution?: boolean;
  currencyPrompt?: {
    detectedCurrencies: string[];
    currentDefaultCurrency: string;
    suggestCurrencyChange?: string;
    message: string;
  };
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

        // Analyze currencies and create prompt if needed
        const currencyPrompt = await this.analyzeCurrenciesAndCreatePrompt(transactions);

        return {
          file: statementFile,
          needsAccountSelection: false,
          transactions,
          currencyPrompt
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

      // If we have very high confidence detection (>= 0.95), auto-assign the account
      if (detectionResult.confidence >= 0.95 && detectionResult.detectedAccountId) {
        statementFile.accountId = detectionResult.detectedAccountId;
        statementFile.status = 'completed';
        
        // Parse transactions and assign account
        const transactions = await this.parseFileTransactions(file, detectionResult.detectedAccountId);
        statementFile.transactionCount = transactions.length;

        // Analyze currencies and create prompt if needed
        const currencyPrompt = await this.analyzeCurrenciesAndCreatePrompt(transactions);

        return {
          file: statementFile,
          needsAccountSelection: false,
          detectionResult,
          transactions,
          currencyPrompt
        };
      } else {
        // Need user to select account
        statementFile.status = 'awaiting-account-selection';
        
        return {
          file: statementFile,
          needsAccountSelection: true,
          detectionResult: detectionResult.confidence >= 0.6 ? detectionResult : undefined // Only show AI result if confidence is medium or higher
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

  async assignAccountToFile(fileId: string, accountId: string, file?: File | null): Promise<Transaction[]> {
    // In a real implementation, you would:
    // 1. Retrieve the file from storage
    // 2. Parse transactions from the file
    // 3. Assign the account to all transactions
    // 4. Update the file status
    
    console.log(`🏦 assignAccountToFile: Called with fileId=${fileId}, accountId=${accountId}, file=${file?.name || 'null'}`);
    
    if (file) {
      // If we have the file, use our sophisticated parsing
      const transactions = await this.parseFileTransactions(file, accountId);
      return transactions;
    } else {
      // Fallback: no file provided, return empty array
      console.log('⚠️ assignAccountToFile: No file provided, returning empty array');
      return [];
    }
  }

  private async parseFileTransactions(file: File | null, accountId: string): Promise<Transaction[]> {
    if (!file) {
      // For the case where assignAccountToFile calls this with null file
      // Return empty array for now - in production this would load from storage
      console.log('📝 parseFileTransactions: No file provided, returning empty array');
      return [];
    }

    console.log(`🔍 parseFileTransactions: Starting to parse file "${file.name}" for account "${accountId}"`);

    try {
      // Step 1: Read file content
      console.log('📖 Step 1: Reading file content...');
      const fileContent = await this.readFileContent(file);
      console.log(`✅ File content read, length: ${fileContent.length} characters`);
      
      // Step 2: Get schema mapping from AI
      console.log('🤖 Step 2: Getting AI schema mapping...');
      const fileType = this.getFileType(file.name);
      console.log(`📋 File type detected: ${fileType}`);
      const schemaMapping = await this.getAISchemaMapping(fileContent, fileType);
      console.log('✅ Schema mapping received:', schemaMapping);
      
      // Step 3: Parse file data
      console.log('⚙️ Step 3: Parsing file data...');
      const rawData = await this.parseFileData(fileContent, fileType, schemaMapping.mapping);
      console.log(`✅ Raw data parsed, ${rawData.length} rows found`);
      
      // Step 4: Convert to transactions with AI classification
      console.log('🏷️ Step 4: Starting AI classification...');
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
      
      console.log(`🎉 Successfully processed ${transactions.length} transactions`);
      console.log('📊 Sample transactions:', transactions.slice(0, 2));
      return transactions;
      
    } catch (error) {
      console.error('💥 Error parsing file transactions:', error);
      console.error('📊 Error details:', {
        fileName: file.name,
        fileSize: file.size,
        accountId,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined
      });
      // Return empty array instead of mock data on error
      return [];
    }
  }

  private getFileType(filename: string): 'pdf' | 'csv' | 'excel' | 'image' | 'ofx' | 'unknown' {
    const extension = filename.toLowerCase().split('.').pop();
    
    switch (extension) {
      case 'pdf':
        return 'pdf';
      case 'csv':
        return 'csv';
      case 'xlsx':
      case 'xls':
        return 'excel';
      case 'ofx':
        return 'ofx';
      case 'png':
      case 'jpg':
      case 'jpeg':
        return 'image';
      default:
        return 'unknown'; // Fallback for unknown extensions
    }
  }

  // Lightweight filename pattern detection for tests to introspect without AI
  // Not used in production flows directly
  /* istanbul ignore next */
  public detectAccountPatterns?(filename: string): string[] {
    const name = filename.toLowerCase();
    const hits: string[] = [];
    if (name.includes('chase')) hits.push('chase');
    if (name.includes('bank_of_america') || name.includes('boa')) hits.push('bank-of-america');
    if (name.includes('amex') || name.includes('american express')) hits.push('amex');
    return hits;
  }

  // Legacy compatibility method for existing FileImport component
  async processFile(
    file: File,
    categories: Category[],
    subcategories: Subcategory[],
    accountId: string,
    onProgress?: (progress: FileImportProgress) => void,
    onFileIdGenerated?: (fileId: string) => void
  ): Promise<{ 
    statementFile: StatementFile; 
    fileId: string;
    duplicateDetection?: DuplicateDetectionResult;
    needsDuplicateResolution?: boolean;
  }> {
    const fileId = uuidv4();
    
    // Notify caller of the fileId immediately so they can cancel if needed
    if (onFileIdGenerated) {
      onFileIdGenerated(fileId);
    }
    
    const statementFile: StatementFile = {
      id: fileId,
      filename: file.name,
      fileSize: file.size,
      uploadDate: new Date(),
      status: 'pending',
      fileType: this.getFileType(file.name),
      accountId, // Use the provided accountId
    };

    const progress: FileImportProgress = {
      fileId,
      status: 'pending',
      progress: 0,
      currentStep: 'Initializing...',
      processedRows: 0,
      totalRows: 0,
      errors: [],
    };

    // Store progress for tracking
    this.activeImports.set(fileId, progress);
    
    try {
      // Step 1: Initialize (5%)
      this.updateProgress(progress, 5, 'processing', 'Reading file content...', onProgress);
      
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      // Step 2: Read file content (10%)
      const fileContent = await this.readFileContent(file);
      this.updateProgress(progress, 10, 'processing', 'Analyzing file structure...', onProgress);
      
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      // Step 3: Get AI schema mapping (15%)
      this.updateProgress(progress, 15, 'processing', 'AI schema detection...', onProgress);
      const schemaMapping = await this.getAISchemaMapping(fileContent, statementFile.fileType);
      
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      // Step 4: Parse file data (20%)
      this.updateProgress(progress, 20, 'processing', 'Parsing file data...', onProgress);
      const rawData = await this.parseFileData(fileContent, statementFile.fileType, schemaMapping.mapping);
      progress.totalRows = rawData.length;
      
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      // Step 5: Process each row with AI categorization (20-85%)
      this.updateProgress(progress, 30, 'processing', 'Processing transactions with AI...', onProgress);
      const transactions = await this.processTransactions(
        fileId, // Pass fileId for cancellation checks
        rawData,
        schemaMapping.mapping,
        categories,
        subcategories,
        accountId,
        (processed: number) => {
          // Update progress during transaction processing (30-85%)
          const transactionProgress = 30 + Math.round((processed / rawData.length) * 55);
          this.updateProgress(progress, transactionProgress, 'processing', `Processing transaction ${processed}/${rawData.length}...`, onProgress);
          progress.processedRows = processed;
        }
      );
      
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      // Step 6: Check for duplicates (95%)
      this.updateProgress(progress, 95, 'processing', 'Checking for duplicate transactions...', onProgress);
      console.log(`🔍 Checking ${transactions.length} transactions for duplicates`);
      const duplicateDetection = await dataService.detectDuplicates(transactions);
      
      if (duplicateDetection.duplicates.length > 0) {
        console.log(`⚠️ Found ${duplicateDetection.duplicates.length} duplicate transactions`);
        // Don't save transactions yet - wait for user decision
        statementFile.status = 'awaiting-duplicate-resolution';
        statementFile.transactionCount = transactions.length;
        
        this.updateProgress(progress, 100, 'completed', `Found ${duplicateDetection.duplicates.length} duplicate transactions. Please review.`, onProgress);
        
        return { 
          statementFile, 
          fileId, 
          duplicateDetection,
          needsDuplicateResolution: true
        };
      } else {
        // No duplicates, save all transactions
        await dataService.addTransactions(transactions);
        
        // Step 7: Complete (100%)
        statementFile.status = 'completed';
        statementFile.transactionCount = transactions.length;
        
        this.updateProgress(progress, 100, 'completed', `Successfully imported ${transactions.length} transactions!`, onProgress);
        
        return { 
          statementFile, 
          fileId
        };
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`💥 Error in processFile for ${file.name}:`, error);
      
      statementFile.status = 'error';
      statementFile.errorMessage = errorMessage;
      progress.errors.push(errorMessage);
      this.updateProgress(progress, progress.progress, 'error', `Error: ${errorMessage}`, onProgress);
    } finally {
      this.cleanup(fileId);
    }

    return { 
      statementFile, 
      fileId 
    };
  }

  private updateProgress(
    progress: FileImportProgress,
    progressValue: number,
    status: 'pending' | 'processing' | 'completed' | 'error',
    step: string,
    onProgress?: (progress: FileImportProgress) => void
  ) {
    progress.progress = progressValue;
    progress.status = status;
    progress.currentStep = step;
    
    console.log(`📊 Progress: ${progressValue}% - ${step}`);
    
    if (onProgress) {
      onProgress({ ...progress });
    }
  }

  // Cancel import method
  cancelImport(fileId: string): void {
    console.log(`🚫 Cancelling import for file: ${fileId}`);
    this.cancellationTokens.set(fileId, true);
    
    // Also update the progress to reflect cancellation
    const progress = this.activeImports.get(fileId);
    if (progress) {
      progress.status = 'error';
      progress.currentStep = 'Import cancelled by user';
      progress.errors.push('Import cancelled by user');
      console.log(`📋 Updated progress for cancelled import: ${fileId}`);
    }
  }

  // Generate unique file ID
  private generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Method to cancel an active import
  private isCancelled(fileId: string): boolean {
    const cancelled = this.cancellationTokens.get(fileId) === true;
    if (cancelled) {
      console.log(`⏹️ Import cancellation detected for file: ${fileId}`);
    }
    return cancelled;
  }

  // Clean up after import completion or cancellation
  private cleanup(fileId: string): void {
    console.log(`🧹 Cleaning up resources for file: ${fileId}`);
    this.activeImports.delete(fileId);
    this.cancellationTokens.delete(fileId);
  }

  private async readFileContent(file: File): Promise<string> {
    console.log('📖 readFileContent START');
    console.log(`📄 File details:`, {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified).toISOString()
    });
    
    // Handle PDF files differently - read as base64
    if (file.type === 'application/pdf' || this.getFileType(file.name) === 'pdf') {
      console.log('📄 Reading PDF file as base64...');
      return await this.fileToBase64(file);
    }
    
    // For other files, read as ArrayBuffer and decode with best-fit encoding (UTF-8, Windows-1252, ISO-8859-1)
    // This preserves Scandinavian characters (æ, ø, å) commonly found in CSVs saved with legacy encodings.
    const readAsArrayBuffer = (): Promise<ArrayBuffer> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result;
          if (result instanceof ArrayBuffer) {
            console.log(`📦 File read as ArrayBuffer: ${result.byteLength} bytes`);
            resolve(result);
          }
          else if (typeof result === 'string') {
            console.log(`📦 File read as string: ${result.length} characters, converting to ArrayBuffer`);
            resolve(new TextEncoder().encode(result).buffer);
          }
          else {
            console.error('❌ Failed to read file content - unexpected result type');
            reject(new Error('Failed to read file content'));
          }
        };
        reader.onerror = () => {
          console.error('❌ FileReader error occurred');
          reject(new Error('Failed to read file'));
        };
        reader.readAsArrayBuffer(file);
      });

    const stripBOM = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
    const countReplacement = (s: string) => (s.match(/\uFFFD/g) || []).length;
    // Count Unicode C1 control characters U+0080–U+009F which often appear when cp1252 bytes
    // are decoded as ISO-8859-1. We want to penalize decodings that produce these.
    const countC1Controls = (s: string) => {
      let count = 0;
      for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        if (code >= 0x80 && code <= 0x9f) count++;
      }
      return count;
    };
    const tryDecode = (buf: ArrayBuffer, enc: string) => {
      try {
        const dec = new TextDecoder(enc as any, { fatal: false });
        return stripBOM(dec.decode(new DataView(buf)));
      } catch {
        return '';
      }
    };

    const buffer = await readAsArrayBuffer();

    // Quick BOM-based detection for Unicode encodings
    const view = new Uint8Array(buffer);
    const hasUTF8BOM = view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf;
    const hasUTF16LE = view.length >= 2 && view[0] === 0xff && view[1] === 0xfe;
    const hasUTF16BE = view.length >= 2 && view[0] === 0xfe && view[1] === 0xff;

    console.log('🔍 Encoding detection:', {
      bufferSize: buffer.byteLength,
      hasUTF8BOM,
      hasUTF16LE,
      hasUTF16BE,
      firstBytes: Array.from(view.slice(0, 10)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ')
    });

    if (hasUTF16LE) {
      const dec = new TextDecoder('utf-16le');
      const result = stripBOM(dec.decode(new DataView(buffer)));
      console.log(`✅ Decoded as UTF-16LE: ${result.length} characters`);
      console.log(`📝 Content preview: ${result.substring(0, 200)}`);
      return result;
    }
    if (hasUTF16BE) {
      const dec = new TextDecoder('utf-16be' as any);
      const result = stripBOM(dec.decode(new DataView(buffer)));
      console.log(`✅ Decoded as UTF-16BE: ${result.length} characters`);
      console.log(`📝 Content preview: ${result.substring(0, 200)}`);
      return result;
    }

    // Prefer UTF-8; if we see replacement characters, try common Western encodings.
  const utf8 = tryDecode(buffer, 'utf-8');
    const utf8Repl = countReplacement(utf8);
    
    console.log(`🔍 UTF-8 decode attempt: ${utf8.length} chars, ${utf8Repl} replacement chars`);

  if (utf8Repl === 0 || hasUTF8BOM) {
    console.log('✅ Using UTF-8 encoding (clean or has BOM)');
    console.log(`📝 Content preview: ${utf8.substring(0, 200)}`);
    return utf8;
  }

    // Some CSV exports use Windows-1252 or ISO-8859-1
    console.log('🔍 Trying alternate encodings due to UTF-8 replacement characters...');
    
    const cp1252 = tryDecode(buffer, 'windows-1252');
    const cp1252Repl = countReplacement(cp1252);
    const cp1252C1 = countC1Controls(cp1252);

  const iso88591 = tryDecode(buffer, 'iso-8859-1');
  const isoRepl = countReplacement(iso88591);
  const isoC1 = countC1Controls(iso88591);

  const iso885915 = tryDecode(buffer, 'iso-8859-15');
  const iso15Repl = countReplacement(iso885915);
  const iso15C1 = countC1Controls(iso885915);

    console.log('🔍 Encoding candidates:', {
      utf8: { chars: utf8.length, repl: utf8Repl, c1: countC1Controls(utf8) },
      cp1252: { chars: cp1252.length, repl: cp1252Repl, c1: cp1252C1 },
      iso88591: { chars: iso88591.length, repl: isoRepl, c1: isoC1 },
      iso885915: { chars: iso885915.length, repl: iso15Repl, c1: iso15C1 }
    });

    // Score decodings: lower replacement chars first, then fewer C1 controls.
    // Prefer cp1252 over iso-8859-1 when ties (common for Western European CSVs).
    type Candidate = { text: string; repl: number; c1: number; label: 'utf8' | 'cp1252' | 'iso' | 'iso15' };
    const candidates: Candidate[] = [
      { text: utf8, repl: utf8Repl, c1: countC1Controls(utf8), label: 'utf8' },
      { text: cp1252, repl: cp1252Repl, c1: cp1252C1, label: 'cp1252' },
      { text: iso88591, repl: isoRepl, c1: isoC1, label: 'iso' },
      { text: iso885915, repl: iso15Repl, c1: iso15C1, label: 'iso15' }
    ];

    const best = candidates.reduce((best, cur) => {
      if (cur.repl !== best.repl) return cur.repl < best.repl ? cur : best;
      if (cur.c1 !== best.c1) return cur.c1 < best.c1 ? cur : best;
      // Tie-breaker: prefer cp1252 over iso when both are equal
  const prefOrder: Record<Candidate['label'], number> = { utf8: 0, cp1252: 1, iso: 2, iso15: 3 };
      return prefOrder[cur.label] < prefOrder[best.label] ? cur : best;
    });

    console.log(`✅ Selected encoding: ${best.label} (${best.repl} repl, ${best.c1} c1)`);
    console.log(`📝 Final content: ${best.text.length} characters`);
    console.log(`📝 Content preview: ${best.text.substring(0, 200)}`);

    return best.text || utf8; // fallback to utf8 if all failed
  }

  private async getAISchemaMapping(fileContent: string, fileType: StatementFile['fileType']): Promise<AISchemaMappingResponse> {
    try {
      // Bypass AI for PDF schema mapping – we know the extracted structure (date, description, amount)
      if (fileType === 'pdf' || process.env.REACT_APP_DISABLE_AI === 'true') {
        console.log('🛑 Skipping AI schema mapping (PDF or AI disabled) – using built-in PDF mapping');
        return this.getDefaultSchemaMapping(fileType);
      }
      // Get a sample of the file content for AI analysis
      const sampleContent = this.getSampleContent(fileContent, fileType);
      
      // Sanitize file content to remove PII before sending to AI
      const sanitizedContent = sanitizeFileContent(sampleContent);
      
      const request: AISchemaMappingRequest = {
        fileContent: sanitizedContent,
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
    let mapping: FileSchemaMapping;
    let confidence = 0.5;
    let reasoning = 'Using default mapping due to AI analysis failure';

    switch (fileType) {
      case 'pdf':
        mapping = {
          hasHeaders: true,
          skipRows: 0,
          dateFormat: 'YYYY-MM-DD',
            amountFormat: 'negative for debits',
          dateColumn: 'date',
          descriptionColumn: 'description',
          amountColumn: 'amount'
        };
        confidence = 0.9;
        reasoning = 'PDF extraction produces normalized objects with date/description/amount keys';
        break;
      case 'ofx':
        mapping = {
          hasHeaders: false,
          skipRows: 0,
          dateFormat: 'YYYYMMDD',
          amountFormat: 'negative for debits',
          dateColumn: 'date',
          descriptionColumn: 'description',
          amountColumn: 'amount'
        };
        confidence = 0.9;
        reasoning = 'OFX structure mapping based on standard format';
        break;
      
      default:
        mapping = {
          hasHeaders: true,
          skipRows: 0,
          dateFormat: 'MM/DD/YYYY',
          amountFormat: 'negative for debits',
          dateColumn: '0',
          descriptionColumn: '1',
          amountColumn: '2'
        };
        break;
    }

    return {
      mapping,
      confidence,
      reasoning,
      suggestions: ['Please verify the column mappings are correct'],
    };
  }

  // OFX parsing methods for testing
  private async parseOFX(content: string, mapping: FileSchemaMapping): Promise<any[]> {
    console.log('🔧 OFX PARSING START');
    console.log(`📄 OFX content length: ${content.length} characters`);
    console.log(`📋 OFX mapping:`, mapping);
    
    try {
      const transactions = [];
      
      // Log the first 500 characters to see the OFX structure
      console.log('📝 OFX content preview (first 500 chars):');
      console.log(content.substring(0, 500));
      
      const transactionBlocks = content.split('<STMTTRN>').slice(1);
      console.log(`🧱 Found ${transactionBlocks.length} transaction blocks after splitting on <STMTTRN>`);

      for (let i = 0; i < transactionBlocks.length; i++) {
        const block = transactionBlocks[i];
        console.log(`\n🔍 Processing transaction block ${i + 1}/${transactionBlocks.length}:`);
        console.log(`📦 Block content preview: ${block.substring(0, 200).replace(/\n/g, ' ')}...`);
        
        // Extract raw amount string first, then convert to number to avoid TS type reassignment issues
        const rawAmount = this.extractOFXValue(block, 'TRNAMT');
        const numericAmount = rawAmount != null ? parseFloat(rawAmount) : null;
        
        console.log(`💰 Raw amount: "${rawAmount}" -> Numeric: ${numericAmount}`);

        const fitid = this.extractOFXValue(block, 'FITID');
        const trntype = this.extractOFXValue(block, 'TRNTYPE');
        const dtposted = this.extractOFXValue(block, 'DTPOSTED');
        const name = this.extractOFXValue(block, 'NAME');
        const memo = this.extractOFXValue(block, 'MEMO');
        
        console.log(`🆔 FITID: "${fitid}"`);
        console.log(`📊 TRNTYPE: "${trntype}"`);
        console.log(`📅 DTPOSTED: "${dtposted}"`);
        console.log(`🏷️ NAME: "${name}"`);
        console.log(`📝 MEMO: "${memo}"`);

        const transaction = {
          transactionId: fitid || `tx_${Date.now()}_${Math.random()}`,
          type: trntype,
          date: dtposted,
          amount: numericAmount,
          description: name || memo,
          notes: memo,
          account: 'Unknown'
        };

        console.log(`✅ Created transaction:`, transaction);
        transactions.push(transaction);
      }

      console.log(`🎉 OFX parsing completed successfully: ${transactions.length} transactions extracted`);
      console.log('📊 Sample transactions (first 2):');
      transactions.slice(0, 2).forEach((tx, idx) => {
        console.log(`  Transaction ${idx + 1}:`, tx);
      });
      
      return transactions;
    } catch (error) {
      console.error('💥 OFX parsing failed with error:', error);
      console.error('📊 Error details:', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        contentLength: content.length,
        contentPreview: content.substring(0, 200)
      });
      return [];
    }
  }

  private extractOFXValue(block: string, tagName: string): string | null {
    const regex = new RegExp(`<${tagName}>([^<]+)`, 'i');
    const match = block.match(regex);
    const result = match ? match[1].trim() : null;
    console.log(`🔍 extractOFXValue(${tagName}): "${result}"`);
    return result;
  }

  private async parseFileData(content: string, fileType: StatementFile['fileType'], mapping: FileSchemaMapping): Promise<any[]> {
    console.log(`🔧 parseFileData START - FileType: ${fileType}`);
    console.log(`📄 Content length: ${content.length} characters`);
    console.log(`📋 Schema mapping:`, mapping);
    
    let result: any[] = [];
    
    switch (fileType) {
      case 'csv':
        console.log('📈 Parsing as CSV...');
        result = await this.parseCSV(content, mapping);
        break;
      case 'excel':
        console.log('📊 Parsing as Excel...');
        result = await this.parseExcel(content, mapping);
        break;
      case 'ofx':
        console.log('🏦 Parsing as OFX...');
        result = await this.parseOFX(content, mapping);
        break;
      case 'pdf':
        console.log('📄 Parsing as PDF...');
        result = await this.parsePDF(content, mapping);
        break;
      default:
        console.error(`❌ Unsupported file type: ${fileType}`);
        throw new Error(`Unsupported file type: ${fileType}`);
    }
    
    console.log(`✅ parseFileData COMPLETE - Extracted ${result.length} raw data rows`);
    if (result.length > 0) {
      console.log('📊 Sample raw data (first 2 rows):');
      result.slice(0, 2).forEach((row, idx) => {
        console.log(`  Row ${idx + 1}:`, row);
      });
    } else {
      console.warn('⚠️ No data rows extracted from file!');
    }
    
    return result;
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

  private async parsePDF(content: string, mapping: FileSchemaMapping): Promise<any[]> {
    console.log('🔧 PDF PARSING START');
    console.log(`📄 PDF content length: ${content.length} characters`);
    console.log(`📋 PDF mapping:`, mapping);

    try {
      // First, extract text from PDF
      const pdfText = await this.extractTextFromPDF(content);
      console.log(`📝 Extracted PDF text (${pdfText.length} chars): ${pdfText.substring(0, 500)}...`);

      // Use AI to extract structured transaction data from PDF text
  const transactions = await this.extractTransactionsFromPDFWithAI(pdfText);
  const normalized = this.convertPDFRowsToTransactions(transactions);
  console.log(`✅ PDF parsing complete - extracted ${transactions.length} transactions (normalized: ${normalized.length})`);
  return normalized;

    } catch (error) {
      console.error('❌ PDF parsing failed:', error);
      throw new Error(`Failed to parse PDF file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from PDF content using pdfjs-dist
   * This adapts the logic from receiptProcessingService but works with file content instead of base64
   */
  private async extractTextFromPDF(content: string): Promise<string> {
    try {
      // Use pdfjs-dist library that's already available and browser-compatible
      const pdfjsLib = require('pdfjs-dist');
      
      // Set worker source
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
      
      // Convert content (which should be base64) to Uint8Array
      let bytes: Uint8Array;
      
      // Check if content is base64 encoded or raw
      if (content.includes('data:application/pdf;base64,')) {
        // Remove data URL prefix
        const base64Content = content.split(',')[1];
        const binaryString = atob(base64Content);
        bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
      } else {
        // Assume content is already base64 without prefix
        try {
          const binaryString = atob(content);
          bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
        } catch {
          // If not base64, treat as raw content
          bytes = new TextEncoder().encode(content);
        }
      }
      
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      
      let fullText = '';
      
      // Extract text from each page
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }
      
      return fullText.trim();
    } catch (error) {
      console.warn('PDF text extraction failed:', error);
      throw new Error(`PDF text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Use AI to extract structured transaction data from PDF text with comprehensive schema mapping
   */
  private async extractTransactionsFromPDFWithAI(pdfText: string): Promise<any[]> {
    console.log('🤖 Using AI to extract transactions from PDF text with schema mapping...');
    const PER_MESSAGE_LIMIT = 4000; // enforced by proxy per message
    const USER_SEGMENT_LIMIT = 3800; // safety margin for markers
    const OVERLAP = 250;
    const USER_CONFIG_CHUNK = parseInt(String(process.env.REACT_APP_PDF_AI_CHUNK_SIZE || ''), 10);
    let logicalChunkTarget = USER_CONFIG_CHUNK && USER_CONFIG_CHUNK > 0 ? USER_CONFIG_CHUNK : 9000; // large logical target
    logicalChunkTarget = Math.min(Math.max(logicalChunkTarget, 1200), 12000);

    const condensedAll = this.condensePdfTextForAI(pdfText, pdfText.length);
    const chunks: string[] = [];
    if (condensedAll.length <= logicalChunkTarget) {
      chunks.push(condensedAll);
    } else {
      let start = 0;
      while (start < condensedAll.length) {
        const end = Math.min(start + logicalChunkTarget, condensedAll.length);
        let slice = condensedAll.slice(start, end);
        if (end < condensedAll.length) {
          const nextBreak = condensedAll.indexOf('\n', end);
          if (nextBreak !== -1 && nextBreak - end < 300) {
            slice = condensedAll.slice(start, nextBreak);
            start = nextBreak + 1 - Math.min(OVERLAP, nextBreak + 1);
          } else {
            start = end - Math.min(OVERLAP, end - start);
          }
        } else {
          start = end;
        }
        chunks.push(slice.trim());
      }
    }

    const schemaPrompt = this.buildTransactionSchemaPrompt();
    const allExtracted: any[] = [];
    const skipAI = process.env.REACT_APP_DISABLE_AI === 'true';

    try {
      if (skipAI) throw new Error('AI disabled by REACT_APP_DISABLE_AI');
      const singleChunk = chunks.length === 1;
      let consecutiveSizeErrors = 0;
      const baseDelayMs = 250;

      for (let i = 0; i < chunks.length; i++) {
        const rawChunk = chunks[i];
        const userInstruction = `BANK STATEMENT DATA CHUNK ${i + 1}/${chunks.length}:\n${rawChunk}\n\nReturn ONLY JSON array (may be partial for this chunk).`;

        // Build user messages ensuring each segment < PER_MESSAGE_LIMIT
        const userMessages: { role: 'user'; content: string }[] = [];
        if (userInstruction.length <= PER_MESSAGE_LIMIT) {
          userMessages.push({ role: 'user', content: userInstruction });
        } else {
          let cursor = 0; let part = 0; const marker = `CHUNKSEG ${i + 1}`;
          while (cursor < userInstruction.length) {
            const seg = userInstruction.slice(cursor, cursor + USER_SEGMENT_LIMIT);
            userMessages.push({ role: 'user', content: `${marker} PART ${++part}:\n${seg}` });
            cursor += USER_SEGMENT_LIMIT;
          }
        }

        let responseContent: string | null = null;
        try {
          if (singleChunk && userMessages.length === 1) {
            // Legacy path for tests
            const legacyPrompt = `${schemaPrompt}\n\n${userInstruction}`;
            responseContent = await azureOpenAIService.makeRequest(legacyPrompt, 3000);
          } else {
            const multiMessages = [ { role: 'system' as const, content: schemaPrompt }, ...userMessages ];
            const maxTokens = singleChunk ? 3000 : 2000;
            responseContent = await azureOpenAIService.makeChatRequest(multiMessages, maxTokens, { attempts: 4, baseBackoffMs: 500 });
          }
          consecutiveSizeErrors = 0;
        } catch (err: any) {
          const msg = String(err?.message || '').toLowerCase();
          if (msg.includes('content too long')) {
            consecutiveSizeErrors++;
            if (consecutiveSizeErrors >= 2 && logicalChunkTarget > 1600) {
              logicalChunkTarget = Math.max(1600, Math.floor(logicalChunkTarget * 0.7));
              console.warn(`⚙️ Adjusted logical chunk target to ${logicalChunkTarget} after repeated size errors.`);
            }
            if (rawChunk.length > 1200) {
              const mid = Math.floor(rawChunk.length / 2);
              const subChunks = [rawChunk.slice(0, mid), rawChunk.slice(mid - OVERLAP)];
              console.warn(`⚠️ Chunk ${i + 1}/${chunks.length} too large; splitting into ${subChunks.length} sub-chunks.`);
              for (let s = 0; s < subChunks.length; s++) {
                const subInstr = `BANK STATEMENT DATA CHUNK ${i + 1}a${s + 1}/${chunks.length}:\n${subChunks[s]}\n\nReturn ONLY JSON array (partial ok).`;
                const subPrompt = `${schemaPrompt}\n\n${subInstr}`;
                try {
                  const subResp = await azureOpenAIService.makeRequest(subPrompt, 1500);
                  if (subResp) {
                    const parsed = this.parseAndValidateAIResponse(subResp);
                    allExtracted.push(...parsed);
                  }
                } catch (inner) {
                  console.warn('Sub-chunk extraction failed:', inner);
                }
              }
              continue;
            } else {
              console.warn(`Chunk ${i + 1}/${chunks.length} size error on minimal chunk; skipping.`);
              continue;
            }
          } else if (msg.includes('too many requests') || msg.includes('rate limit')) {
            const backoff = 600 + Math.floor(Math.random() * 400);
            console.warn(`⏳ Rate limited on chunk ${i + 1}. Waiting ${backoff}ms then retry.`);
            await new Promise(r => setTimeout(r, backoff));
            try {
              const multiMessages = [ { role: 'system' as const, content: schemaPrompt }, ...userMessages ];
              responseContent = await azureOpenAIService.makeChatRequest(multiMessages, 1800, { attempts: 3, baseBackoffMs: 600 });
            } catch (retryErr) {
              console.warn('Retry after rate limit failed:', retryErr);
              continue;
            }
          } else {
            console.warn(`Chunk ${i + 1}/${chunks.length} extraction failed:`, err);
            continue;
          }
        }

        if (responseContent) {
          const parsed = this.parseAndValidateAIResponse(responseContent);
          if (parsed.length) allExtracted.push(...parsed);
        }

        if (i + 1 < chunks.length) {
          const jitter = Math.floor(Math.random() * 200);
          await new Promise(r => setTimeout(r, baseDelayMs + jitter));
        }
      }

      // Deduplicate
      const seen = new Set<string>();
      const deduped: any[] = [];
      for (const t of allExtracted) {
        const key = `${t.date}|${t.amount}|${(t.description || '').substring(0,24).toLowerCase()}`;
        if (!seen.has(key)) { seen.add(key); deduped.push(t); }
      }
      if (deduped.length) {
        console.log(`🤖 AI extracted ${deduped.length} combined transactions from ${chunks.length} chunk(s)`);
        return deduped;
      }
      throw new Error('No valid transactions after chunked extraction');
    } catch (error) {
      console.warn('❌ AI transaction extraction failed or skipped – attempting heuristic fallback:', (error as Error).message);
      const heuristic = this.basicHeuristicPDFExtraction(pdfText);
      if (heuristic.length > 0) {
        console.log(`🛟 Heuristic PDF parser extracted ${heuristic.length} transactions`);
        return heuristic;
      }
      console.warn('🔄 Fallback produced no transactions');
      return [];
    }
  }

  /**
   * Build comprehensive Transaction schema prompt for AI
   */
  private buildTransactionSchemaPrompt(): string {
    return `TRANSACTION EXTRACTION SCHEMA:
Extract bank statement transactions as a JSON array. Each transaction object must follow this exact structure:

REQUIRED FIELDS:
- "date": string in YYYY-MM-DD format (convert from any date format found)
- "description": string (merchant/payee name, cleaned and trimmed)
- "amount": number (positive for credits/deposits, negative for debits/expenses)
- "category": string (categorize as: "Food & Dining", "Gas & Fuel", "Groceries", "Shopping", "Travel", "Healthcare", "Entertainment", "Bills & Utilities", "Transfer", "Income", "Uncategorized")
- "type": string ("income" for positive amounts, "expense" for negative amounts, "transfer" for account transfers)

OPTIONAL FIELDS (include if determinable):
- "vendor": string (clean merchant name if different from description)
- "subcategory": string (if applicable, e.g., "Coffee" for Food & Dining)
- "confidence": number 0-1 (confidence in categorization, default 0.8)
- "reasoning": string (brief explanation of categorization choice)
- "isVerified": false (always false for new imports)

RULES:
- Skip headers, page numbers, balances, fees descriptions
- Convert all dates to YYYY-MM-DD format
- Use negative amounts for debits/expenses, positive for credits/income
- Categorize based on merchant/description keywords
- If unsure about category, use "Uncategorized"
- Clean up descriptions (remove extra spaces, bank codes)
- Include ALL transaction rows found

EXAMPLE OUTPUT FORMAT:
[
  {
    "date": "2024-01-15",
    "description": "STARBUCKS COFFEE #1234",
    "amount": -5.47,
    "category": "Food & Dining",
    "subcategory": "Coffee",
    "type": "expense",
    "vendor": "Starbucks",
    "confidence": 0.95,
    "reasoning": "Coffee shop expense",
    "isVerified": false
  }
]`;
  }

  /**
   * Parse and validate AI response for transaction data
   */
  private parseAndValidateAIResponse(responseContent: string): any[] {
    try {
      // Clean up common formatting issues in AI responses
      let cleanedResponse = responseContent.trim();
      
      // Remove markdown code blocks if present
      if (cleanedResponse.includes('```json')) {
        const parts = cleanedResponse.split('```json');
        if (parts.length > 1) {
          cleanedResponse = parts[1];
        }
      }
      if (cleanedResponse.includes('```')) {
        cleanedResponse = cleanedResponse.split('```')[0];
      }
      
      // Remove any explanatory text before the JSON
      const jsonMatch = cleanedResponse.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0];
      }
      
      cleanedResponse = cleanedResponse.trim();
      
      const transactions = JSON.parse(cleanedResponse);
      
      if (!Array.isArray(transactions)) {
        throw new Error('Response is not an array');
      }
      
      // Validate and normalize each transaction
      const validatedTransactions = transactions
        .filter(tx => this.isValidTransactionStructure(tx))
        .map(tx => this.normalizeTransactionFields(tx));
      
      return validatedTransactions;
    } catch (error) {
      console.warn('Failed to parse AI response:', error);
      console.warn('Raw response:', responseContent?.substring(0, 500));
      return [];
    }
  }

  /**
   * Validate transaction structure has required fields
   */
  private isValidTransactionStructure(tx: any): boolean {
    return (
      tx &&
      typeof tx === 'object' &&
      typeof tx.date === 'string' &&
      typeof tx.description === 'string' &&
      typeof tx.amount === 'number' &&
      tx.date.length > 0 &&
      tx.description.trim().length > 0
    );
  }

  /**
   * Normalize and add defaults for transaction fields
   */
  private normalizeTransactionFields(tx: any): any {
    const normalized = {
      ...tx,
      // Ensure required fields have proper defaults
      category: tx.category || 'Uncategorized',
      confidence: typeof tx.confidence === 'number' ? tx.confidence : 0.7,
      isVerified: false,
      // Clean up text fields
      description: tx.description.trim(),
      vendor: tx.vendor?.trim() || undefined,
      subcategory: tx.subcategory?.trim() || undefined,
      reasoning: tx.reasoning?.trim() || undefined
    };
    
    // Validate and normalize date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.date)) {
      // Try to parse and convert common date formats
      const parsedDate = this.parseAndNormalizeDate(normalized.date);
      if (parsedDate) {
        normalized.date = parsedDate;
      } else {
        console.warn(`Invalid date format: ${normalized.date}`);
        return null; // Invalid transaction
      }
    }
    
    return normalized;
  }

  /**
   * Parse various date formats and normalize to YYYY-MM-DD
   */
  private parseAndNormalizeDate(dateStr: string): string | null {
    try {
      // Try common formats
      const formats = [
        /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/,  // MM/DD/YYYY
        /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/,  // YYYY/MM/DD
        /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/   // MM/DD/YY
      ];
      
      for (const format of formats) {
        const match = dateStr.match(format);
        if (match) {
          let year = parseInt(match[3]);
          let month = parseInt(format === formats[1] ? match[2] : match[1]);
          let day = parseInt(format === formats[1] ? match[3] : match[2]);
          
          // Handle 2-digit years
          if (year < 100) {
            year += year > 50 ? 1900 : 2000;
          }
          
          // Swap month/day for YYYY/MM/DD format
          if (format === formats[1]) {
            [month, day] = [day, month];
          }
          
          // Validate ranges
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          }
        }
      }
      
      // Try built-in Date parsing as last resort
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Convert already-extracted PDF rows into Transaction-like raw rows for further processing
   * Now handles comprehensive transaction structure with AI-generated fields
   */
  private convertPDFRowsToTransactions(rawRows: any[]): any[] {
    if (!Array.isArray(rawRows)) return [];
    
    return rawRows
      .filter(r => r && r.date && r.description && typeof r.amount !== 'undefined')
      .map(r => ({
        // Core transaction fields (required)
        date: r.date,
        description: String(r.description).trim(),
        amount: r.amount,
        
        // AI-enhanced fields (optional but valuable)
        category: r.category || 'Uncategorized',
        subcategory: r.subcategory || undefined,
        vendor: r.vendor || undefined,
        
        // AI metadata fields
        confidence: r.confidence || undefined,
        reasoning: r.reasoning || undefined,
        isVerified: false, // Always false for new imports
        
        // Preserve any other fields from AI response
        notes: r.notes || '',
        originalText: `${r.description} ${r.amount}`, // For reference
        
        // Fields that will be set later in processing pipeline
        // account, id, addedDate, lastModifiedDate will be set by upstream processing
      }));
  }

  // Reduce large PDF text to lines likely containing transactions (dates + amounts) for AI prompt
  private condensePdfTextForAI(full: string, maxChars: number): string {
    if (full.length <= maxChars) return full;
    const lines = full.split(/\n|\r|\r\n/).map(l => l.trim()).filter(l => l.length > 0);
    const dateLike = /(\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b)|(\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{2,4})/i;
    const amountLike = /[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?/;
    const candidateLines: string[] = [];
    for (const l of lines) {
      if (dateLike.test(l) && amountLike.test(l)) candidateLines.push(l);
      if (candidateLines.length > 400) break; // Hard cap
    }
    const condensed = candidateLines.join('\n');
    if (condensed.length <= maxChars) return condensed;
    return condensed.substring(0, maxChars);
  }

  // Heuristic extraction when AI unavailable: parse lines containing date + amount
  private basicHeuristicPDFExtraction(pdfText: string): any[] {
    const lines = pdfText.split(/\n|\r|\r\n/).map(l => l.trim()).filter(l => l.length > 0);
    const dateRegexes = [
      /\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/, // dd.mm.yyyy or dd-mm-yyyy
      /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{2,4})\b/i
    ];
    const amountRegex = /([-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|[-+]?\d+(?:[.,]\d{2}))/; // capture first plausible amount
    const monthMap: Record<string,string> = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',sept:'09',oct:'10',nov:'11',dec:'12'};

    const results: any[] = [];
    for (const rawLine of lines) {
      let dateISO: string | null = null;
      let line = rawLine;
      for (const dr of dateRegexes) {
        const m = dr.exec(line);
        if (m) {
          if (dr === dateRegexes[0]) {
            let [dd, mm, yyyy] = [m[1], m[2], m[3]];
            if (yyyy.length === 2) yyyy = (parseInt(yyyy,10) > 50 ? '19' : '20') + yyyy; // crude pivot
            if (dd.length === 1) dd = '0'+dd;
            if (mm.length === 1) mm = '0'+mm;
            dateISO = `${yyyy}-${mm}-${dd}`;
          } else {
            // Month name form
            let dd = m[1]; const monRaw = m[2].toLowerCase(); let yyyy = m[3];
            if (yyyy.length === 2) yyyy = '20'+yyyy;
            if (dd.length === 1) dd = '0'+dd;
            const mm = monthMap[monRaw] || '01';
            dateISO = `${yyyy}-${mm}-${dd}`;
          }
          line = line.replace(m[0], '').trim();
          break;
        }
      }
      if (!dateISO) continue;
      const amountMatch = amountRegex.exec(line);
      if (!amountMatch) continue;
      const amountStr = amountMatch[1];
      // Remove thousand separators and normalize decimal
      let normalized = amountStr.replace(/\s/g,'');
      // If both . and , appear, assume . thousands and , decimal
      if (/[.,]/.test(normalized)) {
        const lastComma = normalized.lastIndexOf(',');
        const lastDot = normalized.lastIndexOf('.');
        if (lastComma > lastDot) { // comma likely decimal
          normalized = normalized.replace(/\./g,'').replace(',','.');
        } else if (lastDot > lastComma) { // dot decimal
          normalized = normalized.replace(/,/g,'');
        }
      }
      const amount = parseFloat(normalized);
      if (isNaN(amount)) continue;
      // Heuristic: expenses often shown without sign but context may not be available; leave as parsed
      const description = line.replace(amountMatch[0], '').trim().replace(/\s{2,}/g,' ');
      results.push({ date: dateISO, description, amount });
      if (results.length >= 500) break; // safety limit
    }
    return results;
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
    console.log(`🔧 processTransactions START`);
    console.log(`📊 Input: ${rawData.length} raw data rows`);
    console.log(`📋 Schema mapping:`, mapping);
    console.log(`🏦 Account ID: ${accountId}`);

    if (rawData.length > 0) {
      console.log('📋 Sample raw data (first 3 rows):');
      rawData.slice(0, 3).forEach((row, idx) => {
        console.log(`  Raw row ${idx + 1}:`, row);
      });
    }

    // Prepare rows -> basic extracted data first
    console.log('⚙️ Step 1: Extracting basic data from raw rows...');
    const prepared: Array<{
      idx: number;
      date: Date | null;
      description: string;
      amount: number | null;
      notes: string;
    }> = rawData.map((row, idx) => {
      const extracted = {
        idx,
        date: this.extractDate(row, mapping.dateColumn, mapping.dateFormat),
        description: this.extractString(row, mapping.descriptionColumn),
        amount: this.extractAmount(row, mapping.amountColumn),
        notes: this.extractString(row, mapping.notesColumn)
      };
      
      if (idx < 3) {
        console.log(`  Extracted ${idx + 1}:`, extracted);
      }
      
      return extracted;
    });

    console.log(`✅ Prepared ${prepared.length} rows from raw data`);

    const validIndices = prepared
      .filter(p => p.date && p.description && p.amount !== null)
      .map(p => p.idx);

    console.log(`📊 Found ${validIndices.length} valid rows out of ${prepared.length} prepared rows`);

    if (validIndices.length === 0) {
      console.warn('⚠️ No valid transactions found after extraction - returning empty array');
      return [];
    }

    // Step 0: Detect if amounts need to be reversed (expenses positive, income negative)
    const validPrepared = validIndices.map(i => prepared[i]).filter(p => p.date && p.description && p.amount !== null);
    const shouldReverseAmounts = await this.detectAmountReversal(validPrepared, accountId);
    
    if (shouldReverseAmounts) {
      console.log('🔄 Detected reversed amount convention - flipping all amounts');
      validPrepared.forEach(p => {
        if (p.amount !== null) {
          p.amount = -p.amount;
        }
      });
      // Update the prepared array with reversed amounts
      validPrepared.forEach(p => {
        prepared[p.idx] = p;
      });
    }

    // Step 0.1: Initialize transfer detection rules if needed (skip in test environment)
    if (process.env.NODE_ENV !== 'test') {
      console.log('🔄 Initializing transfer detection rules...');
      await transferDetectionService.initializeTransferRules();
    }

    // Step 1: Apply category rules first (now includes transfer detection)
    console.log(`📋 Step 2: Applying category rules to ${validIndices.length} valid transactions`);
    const validTransactions = validIndices.map(i => prepared[i]).filter(p => p.date && p.description && p.amount !== null);
    
    console.log('📋 Sample valid transactions for rules (first 2):');
    validTransactions.slice(0, 2).forEach((tx, idx) => {
      console.log(`  Valid tx ${idx + 1}: ${tx.date?.toISOString()} | ${tx.amount} | "${tx.description}"`);
    });
    
    const ruleResults = await rulesService.applyRulesToBatch(validTransactions.map(p => ({
      date: p.date!,
      description: p.description,
      amount: p.amount!,
      notes: p.notes,
      category: 'Uncategorized', // Will be overridden by rules or AI
      account: accountManagementService.getAccount(accountId)?.name || 'Unknown Account',
      type: (p.amount! >= 0) ? 'income' : 'expense' as const,
      isVerified: false,
      originalText: p.description
    })));

    console.log(`📋 Rules applied: ${ruleResults.matchedTransactions.length} matched, ${ruleResults.unmatchedTransactions.length} need AI`);

    if (ruleResults.matchedTransactions.length > 0) {
      console.log('📋 Sample rule-matched transactions (first 2):');
      ruleResults.matchedTransactions.slice(0, 2).forEach((item, idx) => {
        const tx = item.transaction;
        console.log(`  Rule-matched ${idx + 1}: ${tx.date.toISOString()} | ${tx.amount} | "${tx.description}" -> ${tx.category}`);
      });
    }

    // Step 2: Build batch requests for AI (only for unmatched transactions)
    const batchRequests: AIClassificationRequest[] = ruleResults.unmatchedTransactions.map(transaction => ({
      transactionText: transaction.description,
      amount: transaction.amount,
      date: transaction.date.toISOString(),
      availableCategories: categories
    }));

    console.log(`🤖 Step 3: Created ${batchRequests.length} batch requests for AI (reduced from ${validIndices.length} total)`);

    // Step 3: Call AI in batch chunks only for unmatched transactions
    const batchResults: (AIClassificationResponse & { correlationKey?: string })[] = [];
  let remainingUnmatchedTransactions = [...ruleResults.unmatchedTransactions];
  let allMatchedTransactions = [...ruleResults.matchedTransactions];
    
  if (remainingUnmatchedTransactions.length > 0) {
      const CHUNK = 20; // increased batch size to 20 to speed up processing
      let batchNumber = 0;
      
      while (remainingUnmatchedTransactions.length > 0) {
        batchNumber++;
        
        if (this.isCancelled(fileId)) {
          console.log('🛑 Transaction processing cancelled during batch classification');
          throw new Error('Import cancelled by user');
        }
        
        // Before processing each batch (after the first), check for new rules that might have been created
        if (batchNumber > 1) {
          console.log(`🔄 Checking for new rules before batch ${batchNumber}...`);
          const currentRules = await rulesService.getAllRules();
          const activeRulesCount = currentRules.filter(r => r.isActive).length;
          console.log(`📋 Current active rules: ${activeRulesCount}`);
          
          // Re-apply rules to remaining unmatched transactions to catch any new matches
          const newRuleResults = await rulesService.applyRulesToBatch(remainingUnmatchedTransactions);
          console.log(`📋 Rules re-applied: ${newRuleResults.matchedTransactions.length} newly matched, ${newRuleResults.unmatchedTransactions.length} still unmatched`);
          
          if (newRuleResults.matchedTransactions.length > 0) {
            // Update our tracking variables
            allMatchedTransactions.push(...newRuleResults.matchedTransactions);
            remainingUnmatchedTransactions = newRuleResults.unmatchedTransactions;
            console.log(`📊 After rule re-application: ${allMatchedTransactions.length} total rule-matched, ${remainingUnmatchedTransactions.length} still need AI`);
          }
        } else {
          // First batch - just log initial rule count
          const currentRules = await rulesService.getAllRules();
          const activeRulesCount = currentRules.filter(r => r.isActive).length;
          console.log(`📋 Starting batch processing with ${activeRulesCount} active rules`);
        }
        
        // If all transactions are now rule-matched, break out
        if (remainingUnmatchedTransactions.length === 0) {
          console.log(`📊 All remaining transactions matched by rules - no more AI processing needed`);
          break;
        }
        
        // Process the current chunk of unmatched transactions
        const currentChunk = remainingUnmatchedTransactions.slice(0, CHUNK);
        console.log(`📊 Processing batch ${batchNumber} with ${currentChunk.length} transactions`);
        
        // Create batch requests for current chunk with correlation tracking
        const chunkRequests: AIClassificationRequest[] = currentChunk.map(transaction => ({
          transactionText: transaction.description,
          amount: transaction.amount,
          date: transaction.date.toISOString(),
          availableCategories: categories
        }));
        
        // Create correlation map to properly match responses back to transactions
        const chunkCorrelationMap = new Map<string, typeof currentChunk[0]>();
        currentChunk.forEach(transaction => {
          const correlationKey = `${transaction.description}|${transaction.amount}|${transaction.date.toISOString()}`;
          chunkCorrelationMap.set(correlationKey, transaction);
        });
        
        try {
          const res = await azureOpenAIService.classifyTransactionsBatch(chunkRequests);
          const uncategorizedCount = res.filter(r => (r.categoryId || '').toLowerCase() === 'uncategorized').length;
          console.log(`📊 AI classification succeeded for batch ${batchNumber}, got ${res.length} results (uncategorized: ${uncategorizedCount})`);
          
          // CRITICAL FIX: Create auto-rules immediately after each batch
          console.log(`📋 Creating auto-rules from batch ${batchNumber} results...`);
          let autoRulesCreatedThisBatch = 0;
          
          // Process this batch's results and create rules immediately
          const idToNameCategory = new Map(categories.map(c => [c.id, c.name]));
          const idToNameSub = new Map<string, { name: string; parentId: string }>();
          categories.forEach(c => (c.subcategories || []).forEach(s => idToNameSub.set(s.id, { name: s.name, parentId: c.id })));
          
          for (let i = 0; i < currentChunk.length && i < res.length; i++) {
            const transaction = currentChunk[i];
            const ai = res[i];
            
            // Check if this transaction requires higher confidence due to ACH DEBIT or withdrawal patterns
            const needsHighConfidence = this.requiresHigherConfidence(transaction.description);
            const confidenceThreshold = needsHighConfidence ? 0.9 : 0.8;
            
            // Auto-create rule from AI classification if confidence is high enough
            if (ai.confidence >= confidenceThreshold && 
                ai.categoryId && 
                ai.categoryId !== 'Uncategorized' && 
                ai.categoryId !== 'uncategorized') {
              
              try {
                const categoryName = idToNameCategory.get(ai.categoryId) || ai.categoryId;
                const subName = ai.subcategoryId ? (idToNameSub.get(ai.subcategoryId)?.name) : undefined;
                
                await rulesService.createAutoRuleFromAI(
                  transaction.account,
                  transaction.description,
                  categoryName,
                  subName,
                  ai.confidence
                );
                autoRulesCreatedThisBatch++;
                console.log(`📋 Auto-created rule from batch ${batchNumber}: ${transaction.description} → ${categoryName} (${needsHighConfidence ? '90%' : '80%'} threshold)`);
              } catch (error) {
                console.warn('Failed to create auto-rule from AI classification:', error);
              }
            } else if (needsHighConfidence && ai.confidence < 0.9) {
              console.log(`📋 Skipping auto-rule creation for ACH DEBIT/withdrawal transaction due to insufficient confidence: ${Math.round(ai.confidence * 100)}% < 90%`);
            }
          }
          
          if (autoRulesCreatedThisBatch > 0) {
            console.log(`📋 Created ${autoRulesCreatedThisBatch} auto-rules from batch ${batchNumber} - these will be available for subsequent batches`);
          }
          
          // Store results with correlation keys for final transaction creation
          const correlatedResults = res.map((aiResult, index) => {
            const originalTransaction = currentChunk[index];
            if (originalTransaction) {
              const correlationKey = `${originalTransaction.description}|${originalTransaction.amount}|${originalTransaction.date.toISOString()}`;
              return {
                ...aiResult,
                correlationKey
              };
            }
            return {
              ...aiResult,
              correlationKey: `unknown-${index}`
            };
          });
          batchResults.push(...correlatedResults);
          
          // Remove processed transactions from remaining list
          remainingUnmatchedTransactions = remainingUnmatchedTransactions.slice(currentChunk.length);
          
        } catch (error) {
          console.warn('⚠️ AI classification failed, using default categorization:', error);
          // Create default responses for failed AI classification
          const defaultResponses = chunkRequests.map(() => ({
            categoryId: 'uncategorized',
            subcategoryId: undefined,
            confidence: 0.1,
            reasoning: 'AI classification unavailable, manually review recommended'
          } as AIClassificationResponse));
          batchResults.push(...defaultResponses);
          
          // Remove processed transactions from remaining list
          remainingUnmatchedTransactions = remainingUnmatchedTransactions.slice(currentChunk.length);
          
          console.log(`📊 Created ${defaultResponses.length} default responses for failed AI classification`);
        }
        
        // Update progress
        if (onProgress) {
          const processed = allMatchedTransactions.length + batchResults.length;
          onProgress(processed);
        }
      }
    }

    console.log(`🎯 Step 4: Final transaction assembly`);
    console.log(`📊 Input summary: ${allMatchedTransactions.length} rule-matched + ${batchResults.length} AI-processed = ${allMatchedTransactions.length + batchResults.length} total`);

    // Step 4: Combine rule-matched and AI-processed transactions
    const transactions: Transaction[] = [];

    // Add rule-matched transactions (already have proper category/subcategory)
    console.log(`➕ Adding ${allMatchedTransactions.length} rule-matched transactions...`);
    allMatchedTransactions.forEach(({ transaction, rule }, idx) => {
      const newTransaction = {
        ...transaction,
        id: uuidv4(),
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        confidence: 1.0,
        reasoning: `Matched rule: ${rule.name}`,
      };
      transactions.push(newTransaction);
      
      if (idx < 2) {
        console.log(`  Rule-matched ${idx + 1}: ID=${newTransaction.id}, ${newTransaction.date.toISOString()} | ${newTransaction.amount} | "${newTransaction.description}" -> ${newTransaction.category}`);
      }
    });

    // Process AI results for unmatched transactions 
    // CRITICAL FIX: Use correlation keys instead of indices to properly match AI responses to transactions
    console.log(`🤖 Processing AI results for unmatched transactions...`);
    console.log(`📊 Original unmatched: ${ruleResults.unmatchedTransactions.length}, AI results: ${batchResults.length}, Current rule-matched: ${allMatchedTransactions.length}`);
    
    const idToNameCategory = new Map(categories.map(c => [c.id, c.name]));
    const idToNameSub = new Map<string, { name: string; parentId: string }>();
    categories.forEach(c => (c.subcategories || []).forEach(s => idToNameSub.set(s.id, { name: s.name, parentId: c.id })));

    // Create a map of AI results by correlation key for fast lookup
    const aiResultsByCorrelation = new Map<string, any>();
    batchResults.forEach(result => {
      if (result.correlationKey) {
        aiResultsByCorrelation.set(result.correlationKey, result);
      }
    });

    // CRITICAL FIX: Match AI results to original unmatched transactions properly
    // This addresses the index mismatch when rules are created during batch processing
    const originalUnmatchedTransactions = ruleResults.unmatchedTransactions;
    const processedTransactionDescriptions = new Set(
      allMatchedTransactions.map(match => `${match.transaction.description}|${match.transaction.amount}|${match.transaction.date.toISOString()}`)
    );

    for (const transaction of originalUnmatchedTransactions) {
      const transactionCorrelationKey = `${transaction.description}|${transaction.amount}|${transaction.date.toISOString()}`;
      
      // Skip transactions that were already matched by rules during batch processing
      if (processedTransactionDescriptions.has(transactionCorrelationKey)) {
        console.log(`  Skipping transaction already rule-matched: ${transaction.description}`);
        continue;
      }
      
      // Find the correct AI result for this specific transaction using correlation key
      const ai = aiResultsByCorrelation.get(transactionCorrelationKey) || { 
        categoryId: 'uncategorized', 
        confidence: 0.1,
        reasoning: 'No AI classification result found for this transaction'
      } as AIClassificationResponse;

      if (transactions.length < 2) {
        console.log(`  AI processing: ${transaction.date.toISOString()} | ${transaction.amount} | "${transaction.description}" -> AI: ${ai.categoryId} (${ai.confidence})`);
      }

      // Constrain AI result to valid categories
      const categoryIds = new Set(categories.map(c => c.id));
      const lowerToIdCategory = new Map<string, string>(categories.map(c => [c.name.toLowerCase(), c.id]));
      let validCategoryId = ai.categoryId;
      let validSubcategoryId = ai.subcategoryId;
      
      if (!categoryIds.has(validCategoryId) && lowerToIdCategory.has(String(validCategoryId).toLowerCase())) {
        validCategoryId = lowerToIdCategory.get(String(validCategoryId).toLowerCase())!;
      }
      if (!categoryIds.has(validCategoryId)) {
        validCategoryId = 'uncategorized';
        validSubcategoryId = undefined;
      }
      if (validSubcategoryId) {
        const sub = idToNameSub.get(validSubcategoryId);
        if (!sub || sub.parentId !== validCategoryId) {
          const cat = categories.find(c => c.id === validCategoryId);
          const lowerToIdSub = new Map<string, string>((cat?.subcategories || []).map(s => [s.name.toLowerCase(), s.id]));
          const byName = lowerToIdSub.get(String(validSubcategoryId).toLowerCase());
          validSubcategoryId = byName || undefined;
        }
      }

      // Convert ids to display names for storage
      const categoryName = idToNameCategory.get(validCategoryId) || 'Uncategorized';
      const subName = validSubcategoryId ? (idToNameSub.get(validSubcategoryId)?.name) : undefined;

      // Special handling for ACH DEBIT and withdrawal transactions - require 90% confidence
      const needsHighConfidence = this.requiresHigherConfidence(transaction.description);
      let finalCategoryName = categoryName;
      let finalSubName = subName;
      let finalConfidence = ai.confidence;

      if (needsHighConfidence && ai.confidence < 0.9) {
        // For ACH DEBIT and withdrawal transactions with < 90% confidence, leave uncategorized
        finalCategoryName = 'Uncategorized';
        finalSubName = undefined;
        finalConfidence = ai.confidence; // Keep original confidence for transparency
        console.log(`⚠️ ACH DEBIT/Withdrawal transaction requires 90% confidence, but AI returned ${Math.round(ai.confidence * 100)}% - leaving uncategorized: "${transaction.description}"`);
      }

      // Note: Auto-rule creation now happens immediately after each batch (above) for better availability

      const newTransaction = {
        ...transaction,
        category: finalCategoryName,
        subcategory: finalSubName,
        confidence: finalConfidence,
        reasoning: ai.reasoning,
        id: uuidv4(),
        addedDate: new Date(),
        lastModifiedDate: new Date(),
      };
      transactions.push(newTransaction);
      
      if (transactions.length <= 2) {
        console.log(`  AI-processed ${transactions.length}: ID=${newTransaction.id}, Final category: ${finalCategoryName}`);
      }
    }

    console.log(`✅ processTransactions COMPLETE`);
    console.log(`📊 Final result: ${transactions.length} transactions ready for import`);
    
    if (transactions.length > 0) {
      console.log('📋 Sample final transactions (first 3):');
      transactions.slice(0, 3).forEach((tx, idx) => {
        console.log(`  Final ${idx + 1}: ID=${tx.id}, ${tx.date.toISOString()} | ${tx.amount} | "${tx.description}" -> ${tx.category}`);
      });
    }
    
    return transactions;
  }

  /**
   * Check if a transaction description contains ACH DEBIT or withdrawal patterns
   * that require higher confidence thresholds for AI categorization
   */
  private requiresHigherConfidence(description: string): boolean {
    const lowerDesc = description.toLowerCase();
    return lowerDesc.includes('ach debit') || 
           (lowerDesc.includes('withdrawal') && !lowerDesc.includes('atm withdrawal') && !lowerDesc.includes('cash withdrawal'));
  }

  /**
   * Detect if amounts in the transaction data are reversed (expenses positive, income negative)
   * Returns true if amounts should be flipped to match the expected convention
   */
  private async detectAmountReversal(transactions: Array<{
    date: Date | null;
    description: string;
    amount: number | null;
    notes: string;
  }>, accountId: string): Promise<boolean> {
    if (transactions.length === 0) {
      return false;
    }

    console.log(`🔍 Analyzing ${transactions.length} transactions for amount reversal detection`);

    // Get account information to check if it's a credit card
    const account = accountManagementService.getAccount(accountId);
    const isCreditCard = account?.type === 'credit';
    
    console.log(`🏦 Account info: ${account?.name} (${account?.type}) - Credit card: ${isCreditCard}`);

    // Credit card specific logic
    if (isCreditCard) {
      const positiveCount = transactions.filter(tx => tx.amount && tx.amount > 0).length;
      const negativeCount = transactions.filter(tx => tx.amount && tx.amount < 0).length;
      const totalCount = positiveCount + negativeCount;
      
      console.log(`💳 Credit card analysis: ${positiveCount} positive, ${negativeCount} negative (${totalCount} total)`);
      
      // For credit cards, if most transactions are positive, it's likely reversed
      // Credit cards should predominantly have negative amounts (charges) with occasional positive amounts (payments/credits)
      if (totalCount >= 3 && positiveCount / totalCount >= 0.6) {
        console.log(`🔄 Credit card reversal detected: ${Math.round((positiveCount / totalCount) * 100)}% of transactions are positive`);
        console.log(`💡 Credit cards should have mostly negative amounts (charges), suggesting reversal is needed`);
        return true;
      }
      
      // If it's a credit card but doesn't meet the reversal criteria, log why
      if (totalCount >= 3) {
        console.log(`✅ Credit card amounts appear correct: ${Math.round((negativeCount / totalCount) * 100)}% negative (charges), ${Math.round((positiveCount / totalCount) * 100)}% positive (payments/credits)`);
      }
    }

    // Common expense keywords that should typically be negative
    const expenseKeywords = [
      'starbucks', 'coffee', 'cafe', 'restaurant', 'dining', 'food',
      'gas', 'shell', 'exxon', 'mobil', 'chevron', 'bp', 'fuel',
      'amazon', 'walmart', 'target', 'store', 'shop', 'purchase',
      'mcdonalds', 'burger', 'pizza', 'taco',
      'grocery', 'supermarket', 'market',
      'uber', 'lyft', 'taxi',
      'netflix', 'spotify', 'subscription',
      'rent', 'mortgage', 'insurance', 'utility', 'electric', 'water', 'gas bill',
      'pharmacy', 'doctor', 'hospital', 'medical',
      'hotel', 'airline', 'flight', 'travel'
    ];

    // Common income keywords that should typically be positive
    const incomeKeywords = [
      'salary', 'paycheck', 'deposit', 'pay', 'wages', 'income',
      'refund', 'return', 'credit', 'reimbursement',
      'dividend', 'interest', 'bonus',
      'transfer in', 'deposit', 'direct deposit',
      'transfer funds from', 'funds from', 'transfer from', 'wire received', 'wired funds',
      'freelance', 'consulting', 'payment received'
    ];

    let expenseCount = 0;
    let expensePositiveCount = 0;
    let incomeCount = 0;
    let incomeNegativeCount = 0;

    // Analyze each transaction
    for (const tx of transactions) {
      if (!tx.amount || !tx.description) continue;

      const desc = tx.description.toLowerCase();
      const isPositive = tx.amount > 0;

      // Check if it matches expense keywords
      const isLikelyExpense = expenseKeywords.some(keyword => desc.includes(keyword));
      if (isLikelyExpense) {
        expenseCount++;
        if (isPositive) {
          expensePositiveCount++;
        }
      }

      // Check if it matches income keywords
      const isLikelyIncome = incomeKeywords.some(keyword => desc.includes(keyword));
      if (isLikelyIncome) {
        incomeCount++;
        if (!isPositive) {
          incomeNegativeCount++;
        }
      }
    }

    console.log(`💰 Amount reversal analysis:`, {
      expenseCount,
      expensePositiveCount,
      incomeCount,
      incomeNegativeCount,
      expensePositiveRate: expenseCount > 0 ? (expensePositiveCount / expenseCount) : 0,
      incomeNegativeRate: incomeCount > 0 ? (incomeNegativeCount / incomeCount) : 0
    });

    // Decision logic:
    // If we have enough samples and most expenses are positive OR most income is negative,
    // then amounts are likely reversed. However, if we have BOTH income and expense patterns
    // detected, we need to be more careful about blanket reversal.
    const minSampleSize = 3;
    const minIncomeForMixed = 2; // Lower threshold for income in mixed scenarios
    const confidenceThreshold = 0.7; // 70% of transactions should match the reversed pattern

    let shouldReverse = false;

    // If we have both income and expense patterns, be more conservative
    const hasBothPatterns = incomeCount >= minIncomeForMixed && expenseCount >= minSampleSize;
    
    if (hasBothPatterns) {
      console.log(`🔍 Both income and expense patterns detected - using conservative approach`);
      console.log(`   📊 Counts: expenses=${expenseCount} (${expensePositiveCount} positive), income=${incomeCount} (${incomeNegativeCount} negative)`);
      
      // Only reverse if BOTH patterns indicate reversal
      const expensePositiveRate = expensePositiveCount / expenseCount;
      const incomeNegativeRate = incomeCount > 0 ? (incomeNegativeCount / incomeCount) : 0;
      
      if (expensePositiveRate >= confidenceThreshold && incomeNegativeRate >= confidenceThreshold) {
        console.log(`🔄 Both patterns reversed - expenses: ${Math.round(expensePositiveRate * 100)}% positive, income: ${Math.round(incomeNegativeRate * 100)}% negative`);
        shouldReverse = true;
      } else {
        console.log(`✅ Mixed data detected - keeping amounts as-is to preserve transfer fund signs`);
        console.log(`   📊 Expense positive rate: ${Math.round(expensePositiveRate * 100)}%, income negative rate: ${Math.round(incomeNegativeRate * 100)}%`);
      }
    } else {
      // Original logic for homogeneous data
      
      // Check expense pattern: if most expense-like transactions are positive, amounts are reversed
      if (expenseCount >= minSampleSize) {
        const expensePositiveRate = expensePositiveCount / expenseCount;
        if (expensePositiveRate >= confidenceThreshold) {
          console.log(`🔄 Detected reversed amounts: ${expensePositiveCount}/${expenseCount} (${Math.round(expensePositiveRate * 100)}%) expense-like transactions are positive`);
          shouldReverse = true;
        }
      }

      // Check income pattern: if most income-like transactions are negative, amounts are reversed
      if (incomeCount >= minSampleSize && !shouldReverse) {
        const incomeNegativeRate = incomeNegativeCount / incomeCount;
        if (incomeNegativeRate >= confidenceThreshold) {
          console.log(`🔄 Detected reversed amounts: ${incomeNegativeCount}/${incomeCount} (${Math.round(incomeNegativeRate * 100)}%) income-like transactions are negative`);
          shouldReverse = true;
        }
      }
    }

    // Fallback: if we don't have enough keyword matches, use a simpler heuristic
    if (!shouldReverse && expenseCount + incomeCount < minSampleSize) {
      console.log('📊 Not enough keyword matches for algorithmic detection, using simple heuristic');
      
      // Count positive vs negative amounts
      const positiveCount = transactions.filter(tx => tx.amount && tx.amount > 0).length;
      const negativeCount = transactions.filter(tx => tx.amount && tx.amount < 0).length;
      const totalCount = positiveCount + negativeCount;
      
      // If most amounts are positive (which is unusual for typical bank statements), consider reversal
      if (totalCount >= minSampleSize && positiveCount / totalCount >= 0.8) {
        console.log(`🔄 Simple heuristic: ${positiveCount}/${totalCount} (${Math.round((positiveCount / totalCount) * 100)}%) amounts are positive, likely reversed`);
        shouldReverse = true;
      }
    }

    if (shouldReverse) {
      console.log('✅ Amount reversal needed - will flip all amounts');
    } else {
      console.log('✅ Amounts appear to be in correct format (expenses negative, income positive)');
    }

    return shouldReverse;
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

      // Get account details to determine original currency
      const account = accountManagementService.getAccount(accountId);
      const accountCurrency = account?.currency || 'USD';
      const defaultCurrency = await userPreferencesService.getDefaultCurrency();

      const baseTransaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
        date,
        description,
        notes,
        amount,
        category: 'Uncategorized', // Temporary, will be set by rules or AI
        account: account?.name || 'Unknown Account',
        type: amount >= 0 ? 'income' as const : 'expense' as const,
        isVerified: false,
        originalText: description,
        // Set original currency based on account currency
        originalCurrency: accountCurrency !== defaultCurrency ? accountCurrency : undefined
      };

  // Always store the original amount and currency; defer conversion to display time
  // If needed, exchange rate will be computed on demand in currencyDisplayService

      // Try to apply category rules first
      const ruleResult = await rulesService.applyRules(baseTransaction);
      
      if (ruleResult.matched && ruleResult.rule) {
        // Rule matched - use rule's category assignment
        return {
          ...baseTransaction,
          category: ruleResult.rule.action.categoryName,
          subcategory: ruleResult.rule.action.subcategoryName,
          confidence: 1.0,
          reasoning: `Matched rule: ${ruleResult.rule.name}`,
        };
      }

      // No rule matched - use AI categorization
      const aiClassification = await this.getAIClassification(
        description, 
        amount, 
        date.toISOString(), 
        categories, 
        subcategories
      );

      const transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
        ...baseTransaction,
        category: aiClassification.categoryId || 'Uncategorized',
        subcategory: aiClassification.subcategoryId,
        confidence: aiClassification.confidence,
        reasoning: aiClassification.reasoning,
      };

      // Auto-create rule from AI classification if confidence is high enough and category is not "Uncategorized"
      if (aiClassification.confidence >= 0.8 && 
          aiClassification.categoryId && 
          aiClassification.categoryId !== 'Uncategorized' && 
          aiClassification.categoryId !== 'uncategorized') {
        
        try {
          await rulesService.createAutoRuleFromAI(
            baseTransaction.account,
            description,
            aiClassification.categoryId,
            aiClassification.subcategoryId,
            aiClassification.confidence
          );
          console.log(`📋 Auto-created rule for: ${description} (${baseTransaction.account}) → ${aiClassification.categoryId}`);
        } catch (error) {
          console.warn('Failed to create auto-rule from AI classification:', error);
          // Don't fail the transaction processing if rule creation fails
        }
      }

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
      
      // Handle OFX format YYYYMMDDHHMMSS
      const ofxMatch = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/);
      if (ofxMatch) {
        const [, year, month, day, hour = '00', minute = '00', second = '00'] = ofxMatch;
        const date = new Date(
          parseInt(year),
          parseInt(month) - 1, // Month is 0-indexed in JavaScript
          parseInt(day),
          parseInt(hour),
          parseInt(minute),
          parseInt(second)
        );
        if (!isNaN(date.getTime())) {
          return date;
        }
      }

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
    if (!column || typeof column !== 'string') return null;
    
    // Handle combined withdrawal/deposit column mapping
    if (column.toLowerCase().includes('withdrawal') && column.toLowerCase().includes('deposit')) {
      // Try to find separate Withdrawal and Deposit columns
      const withdrawalAmount = this.extractAmountFromColumn(row, 'Withdrawal') || 
                               this.extractAmountFromColumn(row, 'withdrawal');
      const depositAmount = this.extractAmountFromColumn(row, 'Deposit') || 
                            this.extractAmountFromColumn(row, 'deposit');
      
      // If both have values, prioritize deposit (income)
      if (depositAmount !== null && depositAmount !== 0) {
        return depositAmount;
      }
      
      // Otherwise use withdrawal (make it negative for expense)
      if (withdrawalAmount !== null && withdrawalAmount !== 0) {
        return withdrawalAmount > 0 ? -withdrawalAmount : withdrawalAmount;
      }
      
      return null;
    }
    
    // Handle combined debit/credit column mapping
    if (column.toLowerCase().includes('debit') && column.toLowerCase().includes('credit')) {
      // Try to find separate Debit and Credit columns
      const debitAmount = this.extractAmountFromColumn(row, 'Debit') || 
                          this.extractAmountFromColumn(row, 'debit');
      const creditAmount = this.extractAmountFromColumn(row, 'Credit') || 
                           this.extractAmountFromColumn(row, 'credit');
      
      // If both have values, prioritize credit (income)
      if (creditAmount !== null && creditAmount !== 0) {
        return creditAmount;
      }
      
      // Otherwise use debit (make it negative for expense)
      if (debitAmount !== null && debitAmount !== 0) {
        return debitAmount > 0 ? -debitAmount : debitAmount;
      }
      
      return null;
    }
    
    return this.extractAmountFromColumn(row, column);
  }

  private extractAmountFromColumn(row: any, column: string): number | null {
    const value = this.getColumnValue(row, column);
    if (!value) return null;

    try {
      const valueStr = String(value).trim();
      
      // Handle European number format (e.g., "500.000,00")
      if (/^-?[\d.]+,\d+$/.test(valueStr)) {
        const cleanAmount = valueStr
          .replace(/\./g, '')
          .replace(',', '.');
        const amount = parseFloat(cleanAmount);
        return isNaN(amount) ? null : amount;
      }
      
      // Handle standard US format
      const cleanAmount = valueStr
        .replace(/[$,\s]/g, '')
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
      // Handle object case - row is an object with column names as keys
      // Try the column as a direct key first (e.g., "Date")
      if (row[column] !== undefined) {
        return row[column];
      }
      
      // If column is a numeric string, try to match it to object keys by position
      const index = parseInt(column);
      if (!isNaN(index)) {
        const keys = Object.keys(row);
        if (index < keys.length) {
          return row[keys[index]];
        }
      }
      
      return null;
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

      // Validate and constrain to provided categories/subcategories
      const categoryIds = new Set(categories.map(c => c.id));
      const subcategoryById = new Map<string, { sub: Subcategory; parentId: string }>();
      categories.forEach(c => {
        (c.subcategories || []).forEach(s => {
          subcategoryById.set(s.id, { sub: s, parentId: c.id });
        });
      });

      let validCategoryId = response.categoryId;
      let validSubcategoryId = response.subcategoryId;

      // If AI returned a name instead of id accidentally, attempt fuzzy mapping by name (case-insensitive)
      const lowerToIdCategory = new Map<string, string>(categories.map(c => [c.name.toLowerCase(), c.id]));
      if (!categoryIds.has(validCategoryId) && lowerToIdCategory.has(String(validCategoryId).toLowerCase())) {
        validCategoryId = lowerToIdCategory.get(String(validCategoryId).toLowerCase())!;
      }

      // Validate categoryId; fallback to 'Uncategorized' if not recognized
      if (!categoryIds.has(validCategoryId)) {
        validCategoryId = 'Uncategorized';
        validSubcategoryId = undefined;
      }

      // Validate subcategory belongs to selected category; otherwise drop it
      if (validSubcategoryId) {
        const entry = subcategoryById.get(validSubcategoryId);
        if (!entry || entry.parentId !== validCategoryId) {
          // Try mapping by name to a subcategory under the chosen category
          const cat = categories.find(c => c.id === validCategoryId);
          const lowerToIdSub = new Map<string, string>((cat?.subcategories || []).map(s => [s.name.toLowerCase(), s.id]));
          const byName = lowerToIdSub.get(String(validSubcategoryId).toLowerCase());
          validSubcategoryId = byName || undefined;
        }
      }

      return {
        categoryId: validCategoryId,
        subcategoryId: validSubcategoryId,
        confidence: response.confidence,
        reasoning: response.reasoning
      };
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

  // Methods to handle duplicate resolution
  async resolveDuplicates(fileId: string, importDuplicates: boolean, transactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[], duplicateDetection: DuplicateDetectionResult): Promise<void> {
    console.log(`🔄 Resolving duplicates for file ${fileId}, importDuplicates: ${importDuplicates}`);
    
    if (importDuplicates) {
      // Import all transactions including duplicates
      await dataService.addTransactions(transactions);
      console.log(`✅ Imported ${transactions.length} transactions (including duplicates)`);
    } else {
      // Import only unique transactions
      await dataService.addTransactions(duplicateDetection.uniqueTransactions);
      console.log(`✅ Imported ${duplicateDetection.uniqueTransactions.length} unique transactions, ignored ${duplicateDetection.duplicates.length} duplicates`);
    }
  }

  /**
   * Analyze imported transactions for currency patterns and create user prompt if needed
   */
  private async analyzeCurrenciesAndCreatePrompt(transactions: Transaction[]): Promise<FileProcessingResult['currencyPrompt']> {
    if (!transactions.length) return undefined;

    // Get current user's default currency
    const currentDefaultCurrency = await userPreferencesService.getDefaultCurrency();

    // Extract unique currencies from transactions
    const detectedCurrencies = new Set<string>();
    let foreignCurrencyCount = 0;
    
    for (const transaction of transactions) {
      if (transaction.originalCurrency) {
        detectedCurrencies.add(transaction.originalCurrency);
        if (transaction.originalCurrency !== currentDefaultCurrency) {
          foreignCurrencyCount++;
        }
      } else {
        // Detect currency from description
        const detectedCurrency = currencyDisplayService.detectCurrencyFromTransaction(transaction);
        if (detectedCurrency && detectedCurrency !== 'USD') {
          detectedCurrencies.add(detectedCurrency);
          if (detectedCurrency !== currentDefaultCurrency) {
            foreignCurrencyCount++;
          }
        }
      }
    }

    const currencies = Array.from(detectedCurrencies);
    
    // If no foreign currencies detected, no prompt needed
    if (currencies.length === 0 || foreignCurrencyCount === 0) {
      return undefined;
    }

    // Check if majority of transactions are in a foreign currency
    const foreignCurrencyPercentage = foreignCurrencyCount / transactions.length;
    
    if (foreignCurrencyPercentage > 0.5) {
      // Majority of transactions are in foreign currency - suggest currency change
      const primaryForeignCurrency = currencies.find(c => c !== currentDefaultCurrency);
      
      if (primaryForeignCurrency) {
        const currencyName = userPreferencesService.getCurrencyOptions()
          .find(option => option.value === primaryForeignCurrency)?.label || primaryForeignCurrency;
          
        return {
          detectedCurrencies: currencies,
          currentDefaultCurrency,
          suggestCurrencyChange: primaryForeignCurrency,
          message: `Most of your imported transactions (${Math.round(foreignCurrencyPercentage * 100)}%) are in ${currencyName} (${primaryForeignCurrency}), but your default currency is set to ${currentDefaultCurrency}. Would you like to change your default currency to ${primaryForeignCurrency} for better accuracy?`
        };
      }
    } else if (foreignCurrencyCount > 0) {
      // Some foreign currency transactions detected
      const currencyNames = currencies
        .filter(c => c !== currentDefaultCurrency)
        .map(c => userPreferencesService.getCurrencyOptions().find(option => option.value === c)?.label || c)
        .join(', ');
        
      return {
        detectedCurrencies: currencies,
        currentDefaultCurrency,
        message: `${foreignCurrencyCount} transactions were detected in foreign currencies (${currencyNames}). These will be automatically converted to ${currentDefaultCurrency} for display using current exchange rates.`
      };
    }

    return undefined;
  }

  /**
   * Convert File to base64 string
   */
  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

// Singleton instance
export const fileProcessingService = new FileProcessingService();
