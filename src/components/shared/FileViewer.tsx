import React from 'react';
import styled from 'styled-components';
import { AttachedFile } from '../../types';

interface FileViewerProps {
  file: AttachedFile;
  onClose: () => void;
}

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ViewerContainer = styled.div`
  background: white;
  border-radius: 8px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ViewerHeader = styled.div`
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const FileName = styled.h3`
  margin: 0;
  color: #333;
  font-size: 16px;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #666;
  padding: 4px 8px;
  border-radius: 4px;
  
  &:hover {
    background: #f0f0f0;
  }
`;

const ViewerContent = styled.div`
  flex: 1;
  overflow: auto;
  min-height: 400px;
`;

const PDFViewer = styled.iframe`
  width: 100%;
  height: 600px;
  border: none;
`;

const ImageViewer = styled.img`
  max-width: 100%;
  max-height: 600px;
  object-fit: contain;
  display: block;
  margin: 0 auto;
`;

const UnsupportedMessage = styled.div`
  padding: 40px;
  text-align: center;
  color: #666;
`;

const FileInfo = styled.div`
  padding: 16px;
  background: #f5f5f5;
  border-top: 1px solid #e0e0e0;
  font-size: 14px;
  color: #666;
`;

export const FileViewer: React.FC<FileViewerProps> = ({ file, onClose }) => {
  const renderFileContent = () => {
    const dataUrl = `data:${file.mimeType};base64,${file.data}`;

    if (file.type === 'pdf') {
      return <PDFViewer src={dataUrl} title={file.originalName} />;
    } else if (file.type === 'image') {
      return <ImageViewer src={dataUrl} alt={file.originalName} />;
    } else {
      return (
        <UnsupportedMessage>
          <div>📄</div>
          <p>File preview not available for this file type.</p>
          <p>File: {file.originalName}</p>
          <p>Type: {file.mimeType}</p>
        </UnsupportedMessage>
      );
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Close on escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <Overlay onClick={onClose}>
      <ViewerContainer onClick={(e) => e.stopPropagation()}>
        <ViewerHeader>
          <FileName>{file.originalName}</FileName>
          <CloseButton onClick={onClose}>×</CloseButton>
        </ViewerHeader>
        
        <ViewerContent>
          {renderFileContent()}
        </ViewerContent>
        
        <FileInfo>
          Size: {formatFileSize(file.size)} | 
          Type: {file.mimeType} | 
          Uploaded: {file.uploadDate.toLocaleDateString()}
        </FileInfo>
      </ViewerContainer>
    </Overlay>
  );
};