import React, { useState, useRef } from 'react';
import styled from 'styled-components';
import { FileImportProgress, Category, Subcategory, Account, DuplicateDetectionResult, Transaction, FileImportItem, MultiFileImportProgress } from '../../types';
import { fileProcessingService } from '../../services/fileProcessingService';
import { defaultCategories } from '../../data/defaultCategories';
import { useAccountManagement } from '../../hooks/useAccountManagement';
import { useImportState } from '../../contexts/ImportStateContext';
import { AccountSelectionDialog } from './AccountSelectionDialog';
import { DuplicateTransactionsDialog } from './DuplicateTransactionsDialog';
import { AccountDetectionResponse } from '../../services/accountManagementService';

const ImportContainer = styled.div`
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 16px;
`;

const ImportButton = styled.button`
  background: #0066cc;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  margin-top: 8px;

  &:hover {
    background: #0052a3;
  }

  &:disabled {
    background: #cccccc;
    cursor: not-allowed;
  }
`;

const StopButton = styled.button`
  background: #f44336;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  margin-right: 12px;

  &:hover {
    background: #d32f2f;
  }

  &:disabled {
    background: #cccccc;
    cursor: not-allowed;
  }
`;

const FileInput = styled.input`
  display: none;
`;

const FileDropZone = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'isDragOver',
})<{ isDragOver: boolean }>`
  border: 2px dashed ${props => props.isDragOver ? '#0066cc' : '#cccccc'};
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  margin: 12px 0;
  background: ${props => props.isDragOver ? '#f0f8ff' : '#fafafa'};
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    border-color: #0066cc;
    background: #f0f8ff;
  }
`;

const ProgressContainer = styled.div`
  margin-top: 20px;
  padding: 16px;
  background: #f5f5f5;
  border-radius: 6px;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin: 8px 0;
`;

const ProgressFill = styled.div<{ width: number }>`
  height: 100%;
  background: #0066cc;
  width: ${props => props.width}%;
  transition: width 0.3s ease;
`;

const ErrorList = styled.ul`
  color: #f44336;
  background: #ffeaea;
  padding: 12px;
  border-radius: 4px;
  margin-top: 8px;
`;

const SupportedFormats = styled.div`
  margin-top: 6px;
  font-size: 12px;
  color: #666;
`;

const CloseErrorButton = styled.button`
  background: none;
  border: none;
  color: #f44336;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 16px;
  border-radius: 4px;
  margin-left: 8px;
  
  &:hover {
    background-color: rgba(244, 67, 54, 0.1);
  }
  
  &:focus {
    outline: 2px solid rgba(244, 67, 54, 0.3);
  }
`;

interface FileImportProps {
  onImportComplete: (transactions: number) => void;
}

export const FileImport: React.FC<FileImportProps> = ({ onImportComplete }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [multiFileProgress, setMultiFileProgress] = useState<MultiFileImportProgress | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileImportItems, setFileImportItems] = useState<FileImportItem[]>([]);
  const [showAccountSelection, setShowAccountSelection] = useState(false);
  const [currentAccountSelectionItem, setCurrentAccountSelectionItem] = useState<FileImportItem | null>(null);
  
  // Track active file IDs for cancellation support
  const [activeFileIds, setActiveFileIds] = useState<Set<string>>(new Set());
  const [isCancelling, setIsCancelling] = useState(false);
  
  // Legacy single-file state - keep for backwards compatibility with existing dialogs
  const [progress, setProgress] = useState<FileImportProgress | null>(null);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [accountDetectionResult, setAccountDetectionResult] = useState<AccountDetectionResponse | null>(null);
  
  // Duplicate detection state
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateDetectionResult, setDuplicateDetectionResult] = useState<DuplicateDetectionResult | null>(null);
  const [pendingTransactions, setPendingTransactions] = useState<Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[]>([]);
  
  // Error dismissal state
  const [dismissedMultiFileErrors, setDismissedMultiFileErrors] = useState(false);
  const [dismissedSingleFileErrors, setDismissedSingleFileErrors] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get global import state
  const { setIsImporting: setGlobalImportState } = useImportState();

  // Account management hook
  const { accounts, detectAccount, addAccount } = useAccountManagement();

  // Get categories and subcategories
  const categories: Category[] = defaultCategories;
  const subcategories: Subcategory[] = categories.flatMap(c => c.subcategories);

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    console.log(`📁 Selected ${files.length} file(s) for import`);
    
    // Convert FileList to array and process each file
    const fileArray = Array.from(files);
    processMultipleFiles(fileArray);
  };

  const processMultipleFiles = async (files: File[]) => {
    try {
      // Create FileImportItem for each file
      const importItems: FileImportItem[] = [];
      
      for (const file of files) {
        const fileId = `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`🔍 Processing file: ${file.name}`);
        
        // Try to detect account for each file
        const detectionRequest = {
          fileName: file.name,
        };

        try {
          const detectionResult = await detectAccount(detectionRequest);
          
          const CONFIDENCE_THRESHOLD = 0.95;
          
          // For multi-file uploads, always require account selection regardless of confidence
          const isMultiFileUpload = files.length > 1;
          const shouldAutoAssign = !isMultiFileUpload && detectionResult.detectedAccountId && detectionResult.confidence >= CONFIDENCE_THRESHOLD;
          
          const item: FileImportItem = {
            fileId,
            file,
            needsAccountSelection: !shouldAutoAssign,
            accountDetectionResult: {
              detectedAccountId: detectionResult.detectedAccountId,
              confidence: detectionResult.confidence,
              reasoning: detectionResult.reasoning,
              suggestedAccounts: detectionResult.suggestedAccounts || []
            },
            accountId: shouldAutoAssign ? detectionResult.detectedAccountId : undefined
          };
          
          importItems.push(item);
        } catch (error) {
          console.error(`Account detection failed for ${file.name}:`, error);
          // Fallback - require manual account selection
          const item: FileImportItem = {
            fileId,
            file,
            needsAccountSelection: true,
            accountDetectionResult: undefined,
            accountId: undefined
          };
          
          importItems.push(item);
        }
      }
      
      setFileImportItems(importItems);
      
      // Check if any files need account selection
      const filesNeedingAccounts = importItems.filter(item => item.needsAccountSelection);
      
      if (filesNeedingAccounts.length > 0) {
        console.log(`⚠️ ${filesNeedingAccounts.length} file(s) need account selection`);
        // Show account selection for the first file that needs it
        setCurrentAccountSelectionItem(filesNeedingAccounts[0]);
        setShowAccountSelection(true);
        // Clear the input so selecting the same files again triggers onChange
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        // All files have high-confidence account detection, start processing all
        console.log(`✅ All ${importItems.length} file(s) have high-confidence account detection`);
        await startMultiFileProcessing(importItems);
      }
      
    } catch (error) {
      console.error('Error processing multiple files:', error);
      // Clear the input so selecting the same files again triggers onChange
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startMultiFileProcessing = async (items: FileImportItem[]) => {
    setIsImporting(true);
    setIsCancelling(false);
    setGlobalImportState(true, `${items.length} files`);
    
    const filesMap = new Map<string, FileImportProgress>();
    items.forEach(item => {
      const account = item.accountId ? accounts.find(acc => acc.id === item.accountId) : null;
      filesMap.set(item.fileId, {
        fileId: item.fileId,
        status: 'pending',
        progress: 0,
        currentStep: 'Initializing...',
        processedRows: 0,
        totalRows: 0,
        errors: [],
        fileName: item.file.name,
        accountId: item.accountId,
        accountName: account?.name
      });
    });

    const multiProgress: MultiFileImportProgress = {
      files: filesMap,
      totalFiles: items.length,
      completedFiles: 0,
      failedFiles: 0,
      overallStatus: 'processing'
    };
    
    setMultiFileProgress(multiProgress);
    
    let totalTransactions = 0;
    
    try {
      // Process files in parallel (but limit concurrency to avoid overwhelming)
      const MAX_CONCURRENT = 3;
      const results = [];
      
      for (let i = 0; i < items.length; i += MAX_CONCURRENT) {
        // Check for cancellation before processing each batch
        if (isCancelling) {
          console.log('🛑 Multi-file processing cancelled before batch processing');
          throw new Error('Import cancelled by user');
        }
        
        const batch = items.slice(i, i + MAX_CONCURRENT);
        const batchPromises = batch.map(item => processFileItem(item, multiProgress));
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
      }
      
      // Count successful imports
      let completedFiles = 0;
      let failedFiles = 0;
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          totalTransactions += result.value;
          completedFiles++;
        } else {
          console.error(`Failed to process file ${items[index].file.name}:`, result.reason);
          failedFiles++;
        }
      });
      
      // Update final status
      multiProgress.completedFiles = completedFiles;
      multiProgress.failedFiles = failedFiles;
      multiProgress.overallStatus = failedFiles > 0 
        ? (completedFiles > 0 ? 'partial' : 'error')
        : 'completed';
      
      setMultiFileProgress({...multiProgress});
      
      console.log(`🎉 Multi-file import completed: ${completedFiles} successful, ${failedFiles} failed, ${totalTransactions} total transactions`);
      
      if (!isCancelling) {
        onImportComplete(totalTransactions);
      }
      
    } catch (error) {
      console.error('Multi-file processing error:', error);
      
      // Update progress to reflect cancellation or error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('cancelled')) {
        multiProgress.overallStatus = 'error';
        // Mark all pending files as cancelled
        multiProgress.files.forEach((fileProgress, fileId) => {
          if (fileProgress.status === 'pending' || fileProgress.status === 'processing') {
            fileProgress.status = 'error';
            fileProgress.currentStep = 'Import cancelled by user';
            fileProgress.errors.push('Import cancelled by user');
          }
        });
        setMultiFileProgress({...multiProgress});
      }
    } finally {
      // Clean up state - but preserve errors unless dismissed
      const hasErrors = multiProgress.overallStatus === 'error' || multiProgress.overallStatus === 'partial';
      
      if (!hasErrors || dismissedMultiFileErrors) {
        // Clear progress after delay if no errors or errors were dismissed
        setTimeout(() => {
          setMultiFileProgress(null);
          setIsImporting(false);
          setIsCancelling(false);
          setGlobalImportState(false);
          setFileImportItems([]);
          setActiveFileIds(new Set());
          setDismissedMultiFileErrors(false); // Reset dismissal state
        }, isCancelling ? 1000 : 3000); // Shorter delay if cancelled
      } else {
        // Keep progress visible with errors, but clean up other states
        setIsImporting(false);
        setIsCancelling(false);
        setGlobalImportState(false);
        setFileImportItems([]);
        setActiveFileIds(new Set());
        
        // Log errors to console as requested
        console.log('🔴 Import completed with errors:');
        multiProgress.files.forEach((fileProgress, fileId) => {
          if (fileProgress.errors.length > 0) {
            console.error(`  ${fileProgress.fileName || fileId}:`, fileProgress.errors);
          }
        });
      }
    }
  };

  const processFileItem = async (item: FileImportItem, multiProgress: MultiFileImportProgress): Promise<number> => {
    if (!item.accountId) {
      throw new Error(`No account ID for file ${item.file.name}`);
    }
    
    const fileProgress = multiProgress.files.get(item.fileId);
    if (!fileProgress) {
      throw new Error(`No progress tracking for file ${item.file.name}`);
    }

    try {
      // Check for cancellation before starting
      if (isCancelling) {
        throw new Error('Import cancelled by user');
      }
      
      const result = await fileProcessingService.processFile(
        item.file,
        categories,
        subcategories,
        item.accountId,
        (progress) => {
          // Check for cancellation during progress updates
          if (isCancelling) {
            return; // Don't update progress if cancelled
          }
          
          // Update individual file progress
          const updatedProgress = { ...progress, fileName: item.file.name };
          multiProgress.files.set(item.fileId, updatedProgress);
          setMultiFileProgress({...multiProgress});
        },
        (fileId) => {
          // Track the generated file ID for cancellation
          setActiveFileIds(prev => new Set(prev).add(fileId));
          console.log(`📋 File processing started for ${item.file.name} with ID: ${fileId}`);
        }
      );

      // Remove file ID from active tracking when completed
      setActiveFileIds(prev => {
        const updated = new Set(prev);
        updated.delete(result.fileId);
        return updated;
      });

      if (result.statementFile.status === 'completed') {
        // File completed successfully
        fileProgress.status = 'completed';
        fileProgress.progress = 100;
        fileProgress.currentStep = 'Import completed successfully!';
        multiProgress.files.set(item.fileId, fileProgress);
        
        return result.statementFile.transactionCount || 0;
      } else {
        // File had issues (e.g., needs duplicate resolution)
        fileProgress.status = 'error';
        fileProgress.errors.push('File processing incomplete - may need duplicate resolution');
        multiProgress.files.set(item.fileId, fileProgress);
        return 0;
      }
    } catch (error) {
      // Remove file ID from active tracking on error
      setActiveFileIds(prev => {
        const updated = new Set(prev);
        // We might not have the final fileId yet, so remove the item fileId
        updated.delete(item.fileId);
        return updated;
      });
      
      fileProgress.status = 'error';
      fileProgress.errors.push(error instanceof Error ? error.message : 'Unknown error');
      multiProgress.files.set(item.fileId, fileProgress);
      throw error;
    }
  };

  // Keep original processFile function for backward compatibility with account selection
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const processFile = async (file: File) => {
    try {
      // First, try to detect the account
      const detectionRequest = {
        fileName: file.name,
        // We could add sample content here if needed
      };

      const detectionResult = await detectAccount(detectionRequest);
      setAccountDetectionResult(detectionResult);

      // If detection confidence is very high, proceed directly (95% confidence)
      const CONFIDENCE_THRESHOLD = 0.95;
      if (detectionResult.detectedAccountId && detectionResult.confidence >= CONFIDENCE_THRESHOLD) {
        await startFileProcessing(file, detectionResult.detectedAccountId);
      } else {
        // Show account selection dialog
        setPendingFile(file);
        setShowAccountSelection(true);
        // Clear the input so selecting the same file again triggers onChange
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Account detection failed:', error);
      // Fallback to showing account selection
      setPendingFile(file);
      setShowAccountSelection(true);
      // Clear the input so selecting the same file again triggers onChange
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startFileProcessing = async (file: File, accountId: string) => {
    setIsImporting(true);
    setGlobalImportState(true, file.name);
    setProgress(null);
    setCurrentFileId(null);

    try {
      const result = await fileProcessingService.processFile(
        file,
        categories,
        subcategories,
        accountId, // Pass the selected account ID
        (progress) => {
          setProgress(progress);
        },
        (fileId) => {
          // Store the fileId immediately when it's generated so we can cancel if needed
          setCurrentFileId(fileId);
        }
      );

      setCurrentFileId(result.fileId);

      if (result.statementFile.status === 'completed') {
        onImportComplete(result.statementFile.transactionCount || 0);
        setTimeout(() => {
          setProgress(null);
          setIsImporting(false);
          setGlobalImportState(false);
          setCurrentFileId(null);
          setDismissedSingleFileErrors(false); // Reset dismissal state
        }, 2000);
      } else if (result.needsDuplicateResolution && result.duplicateDetection) {
        // Handle duplicate detection
        setDuplicateDetectionResult(result.duplicateDetection);
        setPendingTransactions(result.duplicateDetection.duplicates.map(d => d.newTransaction).concat(result.duplicateDetection.uniqueTransactions));
        setShowDuplicateDialog(true);
        setIsImporting(false);
        setGlobalImportState(false);
      } else {
        setIsImporting(false);
        setGlobalImportState(false);
        setCurrentFileId(null);
      }
    } catch (error) {
      console.error('File import failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      setIsImporting(false);
      setGlobalImportState(false);
      setCurrentFileId(null);
      
      // Check if this was a cancellation
      if (errorMessage.includes('cancelled')) {
        console.log('📋 Import was cancelled by user');
        // Progress is already set by handleStopImport, don't override it
      } else {
        const errorProgress = {
          fileId: '',
          status: 'error' as const,
          progress: 0,
          currentStep: 'Import failed',
          processedRows: 0,
          totalRows: 0,
          errors: [errorMessage],
        };
        setProgress(errorProgress);
        
        // Log error to console as requested
        console.log('🔴 Import failed with error:');
        console.error(`  ${errorMessage}`);
        
        // Don't auto-clear error progress unless dismissed
        if (!dismissedSingleFileErrors) {
          // Keep error visible until manually dismissed
        }
      }
    } finally {
      // Ensure input is cleared after processing completes or fails
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAccountSelection = async (accountId: string, isNewAccount?: boolean, newAccountData?: Omit<Account, 'id'>) => {
    let finalAccountId = accountId;
    
    // If creating a new account, add it first
    if (isNewAccount && newAccountData) {
      try {
        const newAccount = await addAccount(newAccountData);
        finalAccountId = newAccount.id;
      } catch (error) {
        console.error('Failed to create new account:', error);
        return;
      }
    }

    // Handle multi-file or single-file account selection
    if (currentAccountSelectionItem) {
      // Multi-file mode: assign account to current file and continue with others
      currentAccountSelectionItem.accountId = finalAccountId;
      currentAccountSelectionItem.needsAccountSelection = false;
      
      // Update the file import items
      const updatedItems = fileImportItems.map(item => 
        item.fileId === currentAccountSelectionItem.fileId ? currentAccountSelectionItem : item
      );
      setFileImportItems(updatedItems);
      
      // Check if there are more files needing accounts
      const nextFileNeedingAccount = updatedItems.find(item => item.needsAccountSelection);
      
      if (nextFileNeedingAccount) {
        // Show account selection for next file
        setCurrentAccountSelectionItem(nextFileNeedingAccount);
        // Keep dialog open
      } else {
        // All files have accounts assigned, start processing
        setShowAccountSelection(false);
        setCurrentAccountSelectionItem(null);
        await startMultiFileProcessing(updatedItems);
      }
      
    } else if (pendingFile) {
      // Legacy single-file mode
      setShowAccountSelection(false);
      await startFileProcessing(pendingFile, finalAccountId);
      setPendingFile(null);
    }
    
    setAccountDetectionResult(null);
  };

  const handleCancelAccountSelection = () => {
    setShowAccountSelection(false);
    
    if (currentAccountSelectionItem) {
      // Multi-file mode: cancel the entire import
      setCurrentAccountSelectionItem(null);
      setFileImportItems([]);
    } else {
      // Legacy single-file mode
      setPendingFile(null);
    }
    
    setAccountDetectionResult(null);
    // Allow choosing the same file(s) again after cancel
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleStopImport = () => {
    console.log('🛑 User requested to stop import');
    setIsCancelling(true);
    
    // Handle multi-file import cancellation
    if (multiFileProgress && activeFileIds.size > 0) {
      console.log(`🛑 Cancelling multi-file import with ${activeFileIds.size} active files`);
      
      // Cancel all active file imports
      activeFileIds.forEach(fileId => {
        fileProcessingService.cancelImport(fileId);
      });
      
      // Update multi-file progress to show cancellation
      if (multiFileProgress) {
        multiFileProgress.files.forEach((fileProgress, fileId) => {
          if (fileProgress.status === 'pending' || fileProgress.status === 'processing') {
            fileProgress.status = 'error';
            fileProgress.currentStep = 'Import cancelled by user';
            fileProgress.errors.push('Import cancelled by user');
          }
        });
        multiFileProgress.overallStatus = 'error';
        setMultiFileProgress({...multiFileProgress});
      }
    }
    
    // Handle legacy single-file import cancellation
    if (currentFileId && isImporting) {
      console.log(`🛑 Cancelling single-file import for file: ${currentFileId}`);
      fileProcessingService.cancelImport(currentFileId);
      setCurrentFileId(null);
      setProgress({
        fileId: currentFileId,
        status: 'error',
        progress: progress?.progress || 0,
        currentStep: 'Import cancelled by user',
        processedRows: progress?.processedRows || 0,
        totalRows: progress?.totalRows || 0,
        errors: ['Import cancelled by user'],
      });
    }
    
    // Always clean up UI state
    setIsImporting(false);
    setGlobalImportState(false);
    
    // If neither multi-file nor single-file import was active, log warning
    if (!multiFileProgress && !currentFileId) {
      console.log('⚠️ Cannot stop import: no active import found');
    }
    
    // Clear input to allow re-selecting the same file
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportDuplicates = async () => {
    if (!currentFileId || !duplicateDetectionResult) return;
    
    setShowDuplicateDialog(false);
    setIsImporting(true);
    setGlobalImportState(true, pendingFile?.name);
    
    try {
      await fileProcessingService.resolveDuplicates(currentFileId, true, pendingTransactions, duplicateDetectionResult);
      onImportComplete(pendingTransactions.length);
      
      // Clear states
      setDuplicateDetectionResult(null);
      setPendingTransactions([]);
      
      setTimeout(() => {
        setProgress(null);
        setIsImporting(false);
        setGlobalImportState(false);
        setCurrentFileId(null);
        setDismissedSingleFileErrors(false); // Reset dismissal state
      }, 2000);
    } catch (error) {
      console.error('Failed to import duplicates:', error);
      setIsImporting(false);
      setGlobalImportState(false);
    }
  };

  const handleIgnoreDuplicates = async () => {
    if (!currentFileId || !duplicateDetectionResult) return;
    
    setShowDuplicateDialog(false);
    setIsImporting(true);
    setGlobalImportState(true, pendingFile?.name);
    
    try {
      await fileProcessingService.resolveDuplicates(currentFileId, false, pendingTransactions, duplicateDetectionResult);
      onImportComplete(duplicateDetectionResult.uniqueTransactions.length);
      
      // Clear states
      setDuplicateDetectionResult(null);
      setPendingTransactions([]);
      
      setTimeout(() => {
        setProgress(null);
        setIsImporting(false);
        setGlobalImportState(false);
        setCurrentFileId(null);
        setDismissedSingleFileErrors(false); // Reset dismissal state
      }, 2000);
    } catch (error) {
      console.error('Failed to ignore duplicates:', error);
      setIsImporting(false);
      setGlobalImportState(false);
    }
  };

  const handleDismissMultiFileErrors = () => {
    console.log('🗑️ User dismissed multi-file import errors');
    setDismissedMultiFileErrors(true);
    setMultiFileProgress(null);
  };

  const handleDismissSingleFileErrors = () => {
    console.log('🗑️ User dismissed single-file import errors');
    setDismissedSingleFileErrors(true);
    setProgress(null);
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    // Prevent bubbling to the drop zone which also has an onClick handler
    e.stopPropagation();
    // Always reset the input value before opening the dialog so selecting the same file fires onChange
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    handleFileSelect(files);
  };

  const getSupportedFormats = () => {
    return '.csv,.xlsx,.xls,.ofx,.pdf';
  };

  return (
    <ImportContainer>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem' }}>📁 Import Transactions</h3>
      
      <FileDropZone
        isDragOver={isDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleButtonClick}
      >
        <div>
          <strong style={{ fontSize: '15px' }}>Drop your files here or click to browse</strong>
          <br />
          <span style={{ fontSize: '13px' }}>Upload bank statements, credit card statements, or transaction files (supports multiple files)</span>
          
          <div style={{ marginTop: '12px' }}>
            <ImportButton 
              onClick={handleButtonClick}
              disabled={isImporting}
            >
              {isImporting ? 'Processing...' : 'Choose Files'}
            </ImportButton>
            
            <SupportedFormats>
              <strong>Supported formats:</strong> CSV, Excel (.xlsx, .xls), OFX, PDF
            </SupportedFormats>
          </div>
        </div>
      </FileDropZone>

      {isImporting && (
        <div style={{ marginTop: '12px' }}>
          <StopButton 
            onClick={handleStopImport}
            disabled={isCancelling}
            title={isCancelling ? "Stopping import..." : "Cancel the current import"}
          >
            {isCancelling ? '⏳ Stopping...' : '🛑 Stop Import'}
          </StopButton>
        </div>
      )}

      <FileInput
        ref={fileInputRef}
        type="file"
        accept={getSupportedFormats()}
        multiple={true}
        onChange={(e) => handleFileSelect(e.target.files)}
        disabled={isImporting}
      />

      {multiFileProgress && !dismissedMultiFileErrors && (
        <ProgressContainer>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <strong>Processing {multiFileProgress.totalFiles} Files</strong>
            <span>{multiFileProgress.completedFiles}/{multiFileProgress.totalFiles} completed</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Array.from(multiFileProgress.files.entries()).map(([fileId, fileProgress]) => (
              <div key={fileId} style={{ 
                border: '1px solid #e0e0e0', 
                borderRadius: '4px', 
                padding: '8px',
                backgroundColor: '#f9f9f9'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
                      {fileProgress.fileName || `File ${fileId.slice(-8)}`}
                    </div>
                    {fileProgress.accountName && (
                      <div style={{ fontSize: '0.8rem', color: '#666' }}>
                        → {fileProgress.accountName}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem' }}>
                    {Math.round(fileProgress.progress)}%
                  </div>
                </div>
                
                <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>
                  {fileProgress.currentStep}
                </div>
                
                <ProgressBar>
                  <ProgressFill width={fileProgress.progress} />
                </ProgressBar>
                
                {fileProgress.status === 'completed' && (
                  <div style={{ color: '#4caf50', fontSize: '0.8rem', marginTop: '4px' }}>
                    ✅ Completed
                  </div>
                )}
                
                {fileProgress.status === 'error' && (
                  <div style={{ color: '#f44336', fontSize: '0.8rem', marginTop: '4px' }}>
                    ❌ Failed
                  </div>
                )}
                
                {fileProgress.errors.length > 0 && (
                  <details style={{ marginTop: '4px' }}>
                    <summary style={{ cursor: 'pointer', color: '#f44336', fontSize: '0.8rem' }}>
                      {fileProgress.errors.length} error(s)
                    </summary>
                    <div style={{ marginTop: '4px' }}>
                      {fileProgress.errors.map((error, index) => (
                        <div key={index} style={{ fontSize: '0.8rem', color: '#f44336' }}>• {error}</div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
          
          {multiFileProgress.overallStatus === 'completed' && (
            <div style={{ color: '#4caf50', fontWeight: 'bold', marginTop: '16px' }}>
              🎉 All files processed successfully!
            </div>
          )}
          
          {multiFileProgress.overallStatus === 'partial' && (
            <div style={{ color: '#ff9800', fontWeight: 'bold', marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚠️ Some files completed, some failed ({multiFileProgress.completedFiles} successful, {multiFileProgress.failedFiles} failed)</span>
              <CloseErrorButton 
                onClick={handleDismissMultiFileErrors}
                title="Dismiss errors"
              >
                ×
              </CloseErrorButton>
            </div>
          )}
          
          {multiFileProgress.overallStatus === 'error' && (
            <div style={{ color: '#f44336', fontWeight: 'bold', marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>❌ All files failed to process</span>
              <CloseErrorButton 
                onClick={handleDismissMultiFileErrors}
                title="Dismiss errors"
              >
                ×
              </CloseErrorButton>
            </div>
          )}
        </ProgressContainer>
      )}

      {progress && !dismissedSingleFileErrors && (
        <ProgressContainer>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{progress.currentStep}</strong>
            <span>{Math.round(progress.progress)}%</span>
          </div>
          
          <ProgressBar>
            <ProgressFill width={progress.progress} />
          </ProgressBar>

          {progress.totalRows > 0 && null}

          {progress.status === 'completed' && (
            <div style={{ color: '#4caf50', fontWeight: 'bold', marginTop: '8px' }}>
              ✅ Import completed successfully!
            </div>
          )}

          {progress.status === 'error' && (
            <div style={{ color: '#f44336', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>❌ Import failed</span>
              <CloseErrorButton 
                onClick={handleDismissSingleFileErrors}
                title="Dismiss error"
              >
                ×
              </CloseErrorButton>
            </div>
          )}

          {progress.errors.length > 0 && (
            <details style={{ marginTop: '8px' }}>
              <summary style={{ cursor: 'pointer', color: '#f44336' }}>
                {progress.errors.length} error(s) occurred
              </summary>
              <ErrorList>
                {progress.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ErrorList>
            </details>
          )}
        </ProgressContainer>
      )}

      {/* Account Selection Dialog - Updated for multi-file support */}
      {showAccountSelection && (currentAccountSelectionItem || pendingFile) && (
        <AccountSelectionDialog
          isOpen={showAccountSelection}
          fileName={(currentAccountSelectionItem?.file?.name) || (pendingFile?.name) || 'Unknown File'}
          detectionResult={currentAccountSelectionItem?.accountDetectionResult || accountDetectionResult || undefined}
          accounts={accounts}
          onAccountSelect={(accountId) => handleAccountSelection(accountId)}
          onNewAccount={(newAccountData) => handleAccountSelection('new', true, newAccountData)}
          onCancel={handleCancelAccountSelection}
          multiFileContext={currentAccountSelectionItem ? {
            currentFileIndex: fileImportItems.findIndex(item => item.fileId === currentAccountSelectionItem.fileId) + 1,
            totalFiles: fileImportItems.length,
            filesNeedingAccounts: fileImportItems.filter(item => item.needsAccountSelection).length
          } : undefined}
        />
      )}

      {/* Duplicate Transactions Dialog */}
      {showDuplicateDialog && duplicateDetectionResult && (
        <DuplicateTransactionsDialog
          duplicates={duplicateDetectionResult.duplicates}
          onImportAnyway={handleImportDuplicates}
          onIgnoreDuplicates={handleIgnoreDuplicates}
        />
      )}
    </ImportContainer>
  );
};
