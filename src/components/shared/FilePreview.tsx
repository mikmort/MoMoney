import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { AttachedFile } from '../../types';
import { fileStorageService } from '../../services/fileStorageService';
import { Button } from '../../styles/globalStyles';

interface FilePreviewProps {
  file: AttachedFile;
  isOpen: boolean;
  onClose: () => void;
}

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  overflow: hidden;
  position: relative;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
`;

const PreviewContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 70vh;
  max-height: 600px;
`;

const PreviewHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
  background-color: #f9f9f9;
`;

const FileInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  
  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  
  .file-details {
    font-size: 14px;
    color: #666;
  }
`;

const PreviewContent = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow: hidden;
  background-color: #f5f5f5;
`;

const ImagePreview = styled.img`
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`;

const PDFPreview = styled.iframe`
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`;

const LoadingSpinner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #666;
  font-size: 14px;
  
  &::before {
    content: '';
    width: 20px;
    height: 20px;
    border: 2px solid #e0e0e0;
    border-top: 2px solid #2196f3;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const ErrorMessage = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f44336;
  font-size: 14px;
  text-align: center;
  padding: 20px;
  
  &::before {
    content: '⚠️';
    margin-right: 8px;
    font-size: 20px;
  }
`;

const DownloadButton = styled(Button)`
  margin-left: 8px;
`;

export const FilePreview: React.FC<FilePreviewProps> = ({ file, isOpen, onClose }) => {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const url = await fileStorageService.getFileUrl(file.id);
      if (url) {
        setFileUrl(url);
      } else {
        setError('File not found');
      }
    } catch (err) {
      console.error('Failed to load file:', err);
      setError('Failed to load file');
    } finally {
      setLoading(false);
    }
  }, [file.id]);

  useEffect(() => {
    if (isOpen && !fileUrl) {
      loadFile();
    }
  }, [isOpen, fileUrl, loadFile]);

  const handleDownload = async () => {
    try {
      const result = await fileStorageService.getFileBlob(file.id);
      if (result) {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to download file:', err);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const renderPreview = () => {
    if (loading) {
      return <LoadingSpinner>Loading file...</LoadingSpinner>;
    }

    if (error) {
      return <ErrorMessage>{error}</ErrorMessage>;
    }

    if (!fileUrl) {
      return <ErrorMessage>No file URL available</ErrorMessage>;
    }

    switch (file.fileType) {
      case 'image':
        return <ImagePreview src={fileUrl} alt={file.filename} />;
      case 'pdf':
        return <PDFPreview src={fileUrl} title={file.filename} />;
      default:
        return <ErrorMessage>Unsupported file type: {file.fileType}</ErrorMessage>;
    }
  };

  // Cleanup object URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [fileUrl]);

  if (!isOpen) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <PreviewContainer>
          <PreviewHeader>
            <FileInfo>
              <h3>{file.filename}</h3>
              <div className="file-details">
                {formatFileSize(file.fileSize)} • {file.fileType.toUpperCase()} • 
                Uploaded: {formatDate(file.uploadDate)}
              </div>
            </FileInfo>
            <div>
              <DownloadButton variant="outline" onClick={handleDownload}>
                📥 Download
              </DownloadButton>
              <Button variant="outline" onClick={onClose} style={{ marginLeft: '8px' }}>
                Close
              </Button>
            </div>
          </PreviewHeader>
          <PreviewContent>
            {renderPreview()}
          </PreviewContent>
        </PreviewContainer>
      </ModalContent>
    </ModalOverlay>
  );
};