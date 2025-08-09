import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { StatementFile, Transaction, FileSchemaMapping, FileImportProgress, Category, Subcategory, AISchemaMappingRequest, AISchemaMappingResponse, AIClassificationRequest, AIClassificationResponse, DuplicateDetectionResult } from '../types';
import { accountManagementService, AccountDetectionRequest } from './accountManagementService';
import { azureOpenAIService } from './azureOpenAIService';
import { dataService } from './dataService';
import { rulesService } from './rulesService';
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
  duplicateDetection?: DuplicateDetectionResult;
  needsDuplicateResolution?: boolean;
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

      // If we have high confidence detection (> 0.9), auto-assign the account
      if (detectionResult.confidence > 0.9 && detectionResult.detectedAccountId) {
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
      // Step 1: Initialize (10%)
      this.updateProgress(progress, 10, 'processing', 'Reading file content...', onProgress);
      
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      // Step 2: Read file content (20%)
      const fileContent = await this.readFileContent(file);
      this.updateProgress(progress, 20, 'processing', 'Analyzing file structure...', onProgress);
      
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      // Step 3: Get AI schema mapping (30%)
      this.updateProgress(progress, 30, 'processing', 'AI schema detection...', onProgress);
      const schemaMapping = await this.getAISchemaMapping(fileContent, statementFile.fileType);
      
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      // Step 4: Parse file data (40%)
      this.updateProgress(progress, 40, 'processing', 'Parsing file data...', onProgress);
      const rawData = await this.parseFileData(fileContent, statementFile.fileType, schemaMapping.mapping);
      progress.totalRows = rawData.length;
      
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      // Step 5: Process each row with AI categorization (40-90%)
      this.updateProgress(progress, 50, 'processing', 'Processing transactions with AI...', onProgress);
      const transactions = await this.processTransactions(
        fileId, // Pass fileId for cancellation checks
        rawData,
        schemaMapping.mapping,
        categories,
        subcategories,
        accountId,
        (processed: number) => {
          // Update progress during transaction processing (50-90%)
          const transactionProgress = 50 + Math.round((processed / rawData.length) * 40);
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
    // Read as ArrayBuffer, then decode with best-fit encoding (UTF-8, Windows-1252, ISO-8859-1)
    // This preserves Scandinavian characters (æ, ø, å) commonly found in CSVs saved with legacy encodings.
    const readAsArrayBuffer = (): Promise<ArrayBuffer> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result;
          if (result instanceof ArrayBuffer) resolve(result);
          else if (typeof result === 'string') resolve(new TextEncoder().encode(result).buffer);
          else reject(new Error('Failed to read file content'));
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
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

    if (hasUTF16LE) {
      const dec = new TextDecoder('utf-16le');
      return stripBOM(dec.decode(new DataView(buffer)));
    }
    if (hasUTF16BE) {
      const dec = new TextDecoder('utf-16be' as any);
      return stripBOM(dec.decode(new DataView(buffer)));
    }

    // Prefer UTF-8; if we see replacement characters, try common Western encodings.
  const utf8 = tryDecode(buffer, 'utf-8');
    const utf8Repl = countReplacement(utf8);

  if (utf8Repl === 0 || hasUTF8BOM) return utf8;

    // Some CSV exports use Windows-1252 or ISO-8859-1
    const cp1252 = tryDecode(buffer, 'windows-1252');
    const cp1252Repl = countReplacement(cp1252);
    const cp1252C1 = countC1Controls(cp1252);

  const iso88591 = tryDecode(buffer, 'iso-8859-1');
  const isoRepl = countReplacement(iso88591);
  const isoC1 = countC1Controls(iso88591);

  const iso885915 = tryDecode(buffer, 'iso-8859-15');
  const iso15Repl = countReplacement(iso885915);
  const iso15C1 = countC1Controls(iso885915);

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

    return best.text || utf8; // fallback to utf8 if all failed
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
    console.log(`📊 processTransactions called with ${rawData.length} raw data rows`);

    // Prepare rows -> basic extracted data first
    const prepared: Array<{
      idx: number;
      date: Date | null;
      description: string;
      amount: number | null;
      notes: string;
    }> = rawData.map((row, idx) => ({
      idx,
      date: this.extractDate(row, mapping.dateColumn, mapping.dateFormat),
      description: this.extractString(row, mapping.descriptionColumn),
      amount: this.extractAmount(row, mapping.amountColumn),
      notes: this.extractString(row, mapping.notesColumn)
    }));

    console.log(`📊 Prepared ${prepared.length} rows from raw data`);

    const validIndices = prepared
      .filter(p => p.date && p.description && p.amount !== null)
      .map(p => p.idx);

    console.log(`📊 Found ${validIndices.length} valid rows out of ${prepared.length} prepared rows`);

    // Step 1: Apply category rules first
    console.log(`📋 Applying category rules to ${validIndices.length} valid transactions`);
    const validTransactions = validIndices.map(i => prepared[i]).filter(p => p.date && p.description && p.amount !== null);
    const ruleResults = await rulesService.applyRulesToBatch(validTransactions.map(p => ({
      date: p.date!,
      description: p.description,
      amount: p.amount!,
      notes: p.notes,
      category: 'Uncategorized', // Will be overridden by rules or AI
      account: accountManagementService.getAccount(accountId)?.name || 'Unknown Account',
      type: (p.amount! >= 0) ? 'income' : 'expense',
      isVerified: false,
      originalText: p.description
    })));

    console.log(`📋 Rules applied: ${ruleResults.matchedTransactions.length} matched, ${ruleResults.unmatchedTransactions.length} need AI`);

    // Step 2: Build batch requests for AI (only for unmatched transactions)
    const batchRequests: AIClassificationRequest[] = ruleResults.unmatchedTransactions.map(transaction => ({
      transactionText: transaction.description,
      amount: transaction.amount,
      date: transaction.date.toISOString(),
      availableCategories: categories
    }));

    console.log(`📊 Created ${batchRequests.length} batch requests for AI (reduced from ${validIndices.length} total)`);

    // Step 3: Call AI in batch chunks only for unmatched transactions
    const batchResults: AIClassificationResponse[] = [];
    if (batchRequests.length > 0) {
      const CHUNK = 10; // smaller batch size to avoid token/rate limits
      for (let start = 0; start < batchRequests.length; start += CHUNK) {
        if (this.isCancelled(fileId)) {
          console.log('🛑 Transaction processing cancelled during batch classification');
          throw new Error('Import cancelled by user');
        }
        const slice = batchRequests.slice(start, start + CHUNK);
        try {
          const res = await azureOpenAIService.classifyTransactionsBatch(slice);
          batchResults.push(...res);
          const uncategorizedCount = res.filter(r => (r.categoryId || '').toLowerCase() === 'uncategorized').length;
          console.log(`📊 AI classification succeeded for batch ${start}-${start + slice.length}, got ${res.length} results (uncategorized: ${uncategorizedCount})`);
        } catch (error) {
          console.warn('⚠️ AI classification failed, using default categorization:', error);
          // Create default responses for failed AI classification
          const defaultResponses = slice.map(() => ({
            categoryId: 'uncategorized',
            subcategoryId: undefined,
            confidence: 0.1,
            reasoning: 'AI classification unavailable, manually review recommended'
          } as AIClassificationResponse));
          batchResults.push(...defaultResponses);
          console.log(`📊 Created ${defaultResponses.length} default responses for failed AI classification`);
        }
        if (onProgress) {
          const processed = ruleResults.matchedTransactions.length + Math.min(ruleResults.unmatchedTransactions.length, start + slice.length);
          onProgress(processed);
        }
      }
    }

    console.log(`📊 Final results: ${ruleResults.matchedTransactions.length} rule-matched + ${batchResults.length} AI-processed = ${ruleResults.matchedTransactions.length + batchResults.length} total`);

    // Step 4: Combine rule-matched and AI-processed transactions
    const transactions: Transaction[] = [];

    // Add rule-matched transactions (already have proper category/subcategory)
    ruleResults.matchedTransactions.forEach(({ transaction, rule }) => {
      transactions.push({
        ...transaction,
        id: uuidv4(),
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        confidence: 1.0,
        reasoning: `Matched rule: ${rule.name}`,
      });
    });

    // Process AI results for unmatched transactions
    const idToNameCategory = new Map(categories.map(c => [c.id, c.name]));
    const idToNameSub = new Map<string, { name: string; parentId: string }>();
    categories.forEach(c => (c.subcategories || []).forEach(s => idToNameSub.set(s.id, { name: s.name, parentId: c.id })));

    ruleResults.unmatchedTransactions.forEach((transaction, index) => {
      const ai = batchResults[index] || { categoryId: 'uncategorized', confidence: 0.1 } as AIClassificationResponse;

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

      transactions.push({
        ...transaction,
        category: categoryName,
        subcategory: subName,
        confidence: ai.confidence,
        reasoning: ai.reasoning,
        id: uuidv4(),
        addedDate: new Date(),
        lastModifiedDate: new Date(),
      });
    });

    console.log(`📊 processTransactions completed. Returning ${transactions.length} transactions`);
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

      const baseTransaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
        date,
        description,
        notes,
        amount,
        category: 'Uncategorized', // Temporary, will be set by rules or AI
        account: accountManagementService.getAccount(accountId)?.name || 'Unknown Account',
        type: amount >= 0 ? 'income' as const : 'expense' as const,
        isVerified: false,
        originalText: description
      };

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
}

// Singleton instance
export const fileProcessingService = new FileProcessingService();
