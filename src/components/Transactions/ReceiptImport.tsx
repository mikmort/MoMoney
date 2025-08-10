import React, { useState, useRef } from 'react';
import styled from 'styled-components';
import { ReceiptProcessingResponse, Transaction } from '../../types';
import { receiptProcessingService } from '../../services/receiptProcessingService';
import { dataService } from '../../services/dataService';
import { useAccountManagement } from '../../hooks/useAccountManagement';

interface ReceiptImportProps {
  onTransactionAdded?: (transaction: Transaction) => void;
  onCancel?: () => void;
}

const ImportContainer = styled.div`
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  max-width: 600px;
  margin: 0 auto;
`;

const Title = styled.h3`
  margin: 0 0 16px 0;
  color: #333;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const FileDropZone = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'isDragOver',
})<{ isDragOver: boolean }>`
  border: 2px dashed ${props => props.isDragOver ? '#0066cc' : '#cccccc'};
  border-radius: 8px;
  padding: 40px 20px;
  text-align: center;
  background: ${props => props.isDragOver ? '#f0f8ff' : '#fafafa'};
  cursor: pointer;
  transition: all 0.3s ease;
  margin-bottom: 16px;

  &:hover {
    border-color: #0066cc;
    background: #f0f8ff;
  }
`;

const FileInput = styled.input`
  display: none;
`;

const DropZoneText = styled.div`
  color: #666;
  font-size: 14px;
  
  .primary {
    font-size: 16px;
    font-weight: 500;
    color: #333;
    margin-bottom: 4px;
  }
`;

const AccountSelect = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  margin-bottom: 16px;
  background: white;
`;

const ProcessingStatus = styled.div`
  padding: 16px;
  background: #f0f8ff;
  border-radius: 6px;
  margin-bottom: 16px;
  text-align: center;
  color: #0066cc;
`;

const TransactionPreview = styled.div`
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  background: #f9f9f9;
`;

const PreviewTitle = styled.h4`
  margin: 0 0 12px 0;
  color: #333;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const PreviewField = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
  
  .label {
    font-weight: 500;
    color: #666;
  }
  
  .value {
    color: #333;
  }
`;

const ConfidenceBar = styled.div<{ confidence: number }>`
  width: 100%;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  overflow: hidden;
  margin: 8px 0;
  
  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${props => props.confidence * 100}%;
    background: ${props => 
      props.confidence > 0.8 ? '#4caf50' : 
      props.confidence > 0.6 ? '#ff9800' : '#f44336'
    };
    transition: width 0.3s ease;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
  
  ${props => props.variant === 'primary' && `
    background: #0066cc;
    color: white;
    &:hover { background: #0052a3; }
  `}
  
  ${props => props.variant === 'secondary' && `
    background: #f0f0f0;
    color: #333;
    &:hover { background: #e0e0e0; }
  `}
  
  ${props => props.variant === 'danger' && `
    background: #f44336;
    color: white;
    &:hover { background: #d32f2f; }
  `}
  
  ${props => !props.variant && `
    background: #f0f0f0;
    color: #333;
    &:hover { background: #e0e0e0; }
  `}
`;

const DuplicateWarning = styled.div`
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
  color: #856404;
  
  .title {
    font-weight: 600;
    margin-bottom: 4px;
  }
`;

export const ReceiptImport: React.FC<ReceiptImportProps> = ({
  onTransactionAdded,
  onCancel
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [processingResult, setProcessingResult] = useState<ReceiptProcessingResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { accounts } = useAccountManagement();

  // Auto-select first account if available
  React.useEffect(() => {
    if (accounts.length > 0 && !selectedAccount) {
      setSelectedAccount(accounts[0].id);
    }
  }, [accounts, selectedAccount]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!selectedAccount) {
      alert('Please select an account first.');
      return;
    }

    // Check file type
    const supportedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!supportedTypes.includes(file.type)) {
      alert('Unsupported file type. Please upload a PDF or image file.');
      return;
    }

    try {
      setProcessing(true);
      setProcessingResult(null);

      console.log('📤 Processing receipt file:', file.name);
      
      const result = await receiptProcessingService.processReceipt({
        file,
        accountId: selectedAccount
      });

      console.log('✅ Receipt processing complete:', result);
      setProcessingResult(result);

    } catch (error) {
      console.error('❌ Receipt processing failed:', error);
      alert('Failed to process receipt. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveTransaction = async () => {
    if (!processingResult) return;

    try {
      // Create final transaction with ID
      const transaction: Transaction = {
        ...processingResult.suggestedTransaction,
        id: `receipt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        addedDate: new Date(),
        lastModifiedDate: new Date()
      };

      // Link file to transaction
      await receiptProcessingService.linkFileToTransaction(
        processingResult.attachedFile.id,
        transaction.id
      );

      // Save transaction
      await dataService.addTransaction(transaction);

      console.log('💾 Receipt transaction saved:', transaction);

      if (onTransactionAdded) {
        onTransactionAdded(transaction);
      }

      // Reset form
      setProcessingResult(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('❌ Failed to save transaction:', error);
      alert('Failed to save transaction. Please try again.');
    }
  };

  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(Math.abs(amount));
  };

  return (
    <ImportContainer>
      <Title>
        🧾 Import Receipt
      </Title>

      {/* Account Selection */}
      <AccountSelect 
        value={selectedAccount}
        onChange={(e) => setSelectedAccount(e.target.value)}
      >
        <option value="">Select Account</option>
        {accounts.map(account => (
          <option key={account.id} value={account.id}>
            {account.name} ({account.type})
          </option>
        ))}
      </AccountSelect>

      {/* File Drop Zone */}
      <FileDropZone
        isDragOver={isDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleFileSelect}
      >
        <DropZoneText>
          <div className="primary">
            {isDragOver ? '📤 Drop your receipt here' : '📁 Drop receipt or click to upload'}
          </div>
          <div>Supports PDF and image files</div>
        </DropZoneText>
      </FileDropZone>

      <FileInput
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handleFileInputChange}
      />

      {/* Processing Status */}
      {processing && (
        <ProcessingStatus>
          🤖 Analyzing receipt with AI...
        </ProcessingStatus>
      )}

      {/* Transaction Preview */}
      {processingResult && (
        <>
          {/* Duplicate Warning */}
          {processingResult.duplicateCheck.hasDuplicates && (
            <DuplicateWarning>
              <div className="title">⚠️ Potential Duplicate Detected</div>
              <div>
                Found {processingResult.duplicateCheck.potentialDuplicates.length} similar transaction(s). 
                Please review before saving.
              </div>
            </DuplicateWarning>
          )}

          <TransactionPreview>
            <PreviewTitle>
              📋 Extracted Transaction Data
            </PreviewTitle>

            <PreviewField>
              <span className="label">Date:</span>
              <span className="value">
                {processingResult.suggestedTransaction.date.toLocaleDateString()}
              </span>
            </PreviewField>

            <PreviewField>
              <span className="label">Amount:</span>
              <span className="value">
                {formatAmount(processingResult.suggestedTransaction.amount)}
              </span>
            </PreviewField>

            <PreviewField>
              <span className="label">Description:</span>
              <span className="value">
                {processingResult.suggestedTransaction.description}
              </span>
            </PreviewField>

            <PreviewField>
              <span className="label">Category:</span>
              <span className="value">
                {processingResult.suggestedTransaction.category}
              </span>
            </PreviewField>

            {processingResult.suggestedTransaction.vendor && (
              <PreviewField>
                <span className="label">Vendor:</span>
                <span className="value">
                  {processingResult.suggestedTransaction.vendor}
                </span>
              </PreviewField>
            )}

            <PreviewField>
              <span className="label">Confidence:</span>
              <span className="value">
                {Math.round(processingResult.confidence * 100)}%
              </span>
            </PreviewField>

            <ConfidenceBar confidence={processingResult.confidence} />

            {processingResult.reasoning && (
              <PreviewField style={{ flexDirection: 'column', gap: '4px' }}>
                <span className="label">AI Analysis:</span>
                <span className="value" style={{ fontSize: '12px', color: '#666' }}>
                  {processingResult.reasoning}
                </span>
              </PreviewField>
            )}
          </TransactionPreview>

          <ButtonGroup>
            <Button onClick={() => setProcessingResult(null)}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleSaveTransaction}
            >
              Save Transaction
            </Button>
          </ButtonGroup>
        </>
      )}

      {/* Action Buttons (when no processing result) */}
      {!processing && !processingResult && onCancel && (
        <ButtonGroup>
          <Button onClick={onCancel}>
            Cancel
          </Button>
        </ButtonGroup>
      )}
    </ImportContainer>
  );
};