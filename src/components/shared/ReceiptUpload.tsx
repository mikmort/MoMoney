import React, { useState, useRef } from 'react';
import styled from 'styled-components';
import { Card, Button, FlexBox } from '../../styles/globalStyles';
import { AttachedFile, Transaction } from '../../types';
import { fileProcessingService } from '../../services/fileProcessingService';
import { AccountSelectionDialog } from '../Transactions/AccountSelectionDialog';
import { AccountDetectionResponse } from '../../services/accountManagementService';
import { useAccountManagement } from '../../hooks/useAccountManagement';
import { dataService } from '../../services/dataService';

interface ReceiptUploadProps {
  onTransactionAdded?: (transactions: Transaction[]) => void;
  onError?: (error: string) => void;
}

const UploadContainer = styled.div`
  margin-bottom: 16px;
`;

const DropZone = styled.div<{ isDragging: boolean; hasFile: boolean }>`
  border: 2px dashed ${props => props.isDragging ? '#2196f3' : props.hasFile ? '#4caf50' : '#ddd'};
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  background-color: ${props => props.isDragging ? '#f3f9ff' : props.hasFile ? '#f8fdf8' : '#fafafa'};
  transition: all 0.3s ease;
  cursor: pointer;

  &:hover {
    border-color: #2196f3;
    background-color: #f3f9ff;
  }

  .upload-icon {
    font-size: 24px;
    margin-bottom: 8px;
    color: ${props => props.isDragging ? '#2196f3' : props.hasFile ? '#4caf50' : '#666'};
  }

  .upload-text {
    font-size: 14px;
    color: #666;
    margin-bottom: 8px;
    
    &.primary {
      font-size: 16px;
      color: #333;
      font-weight: 500;
    }
  }

  .file-types {
    font-size: 12px;
    color: #999;
  }
`;

const FileInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 8px 12px;
  background-color: #f5f5f5;
  border-radius: 4px;
  font-size: 14px;

  .file-icon {
    font-size: 16px;
  }

  .file-details {
    flex: 1;
  }

  .file-size {
    color: #666;
    font-size: 12px;
  }

  .remove-btn {
    color: #f44336;
    cursor: pointer;
    font-size: 16px;
    padding: 4px;
    
    &:hover {
      background-color: #ffebee;
      border-radius: 2px;
    }
  }
`;

const ProcessingStatus = styled.div`
  margin-top: 16px;
  padding: 12px;
  border-radius: 4px;
  font-size: 14px;
  
  &.processing {
    background-color: #fff3cd;
    color: #856404;
    border: 1px solid #ffeaa7;
  }
  
  &.success {
    background-color: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
  }
  
  &.error {
    background-color: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }
`;

const TransactionPreview = styled.div`
  margin-top: 12px;
  padding: 12px;
  background-color: #f9f9f9;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
  
  .preview-title {
    font-weight: 600;
    margin-bottom: 8px;
    color: #333;
  }
  
  .transaction-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #eee;
    
    &:last-child {
      border-bottom: none;
    }
    
    .transaction-info {
      flex: 1;
      
      .description {
        font-weight: 500;
        margin-bottom: 2px;
      }
      
      .details {
        font-size: 12px;
        color: #666;
      }
    }
    
    .amount {
      font-weight: 600;
      color: #f44336;
    }
  }
`;

const ActionButtons = styled(FlexBox)`
  margin-top: 16px;
  gap: 8px;
`;

export const ReceiptUpload: React.FC<ReceiptUploadProps> = ({ onTransactionAdded, onError }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processedData, setProcessedData] = useState<{
    transactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[];
    attachedFile?: AttachedFile;
    needsAccountSelection: boolean;
    accountDetectionResult?: AccountDetectionResponse;
  } | null>(null);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [status, setStatus] = useState<{ type: 'processing' | 'success' | 'error', message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { accounts } = useAccountManagement();

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileSelection = (file: File) => {
    // Validate file type
    const supportedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!supportedTypes.includes(file.type)) {
      const error = 'Unsupported file type. Please upload PDF or image files (JPEG, PNG).';
      setStatus({ type: 'error', message: error });
      onError?.(error);
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      const error = 'File too large. Maximum size is 10MB.';
      setStatus({ type: 'error', message: error });
      onError?.(error);
      return;
    }

    setSelectedFile(file);
    setStatus(null);
    setProcessedData(null);
  };

  const handleProcessReceipt = async () => {
    if (!selectedFile) return;

    setProcessing(true);
    setStatus({ type: 'processing', message: 'Processing receipt...' });

    try {
      const result = await fileProcessingService.processReceiptFile(selectedFile);
      setProcessedData(result);

      if (result.needsAccountSelection) {
        setStatus({ type: 'processing', message: 'Receipt processed. Please select an account.' });
        setShowAccountDialog(true);
      } else {
        setStatus({ type: 'success', message: `Receipt processed successfully! Found ${result.transactions.length} transaction(s).` });
      }
    } catch (error) {
      console.error('Receipt processing failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process receipt';
      setStatus({ type: 'error', message: errorMessage });
      onError?.(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const handleAccountSelected = async (accountId: string) => {
    if (!processedData || !selectedFile) return;

    setShowAccountDialog(false);
    setProcessing(true);
    setStatus({ type: 'processing', message: 'Finalizing transactions...' });

    try {
      // Reprocess with the selected account
      const result = await fileProcessingService.processReceiptFile(selectedFile, accountId);
      
      // Add transactions to the database
      const savedTransactions = await dataService.addTransactions(result.transactions);
      
      setStatus({ type: 'success', message: `Successfully added ${savedTransactions.length} transaction(s)!` });
      onTransactionAdded?.(savedTransactions);
      
      // Reset form
      setSelectedFile(null);
      setProcessedData(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Failed to finalize transactions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save transactions';
      setStatus({ type: 'error', message: errorMessage });
      onError?.(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const handleAccountSelectionCancelled = () => {
    setShowAccountDialog(false);
    setStatus(null);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setProcessedData(null);
    setStatus(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string): string => {
    if (type === 'application/pdf') return '📄';
    if (type.startsWith('image/')) return '🖼️';
    return '📎';
  };

  return (
    <UploadContainer>
      <Card>
        <h3>📄 Upload Receipt</h3>
        
        <DropZone
          isDragging={isDragging}
          hasFile={!!selectedFile}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="upload-icon">
            {selectedFile ? '✅' : isDragging ? '⬆️' : '📎'}
          </div>
          <div className={`upload-text ${selectedFile ? 'primary' : ''}`}>
            {selectedFile ? selectedFile.name : isDragging ? 'Drop receipt here' : 'Drop receipt or click to browse'}
          </div>
          {!selectedFile && (
            <>
              <div className="upload-text">
                Drag and drop your receipt file here, or click to select
              </div>
              <div className="file-types">
                Supports: PDF, JPEG, PNG (max 10MB)
              </div>
            </>
          )}
        </DropZone>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />

        {selectedFile && (
          <FileInfo>
            <span className="file-icon">{getFileIcon(selectedFile.type)}</span>
            <div className="file-details">
              <div>{selectedFile.name}</div>
              <div className="file-size">{formatFileSize(selectedFile.size)}</div>
            </div>
            <span className="remove-btn" onClick={handleRemoveFile}>×</span>
          </FileInfo>
        )}

        {status && (
          <ProcessingStatus className={status.type}>
            {status.message}
          </ProcessingStatus>
        )}

        {processedData && processedData.transactions.length > 0 && (
          <TransactionPreview>
            <div className="preview-title">
              📊 Extracted Transaction{processedData.transactions.length > 1 ? 's' : ''}:
            </div>
            {processedData.transactions.map((transaction, index) => (
              <div key={index} className="transaction-item">
                <div className="transaction-info">
                  <div className="description">{transaction.description}</div>
                  <div className="details">
                    {transaction.date.toLocaleDateString()} • {transaction.category}
                    {transaction.vendor && ` • ${transaction.vendor}`}
                  </div>
                </div>
                <div className="amount">
                  ${Math.abs(transaction.amount).toFixed(2)}
                </div>
              </div>
            ))}
          </TransactionPreview>
        )}

        {selectedFile && !processedData && !processing && (
          <ActionButtons>
            <Button onClick={handleProcessReceipt} disabled={processing}>
              🔍 Process Receipt
            </Button>
            <Button variant="outline" onClick={handleRemoveFile}>
              Remove
            </Button>
          </ActionButtons>
        )}
      </Card>

      {showAccountDialog && processedData && (
        <AccountSelectionDialog
          isOpen={showAccountDialog}
          fileName={selectedFile?.name || 'receipt'}
          onCancel={handleAccountSelectionCancelled}
          onAccountSelect={handleAccountSelected}
          onNewAccount={(account) => {
            // For now, we'll just handle existing accounts
            console.log('New account creation not implemented:', account);
          }}
          accounts={accounts}
          detectionResult={processedData.accountDetectionResult}
        />
      )}
    </UploadContainer>
  );
};