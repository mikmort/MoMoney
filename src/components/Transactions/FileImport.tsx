import React, { useState, useRef } from 'react';
import styled from 'styled-components';
import { FileImportProgress, Category, Subcategory } from '../../types';
import { fileProcessingService } from '../../services/fileProcessingService';
import { defaultCategories } from '../../data/defaultCategories';

const ImportContainer = styled.div`
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
`;

const ImportButton = styled.button`
  background: #0066cc;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  margin-right: 12px;

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
  padding: 40px;
  text-align: center;
  margin: 16px 0;
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
  margin-top: 12px;
  font-size: 14px;
  color: #666;
`;

interface FileImportProps {
  onImportComplete: (transactions: number) => void;
}

export const FileImport: React.FC<FileImportProps> = ({ onImportComplete }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<FileImportProgress | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get categories and subcategories
  const categories: Category[] = defaultCategories;
  const subcategories: Subcategory[] = categories.flatMap(c => c.subcategories);

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    processFile(file);
  };

  const processFile = async (file: File) => {
    setIsImporting(true);
    setProgress(null);
    setCurrentFileId(null);

    try {
      const result = await fileProcessingService.processFile(
        file,
        categories,
        subcategories,
        (progress) => {
          setProgress(progress);
        }
      );

      setCurrentFileId(result.fileId);

      if (result.statementFile.status === 'completed') {
        onImportComplete(result.statementFile.transactionCount || 0);
        setTimeout(() => {
          setProgress(null);
          setIsImporting(false);
          setCurrentFileId(null);
        }, 2000);
      } else {
        setIsImporting(false);
        setCurrentFileId(null);
      }
    } catch (error) {
      console.error('File import failed:', error);
      setIsImporting(false);
      setCurrentFileId(null);
      setProgress({
        fileId: '',
        status: 'error',
        progress: 0,
        currentStep: 'Import failed',
        processedRows: 0,
        totalRows: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });
    }
  };

  const handleStopImport = () => {
    if (currentFileId && isImporting) {
      fileProcessingService.cancelImport(currentFileId);
      setIsImporting(false);
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
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
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
      <h3>📁 Import Transactions</h3>
      
      <FileDropZone
        isDragOver={isDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleButtonClick}
      >
        <div>
          <strong>Drop your file here or click to browse</strong>
          <br />
          <span>Upload bank statements, credit card statements, or transaction files</span>
        </div>
      </FileDropZone>

      <div>
        <ImportButton 
          onClick={handleButtonClick}
          disabled={isImporting}
        >
          {isImporting ? 'Processing...' : 'Choose File'}
        </ImportButton>

        {isImporting && currentFileId && (
          <StopButton 
            onClick={handleStopImport}
            title="Cancel the current import"
          >
            🛑 Stop Import
          </StopButton>
        )}
        
        <SupportedFormats>
          <strong>Supported formats:</strong> CSV, Excel (.xlsx, .xls), OFX, PDF
        </SupportedFormats>
      </div>

      <FileInput
        ref={fileInputRef}
        type="file"
        accept={getSupportedFormats()}
        onChange={(e) => handleFileSelect(e.target.files)}
        disabled={isImporting}
      />

      {progress && (
        <ProgressContainer>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{progress.currentStep}</strong>
            <span>{Math.round(progress.progress)}%</span>
          </div>
          
          <ProgressBar>
            <ProgressFill width={progress.progress} />
          </ProgressBar>

          {progress.totalRows > 0 && (
            <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>
              Processed {progress.processedRows} of {progress.totalRows} transactions
            </div>
          )}

          {progress.status === 'completed' && (
            <div style={{ color: '#4caf50', fontWeight: 'bold', marginTop: '8px' }}>
              ✅ Import completed successfully!
            </div>
          )}

          {progress.status === 'error' && (
            <div style={{ color: '#f44336', marginTop: '8px' }}>
              ❌ Import failed
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
    </ImportContainer>
  );
};
