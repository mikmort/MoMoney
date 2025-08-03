import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { 
  StatementFile, 
  FileSchemaMapping, 
  FileImportProgress, 
  Transaction,
  AISchemaMappingRequest,
  AISchemaMappingResponse,
  AIClassificationRequest,
  AIClassificationResponse,
  Category,
  Subcategory
} from '../types';
import { azureOpenAIService } from './azureOpenAIService';
import { dataService } from './dataService';
import { v4 as uuidv4 } from 'uuid';

export class FileProcessingService {
  private activeImports = new Map<string, FileImportProgress>();
  private cancellationTokens = new Map<string, boolean>();

  // Method to cancel an active import
  cancelImport(fileId: string): void {
    console.log(`🛑 Cancelling import for file: ${fileId}`);
    this.cancellationTokens.set(fileId, true);
    const progress = this.activeImports.get(fileId);
    if (progress) {
      progress.status = 'error';
      progress.errors.push('Import cancelled by user');
    }
  }

  // Check if import is cancelled
  private isCancelled(fileId: string): boolean {
    return this.cancellationTokens.get(fileId) === true;
  }

  // Clean up after import completion or cancellation
  private cleanup(fileId: string): void {
    this.activeImports.delete(fileId);
    this.cancellationTokens.delete(fileId);
  }

  async processFile(
    file: File, 
    categories: Category[], 
    subcategories: Subcategory[],
    onProgress?: (progress: FileImportProgress) => void
  ): Promise<{ statementFile: StatementFile; fileId: string }> {
    const fileId = uuidv4();
    const statementFile: StatementFile = {
      id: fileId,
      filename: file.name,
      fileSize: file.size,
      uploadDate: new Date(),
      status: 'pending',
      fileType: this.getFileType(file.name),
      progress: 0,
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

    this.activeImports.set(fileId, progress);

    try {
      // Check for cancellation
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      // Step 1: Read file content
      this.updateProgress(progress, 10, 'processing', 'Reading file...', onProgress);
      const fileContent = await this.readFileContent(file);

      // Check for cancellation
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      // Step 2: Get schema mapping from AI
      this.updateProgress(progress, 25, 'mapping', 'Analyzing file structure...', onProgress);
      const schemaMapping = await this.getAISchemaMapping(fileContent, statementFile.fileType);
      statementFile.schemaMapping = schemaMapping.mapping;

      // Check for cancellation
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      // Step 3: Parse file data
      this.updateProgress(progress, 40, 'importing', 'Parsing file data...', onProgress);
      const rawData = await this.parseFileData(fileContent, statementFile.fileType, schemaMapping.mapping);
      progress.totalRows = rawData.length;

      // Check for cancellation
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      // Step 4: Process each row with AI categorization
      this.updateProgress(progress, 50, 'importing', 'Processing transactions...', onProgress);
      const transactions = await this.processTransactions(
        fileId, // Pass fileId for cancellation checks
        rawData, 
        schemaMapping.mapping, 
        categories, 
        subcategories,
        (processed) => {
          progress.processedRows = processed;
          const progressPercent = 50 + (processed / rawData.length) * 40;
          this.updateProgress(progress, progressPercent, 'importing', 
            `Processing transaction ${processed} of ${rawData.length}...`, onProgress);
        }
      );

      // Check for cancellation
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      // Step 5: Save to database
      this.updateProgress(progress, 90, 'importing', 'Saving transactions...', onProgress);
      console.log(`🔍 FileProcessingService: About to save ${transactions.length} transactions`);
      console.log(`🔍 Sample transactions:`, transactions.slice(0, 2));
      await dataService.addTransactions(transactions);

      // Step 6: Complete
      statementFile.status = 'completed';
      statementFile.transactionCount = transactions.length;
      statementFile.processedCount = transactions.length;
      this.updateProgress(progress, 100, 'completed', 'Import completed successfully!', onProgress);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      statementFile.status = 'error';
      statementFile.errorMessage = errorMessage;
      progress.errors.push(errorMessage);
      this.updateProgress(progress, progress.progress, 'error', `Error: ${errorMessage}`, onProgress);
    } finally {
      this.cleanup(fileId);
    }

    return { statementFile, fileId };
  }

  private updateProgress(
    progress: FileImportProgress, 
    percent: number, 
    status: StatementFile['status'], 
    step: string,
    onProgress?: (progress: FileImportProgress) => void
  ): void {
    progress.progress = percent;
    progress.status = status;
    progress.currentStep = step;
    
    if (onProgress) {
      onProgress({ ...progress });
    }
  }

  private getFileType(filename: string): StatementFile['fileType'] {
    const extension = filename.toLowerCase().split('.').pop();
    switch (extension) {
      case 'pdf': return 'pdf';
      case 'csv': return 'csv';
      case 'xlsx':
      case 'xls': return 'xlsx';
      case 'ofx': return 'ofx';
      default: return 'csv';
    }
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
        targetSchema: ['date', 'description', 'additionalNotes', 'category', 'subcategory', 'amount'],
      };

      const prompt = `
Analyze this ${fileType.toUpperCase()} file content and map it to our transaction schema.

Target schema fields:
- date: Transaction date
- description: Transaction description  
- additionalNotes: Additional notes (optional)
- category: Transaction category (optional in source)
- subcategory: Transaction subcategory (optional in source)
- amount: Transaction amount

File content sample:
${request.fileContent}

IMPORTANT MAPPING RULES:
1. If the data has HEADERS (like "Date", "Amount", "Text"), use the EXACT header name as the column identifier
2. If the data has NO headers (just rows of values), use numeric indices (0, 1, 2, etc.)
3. For date formats: Analyze the actual date values to determine the format:
   - "03.07.2024" = "DD.MM.YYYY" (European format)
   - "07/03/2024" = "MM/DD/YYYY" (US format)  
   - "2024-07-03" = "YYYY-MM-DD" (ISO format)
4. For amount formats: Look for European number formatting (comma as decimal separator)

EXAMPLES:
- If you see headers like {Date: "03.07.2024", Text: "Transfer", Amount: "500.000,00"}
  → dateColumn: "Date", descriptionColumn: "Text", amountColumn: "Amount", dateFormat: "DD.MM.YYYY"
- If you see array data like ["03.07.2024", "Transfer", "500.000,00"]  
  → dateColumn: "0", descriptionColumn: "1", amountColumn: "2", dateFormat: "DD.MM.YYYY"

Return ONLY a clean JSON response without any markdown formatting or code blocks:
{
  "mapping": {
    "dateColumn": "column_name_or_index",
    "descriptionColumn": "column_name_or_index", 
    "amountColumn": "column_name_or_index",
    "categoryColumn": "column_name_or_index", (if exists)
    "subcategoryColumn": "column_name_or_index", (if exists)
    "notesColumn": "column_name_or_index", (if exists)
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
        // Clean the response to handle markdown code blocks
        const cleanedResponse = this.cleanAIResponse(response);
        const aiResponse = JSON.parse(cleanedResponse);
        return aiResponse;
      } catch (parseError) {
        console.warn('Failed to parse AI schema mapping response:', parseError, 'Raw response:', response);
        // Fallback to default mapping if AI response can't be parsed
        return this.getDefaultSchemaMapping(fileType);
      }
    } catch (error) {
      console.warn('AI schema mapping failed, using default:', error);
      return this.getDefaultSchemaMapping(fileType);
    }
  }

  private getSampleContent(content: string, fileType: StatementFile['fileType']): string {
    if (fileType === 'csv') {
      const lines = content.split('\n').slice(0, 10); // First 10 lines
      return lines.join('\n');
    } else if (fileType === 'xlsx') {
      // For Excel files, we'll parse a small sample
      try {
        const workbook = XLSX.read(content, { type: 'string' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        return JSON.stringify(jsonData.slice(0, 10), null, 2);
      } catch {
        return content.substring(0, 2000);
      }
    }
    
    return content.substring(0, 2000); // First 2000 characters for other types
  }

  private getDefaultSchemaMapping(fileType: StatementFile['fileType']): AISchemaMappingResponse {
    const mapping: FileSchemaMapping = {
      hasHeaders: true,
      skipRows: 0,
      dateFormat: 'MM/DD/YYYY',
      amountFormat: 'negative for debits',
    };

    if (fileType === 'csv') {
      mapping.dateColumn = '0';
      mapping.descriptionColumn = '1';
      mapping.amountColumn = '2';
    }

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
      case 'xlsx':
        return this.parseExcel(content, mapping);
      case 'ofx':
        return this.parseOFX(content, mapping);
      case 'pdf':
        return this.parsePDF(content, mapping);
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

  private async parseOFX(content: string, mapping: FileSchemaMapping): Promise<any[]> {
    // Basic OFX parsing - this is simplified and may need enhancement
    const transactions: any[] = [];
    const lines = content.split('\n');
    let currentTransaction: any = {};
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes('<STMTTRN>')) {
        currentTransaction = {};
      } else if (trimmed.includes('</STMTTRN>')) {
        if (Object.keys(currentTransaction).length > 0) {
          transactions.push(currentTransaction);
        }
      } else if (trimmed.includes('<DTPOSTED>')) {
        currentTransaction.date = trimmed.replace(/<\/?DTPOSTED>/g, '').substring(0, 8);
      } else if (trimmed.includes('<TRNAMT>')) {
        currentTransaction.amount = parseFloat(trimmed.replace(/<\/?TRNAMT>/g, ''));
      } else if (trimmed.includes('<NAME>') || trimmed.includes('<MEMO>')) {
        const desc = trimmed.replace(/<\/?(?:NAME|MEMO)>/g, '');
        currentTransaction.description = currentTransaction.description 
          ? `${currentTransaction.description} ${desc}` 
          : desc;
      }
    }
    
    return transactions;
  }

  private async parsePDF(content: string, mapping: FileSchemaMapping): Promise<any[]> {
    // PDF parsing is complex and would typically require pdf-parse
    // For now, we'll return a placeholder implementation
    throw new Error('PDF parsing is not yet implemented. Please convert to CSV or Excel format.');
  }

  private async processTransactions(
    fileId: string,
    rawData: any[], 
    mapping: FileSchemaMapping, 
    categories: Category[], 
    subcategories: Subcategory[],
    onProgress?: (processed: number) => void
  ): Promise<Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[]> {
    const transactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [];
    console.log(`🔍 processTransactions: Processing ${rawData.length} rows`);

    for (let i = 0; i < rawData.length; i++) {
      // Check for cancellation before processing each row
      if (this.isCancelled(fileId)) {
        throw new Error('Import cancelled by user');
      }

      try {
        const row = rawData[i];
        console.log(`🔍 Processing row ${i}:`, row);
        const transaction = await this.processRow(row, mapping, categories, subcategories);
        if (transaction) {
          console.log(`✅ Row ${i} created transaction:`, transaction);
          transactions.push(transaction);
        } else {
          console.log(`❌ Row ${i} failed to create transaction`);
        }
      } catch (error) {
        console.warn(`Failed to process row ${i}:`, error);
      }
      
      if (onProgress) {
        onProgress(i + 1);
      }
    }

    console.log(`🔍 processTransactions: Returning ${transactions.length} transactions`);
    return transactions;
  }

  private async processRow(
    row: any, 
    mapping: FileSchemaMapping, 
    categories: Category[], 
    subcategories: Subcategory[]
  ): Promise<Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> | null> {
    try {
      // Extract basic fields
      const date = this.extractDate(row, mapping.dateColumn, mapping.dateFormat);
      const description = this.extractString(row, mapping.descriptionColumn);
      const amount = this.extractAmount(row, mapping.amountColumn);
      const additionalNotes = this.extractString(row, mapping.notesColumn);

      console.log(`🔍 Row extraction - date: ${date}, description: "${description}", amount: ${amount}`);
      console.log(`🔍 Mapping used:`, mapping);

      // TEMPORARY FIX: Override incorrect AI mapping for this CSV format
      if (row.Date && row.Text && row.Amount) {
        console.log(`🔧 Detected object format CSV, overriding mapping...`);
        const correctedDate = this.extractDate(row, 'Date', 'DD.MM.YYYY');
        const correctedDescription = this.extractString(row, 'Text');
        const correctedAmount = this.extractAmount(row, 'Amount');
        
        console.log(`🔧 Corrected extraction - date: ${correctedDate}, description: "${correctedDescription}", amount: ${correctedAmount}`);
        
        if (correctedDate && correctedDescription && correctedAmount !== null) {
          console.log(`✅ Using corrected values`);
          
          // Get AI categorization
          const aiClassification = await this.getAIClassification(
            correctedDescription, 
            correctedAmount, 
            correctedDate.toISOString(), 
            categories, 
            subcategories
          );

          const transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
            date: correctedDate,
            description: correctedDescription,
            additionalNotes,
            category: aiClassification.category,
            subcategory: aiClassification.subcategory,
            amount: correctedAmount,
            account: 'Imported', // Default account for imported transactions
            confidence: aiClassification.confidence,
            reasoning: aiClassification.reasoning,
            type: correctedAmount >= 0 ? 'income' : 'expense',
            isVerified: false,
          };

          return transaction;
        }
      }

      if (!date || !description || amount === null) {
        console.log(`❌ Validation failed - date: ${!!date}, description: ${!!description}, amount: ${amount !== null}`);
        return null; // Skip invalid rows
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
        additionalNotes,
        category: aiClassification.category,
        subcategory: aiClassification.subcategory,
        amount,
        account: 'Imported', // Default account for imported transactions
        confidence: aiClassification.confidence,
        reasoning: aiClassification.reasoning,
        type: amount >= 0 ? 'income' : 'expense',
        isVerified: false,
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
      
      // Handle European format DD.MM.YYYY (like "03.07.2024")
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

      // Try other common formats
      const formats = [
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // MM/DD/YYYY
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD
        /^(\d{1,2})-(\d{1,2})-(\d{4})$/, // DD-MM-YYYY
      ];

      for (const regex of formats) {
        const match = dateStr.match(regex);
        if (match) {
          const [, part1, part2, part3] = match;
          if (regex.source.includes('YYYY')) {
            // Handle MM/DD/YYYY and DD-MM-YYYY
            const month = parseInt(part1) - 1;
            const day = parseInt(part2);
            const year = parseInt(part3);
            date = new Date(year, month, day);
          } else {
            // Handle YYYY-MM-DD
            const year = parseInt(part1);
            const month = parseInt(part2) - 1;
            const day = parseInt(part3);
            date = new Date(year, month, day);
          }
          
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
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
      
      // Handle European number format (e.g., "500.000,00" or "1.234,56")
      // Pattern: numbers with periods as thousands separator and comma as decimal
      if (/^-?[\d.]+,\d+$/.test(valueStr)) {
        const cleanAmount = valueStr
          .replace(/\./g, '') // Remove thousands separators (periods)
          .replace(',', '.'); // Convert decimal separator (comma to period)
        const amount = parseFloat(cleanAmount);
        return isNaN(amount) ? null : amount;
      }
      
      // Handle standard US format and other formats
      const cleanAmount = valueStr
        .replace(/[$,\s]/g, '') // Remove $, commas, spaces
        .replace(/[()]/g, ''); // Remove parentheses
      
      const amount = parseFloat(cleanAmount);
      return isNaN(amount) ? null : amount;
    } catch {
      return null;
    }
  }

  private getColumnValue(row: any, column: string): any {
    if (Array.isArray(row)) {
      // For arrays (CSV without headers), column is an index
      const index = parseInt(column);
      return !isNaN(index) ? row[index] : null;
    } else {
      // For objects (CSV with headers, Excel), column is a property name
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
      console.log(`🤖 Starting AI classification for: "${description}", amount: ${amount}`);
      
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const request: AIClassificationRequest = {
        transactionText: description,
        amount,
        date,
        availableCategories: categories,
        availableSubcategories: subcategories,
      };

      const prompt = `
Classify this transaction into an appropriate category and subcategory.

Transaction details:
- Description: "${description}"
- Amount: ${amount}
- Date: ${date}

Available categories:
${categories.map(c => `- ${c.name} (${c.type}): ${c.description || 'No description'}`).join('\n')}

Available subcategories:
${subcategories.map(s => `- ${s.name}: ${s.description || 'No description'}`).join('\n')}

CLASSIFICATION GUIDELINES:
1. If you can confidently identify the transaction category (confidence >= 0.7), use the most appropriate category from the list
2. If the transaction description is unclear, ambiguous, or doesn't clearly fit any category (confidence < 0.7), use "Uncategorized" 
3. For "Uncategorized" transactions, use subcategory "Miscellaneous" for general unclear transactions or "Pending Review" for transactions that might need human attention
4. Be honest about your confidence level - it's better to mark something as uncategorized than to guess incorrectly

Please return ONLY a clean JSON response without any markdown formatting or code blocks:
{
  "category": "exact category name from the list above",
  "subcategory": "exact subcategory name from the list above (optional)",
  "confidence": 0.85,
  "reasoning": "Brief explanation of why this category was chosen or why it's uncategorized",
  "suggestedVendor": "vendor name if identifiable (optional)",
  "suggestedTags": ["tag1", "tag2"] (optional)
}

Choose the most appropriate category based on the transaction description. Be conservative - use "Uncategorized" when in doubt.`;

      console.log(`🤖 Sending classification request to Azure OpenAI...`);
      const response = await azureOpenAIService.makeRequest(prompt);
      console.log(`🤖 Azure OpenAI response:`, response);
      
      try {
        // Clean the response to handle markdown code blocks
        const cleanedResponse = this.cleanAIResponse(response);
        console.log(`🤖 Cleaned response:`, cleanedResponse);
        
        const aiResponse = JSON.parse(cleanedResponse);
        console.log(`✅ AI classification successful:`, aiResponse);
        
        // Override low-confidence classifications to use 'Uncategorized'
        let finalCategory = aiResponse.category || 'Uncategorized';
        let finalSubcategory = aiResponse.subcategory;
        let finalConfidence = aiResponse.confidence || 0.5;
        let finalReasoning = aiResponse.reasoning || 'AI classification';
        
        // If confidence is below threshold, force to Uncategorized
        const CONFIDENCE_THRESHOLD = 0.7;
        if (finalConfidence < CONFIDENCE_THRESHOLD && finalCategory !== 'Uncategorized') {
          console.log(`🤖 Low confidence (${finalConfidence}) - overriding to Uncategorized`);
          finalCategory = 'Uncategorized';
          finalSubcategory = 'Pending Review';
          finalReasoning = `Low confidence classification (${finalConfidence.toFixed(2)}). Original: ${aiResponse.category}. ${finalReasoning}`;
        }
        
        return {
          category: finalCategory,
          subcategory: finalSubcategory,
          confidence: finalConfidence,
          reasoning: finalReasoning,
          suggestedVendor: aiResponse.suggestedVendor,
          suggestedTags: aiResponse.suggestedTags,
        };
      } catch (parseError) {
        console.error(`❌ Failed to parse AI response:`, parseError, `Raw response:`, response);
        // Fallback if AI response can't be parsed
        return this.getDefaultClassification();
      }
    } catch (error) {
      console.error('❌ AI classification failed:', error);
      return this.getDefaultClassification();
    }
  }

  private cleanAIResponse(response: string): string {
    // Remove markdown code block markers if present
    let cleaned = response.trim();
    
    // Remove opening ```json or ``` markers
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '');
    }
    
    // Remove closing ``` markers
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/\s*```$/, '');
    }
    
    return cleaned.trim();
  }

  private getDefaultClassification(): AIClassificationResponse {
    return {
      category: 'Uncategorized',
      subcategory: 'Miscellaneous',
      confidence: 0.1,
      reasoning: 'AI classification failed, using default category',
    };
  }

  getImportProgress(fileId: string): FileImportProgress | null {
    return this.activeImports.get(fileId) || null;
  }

  clearImportProgress(fileId: string): void {
    this.activeImports.delete(fileId);
  }
}

export const fileProcessingService = new FileProcessingService();
