import { AttachedFile, ReceiptProcessingRequest, ReceiptProcessingResponse, Transaction, DuplicateTransaction } from '../types';
import { azureOpenAIService } from './azureOpenAIService';
import { dataService } from './dataService';
import { accountManagementService } from './accountManagementService';
import { defaultCategories } from '../data/defaultCategories';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service for processing individual receipts and invoices
 * Handles file storage, data extraction, and transaction creation
 */
class ReceiptProcessingService {
  private fileStorage = new Map<string, AttachedFile>(); // In-memory storage, will move to IndexedDB

  /**
   * Process a receipt/invoice file and extract transaction data
   */
  async processReceipt(request: ReceiptProcessingRequest): Promise<ReceiptProcessingResponse> {
    try {
      console.log('🧾 Processing receipt:', request.file.name);

      // Step 1: Store the uploaded file
      const attachedFile = await this.storeFile(request.file);
      
      // Step 2: Extract data from the file using AI
      const extractedData = await this.extractReceiptData(attachedFile);
      
      // Step 3: Create suggested transaction
      const suggestedTransaction = await this.createSuggestedTransaction(
        extractedData,
        attachedFile,
        request.accountId
      );

      // Step 4: Check for potential duplicates
      const duplicateCheck = await this.checkForDuplicates(suggestedTransaction);

      return {
        extractedData,
        confidence: extractedData.confidence,
        reasoning: extractedData.reasoning,
        attachedFile,
        suggestedTransaction,
        duplicateCheck
      };

    } catch (error) {
      console.error('❌ Error processing receipt:', error);
      throw new Error(`Failed to process receipt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store uploaded file in browser storage (IndexedDB in future)
   */
  private async storeFile(file: File): Promise<AttachedFile> {
    const fileId = uuidv4();
    const fileData = await this.fileToBase64(file);
    
    const attachedFile: AttachedFile = {
      id: fileId,
      originalName: file.name,
      size: file.size,
      type: this.getFileType(file),
      mimeType: file.type,
      data: fileData,
      uploadDate: new Date()
    };

    // Store in memory for now (TODO: Move to IndexedDB)
    this.fileStorage.set(fileId, attachedFile);
    
    console.log('💾 Stored file:', {
      id: fileId,
      name: file.name,
      size: file.size,
      type: attachedFile.type
    });

    return attachedFile;
  }

  /**
   * Extract transaction data from receipt using AI
   */
  private async extractReceiptData(file: AttachedFile): Promise<{
    date?: Date;
    amount?: number;
    vendor?: string;
    description?: string;
    category?: string;
    location?: string;
    confidence: number;
    reasoning: string;
  }> {
    try {
      let textContent = '';

      if (file.type === 'pdf') {
        textContent = await this.extractPDFText(file);
      } else if (file.type === 'image') {
        // For now, return basic extracted data since OCR is complex
        // In production, this would use Azure Computer Vision OCR
        textContent = `Receipt image: ${file.originalName}`;
      }

      // Create AI prompt for receipt data extraction
      const prompt = `Analyze this receipt/invoice text and extract transaction information.

Receipt content:
${textContent}

Extract the following information and return ONLY a clean JSON response:
{
  "date": "YYYY-MM-DD format or null",
  "amount": "positive number or null", 
  "vendor": "business name or null",
  "description": "transaction description or null",
  "category": "expense category or null",
  "location": "business location or null",
  "confidence": 0.85,
  "reasoning": "Explanation of extraction confidence and decisions"
}

Focus on finding:
- Transaction date (receipt date)
- Total amount (final amount paid)
- Merchant/vendor name
- What was purchased (description)
- Type of expense (category like Food, Gas, Office Supplies, etc.)
- Location if available`;

      console.log('🤖 Sending receipt to AI for analysis...');
      const aiResponse = await azureOpenAIService.makeRequest(prompt);
      
      try {
        const cleanedResponse = this.cleanAIResponse(aiResponse);
        const extracted = JSON.parse(cleanedResponse);
        
        // Parse date if provided
        if (extracted.date) {
          extracted.date = new Date(extracted.date);
        }
        
        // Handle null values from JSON
        if (extracted.amount === null) extracted.amount = undefined;
        if (extracted.vendor === null) extracted.vendor = undefined;
        if (extracted.description === null) extracted.description = undefined;
        if (extracted.category === null) extracted.category = undefined;
        if (extracted.location === null) extracted.location = undefined;

        console.log('✅ AI extraction successful:', extracted);
        return extracted;
      } catch (parseError) {
        console.warn('⚠️ Failed to parse AI response, using defaults:', parseError);
        return this.getDefaultExtractionData(file);
      }

    } catch (error) {
      console.warn('⚠️ AI extraction failed, using defaults:', error);
      return this.getDefaultExtractionData(file);
    }
  }

  /**
   * Extract text from PDF file using browser-compatible approach
   */
  private async extractPDFText(file: AttachedFile): Promise<string> {
    try {
      // Use pdfjs-dist library that's already available and browser-compatible
      const pdfjsLib = require('pdfjs-dist');
      
      // Set worker source
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
      
      // Convert base64 to Uint8Array
      const binaryString = atob(file.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;
      
      let fullText = '';
      
      // Extract text from each page
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
      }
      
      return fullText.trim() || `PDF file: ${file.originalName}`;
    } catch (error) {
      console.warn('PDF text extraction failed:', error);
      return `PDF file: ${file.originalName}`;
    }
  }

  /**
   * Create suggested transaction from extracted data
   */
  private async createSuggestedTransaction(
    extractedData: any,
    attachedFile: AttachedFile,
    accountId?: string
  ): Promise<Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>> {
    
    // Determine account
    const account = accountId ? 
      accountManagementService.getAccount(accountId) : 
      accountManagementService.getAccounts()[0]; // Default to first account

    // Map category name to category ID with improved matching
    let categoryName = extractedData.category || 'Uncategorized';
    
    // First try exact match on category names
    let matchedCategory = defaultCategories.find(cat => 
      cat.name.toLowerCase() === categoryName.toLowerCase()
    );
    
    if (matchedCategory) {
      categoryName = matchedCategory.name;
    } else {
      // Try matching subcategories by name first (more specific)  
      const lowerCategoryName = categoryName.toLowerCase();
      let matchedSubcategory = null;
      
      for (const cat of defaultCategories) {
        const sub = cat.subcategories?.find(sub => 
          sub.name.toLowerCase() === lowerCategoryName ||
          // Handle common variations
          (lowerCategoryName.includes('gas') && lowerCategoryName.includes('fuel') && sub.name.toLowerCase().includes('fuel'))
        );
        if (sub) {
          matchedSubcategory = sub;
          matchedCategory = cat;
          break;
        }
      }
      
      if (matchedSubcategory) {
        // Use subcategory name if it was a direct match
        categoryName = matchedSubcategory.name;
      } else {
        // Try keyword matching with better scoring
        let bestMatch = null;
        let bestScore = 0;
        
        for (const cat of defaultCategories) {
          for (const sub of cat.subcategories || []) {
            if (sub.keywords) {
              const matchCount = sub.keywords.filter(keyword => 
                lowerCategoryName.includes(keyword.toLowerCase())
              ).length;
              
              // Prefer matches with more keywords and from fuel/gas specific context
              let score = matchCount;
              if (sub.name.toLowerCase().includes('fuel') || sub.name.toLowerCase().includes('gas')) {
                score += 2; // Boost transportation gas/fuel matches
              }
              
              if (score > bestScore) {
                bestScore = score;
                bestMatch = cat;
              }
            }
          }
        }
        
        if (bestMatch) {
          categoryName = bestMatch.name;
        } else {
          categoryName = 'Uncategorized';
        }
      }
    }

    const transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
      date: extractedData.date || new Date(),
      amount: Math.abs(extractedData.amount || 0) * -1, // Make it negative for expense
      description: extractedData.description || 
                  extractedData.vendor || 
                  `Receipt from ${attachedFile.originalName}`,
      category: categoryName,
      account: account?.name || 'Unknown Account',
      type: 'expense',
      vendor: extractedData.vendor,
      location: extractedData.location,
      notes: `Imported from receipt: ${attachedFile.originalName}`,
      confidence: extractedData.confidence || 0.5,
      reasoning: extractedData.reasoning || 'Extracted from receipt',
      attachedFileId: attachedFile.id,
      attachedFileName: attachedFile.originalName,
      attachedFileType: attachedFile.type,
      originalText: `Receipt: ${attachedFile.originalName}`,
      isVerified: false
    };

    return transaction;
  }

  /**
   * Check for potential duplicate transactions
   */
  private async checkForDuplicates(
    transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>
  ): Promise<{ potentialDuplicates: DuplicateTransaction[]; hasDuplicates: boolean }> {
    try {
      // Create a temporary transaction with ID for duplicate detection
      const tempTransaction = {
        ...transaction,
        id: 'temp-' + Date.now(),
        addedDate: new Date(),
        lastModifiedDate: new Date()
      };

      const duplicateResult = await dataService.detectDuplicates([tempTransaction]);
      
      return {
        potentialDuplicates: duplicateResult.duplicates,
        hasDuplicates: duplicateResult.duplicates.length > 0
      };
    } catch (error) {
      console.warn('Duplicate detection failed:', error);
      return {
        potentialDuplicates: [],
        hasDuplicates: false
      };
    }
  }

  /**
   * Get attached file by ID
   */
  async getAttachedFile(fileId: string): Promise<AttachedFile | null> {
    return this.fileStorage.get(fileId) || null;
  }

  /**
   * Link file to transaction
   */
  async linkFileToTransaction(fileId: string, transactionId: string): Promise<void> {
    const file = this.fileStorage.get(fileId);
    if (file) {
      file.transactionId = transactionId;
      this.fileStorage.set(fileId, file);
    }
  }

  // Helper methods

  private getFileType(file: File): 'pdf' | 'image' | 'other' {
    if (file.type.startsWith('image/')) {
      return 'image';
    } else if (file.type === 'application/pdf') {
      return 'pdf';
    } else {
      return 'other';
    }
  }

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

  private getDefaultExtractionData(file: AttachedFile) {
    return {
      date: new Date(),
      amount: undefined,
      vendor: undefined,
      description: `Receipt: ${file.originalName}`,
      category: 'Uncategorized',
      location: undefined,
      confidence: 0.1,
      reasoning: 'AI extraction failed, manual review needed'
    };
  }
}

// Singleton instance
export const receiptProcessingService = new ReceiptProcessingService();