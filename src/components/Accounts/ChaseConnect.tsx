import React, { useState, useCallback } from 'react';
import styled from 'styled-components';
import { Card, Button, FlexBox } from '../../styles/globalStyles';
import { chaseConnectivityService, ChaseConnectionGuide } from '../../services/chaseConnectivityService';

const ChaseContainer = styled(Card)`
  max-width: 800px;
  margin: 0 auto;
`;

const StepContainer = styled.div`
  margin: 20px 0;
  padding: 15px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fafafa;
`;

const StepHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 10px;
`;

const StepNumber = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #0066cc;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  margin-right: 12px;
`;

const StepTitle = styled.h3`
  margin: 0;
  color: #333;
`;

const StepDescription = styled.p`
  margin: 8px 0 0 44px;
  color: #666;
  line-height: 1.5;
`;

const StepLink = styled.a`
  color: #0066cc;
  text-decoration: none;
  font-weight: 500;
  
  &:hover {
    text-decoration: underline;
  }
`;

const FormatList = styled.div`
  background: #e8f4fd;
  padding: 15px;
  border-radius: 8px;
  margin: 15px 0;
`;

const FormatItem = styled.div`
  padding: 5px 0;
  color: #333;
  
  &:before {
    content: '✓';
    color: #28a745;
    font-weight: bold;
    margin-right: 8px;
  }
`;

const InfoBox = styled.div`
  background: #fff3cd;
  border: 1px solid #ffeeba;
  padding: 15px;
  border-radius: 8px;
  margin: 15px 0;
  color: #856404;
`;

const FileUploadArea = styled.div`
  border: 2px dashed #0066cc;
  border-radius: 8px;
  padding: 40px 20px;
  text-align: center;
  margin: 20px 0;
  background: #f8f9fa;
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover {
    border-color: #004494;
    background: #e3f2fd;
  }
  
  &.drag-active {
    border-color: #28a745;
    background: #d4edda;
  }
`;

const UploadIcon = styled.div`
  font-size: 48px;
  color: #0066cc;
  margin-bottom: 10px;
`;

const UploadText = styled.div`
  font-size: 16px;
  color: #333;
  margin-bottom: 5px;
`;

const UploadSubtext = styled.div`
  font-size: 14px;
  color: #666;
`;

interface ChaseConnectProps {
  onFileUpload?: (file: File) => void;
  isProcessing?: boolean;
}

export const ChaseConnect: React.FC<ChaseConnectProps> = ({ 
  onFileUpload, 
  isProcessing = false 
}) => {
  const [showGuide, setShowGuide] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const guide: ChaseConnectionGuide = chaseConnectivityService.getDownloadGuide();

  const handleFileUpload = useCallback((file: File) => {
    if (onFileUpload) {
      onFileUpload(file);
    }
  }, [onFileUpload]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  return (
    <ChaseContainer>
      <h2>🏦 Connect Chase Account</h2>
      
      <InfoBox>
        <strong>💡 How it works:</strong> Since Chase doesn't provide a direct API for personal accounts, 
        we'll guide you through downloading your transaction history from Chase's website and importing it securely into Mo Money.
      </InfoBox>

      {showGuide && (
        <>
          <h3>📋 Download Instructions</h3>
          
          <FormatList>
            <h4>Supported Formats:</h4>
            {guide.supportedFormats.map((format, index) => (
              <FormatItem key={index}>{format}</FormatItem>
            ))}
          </FormatList>

          <p><strong>📅 Date Range:</strong> {guide.downloadInstructions}</p>

          {guide.steps.map((step) => (
            <StepContainer key={step.step}>
              <StepHeader>
                <StepNumber>{step.step}</StepNumber>
                <StepTitle>{step.title}</StepTitle>
              </StepHeader>
              <StepDescription>
                {step.description}
                {step.url && (
                  <>
                    <br />
                    <StepLink href={step.url} target="_blank" rel="noopener noreferrer">
                      Open Chase Online Banking →
                    </StepLink>
                  </>
                )}
              </StepDescription>
            </StepContainer>
          ))}

          <FlexBox style={{ marginTop: 20, gap: 10 }}>
            <Button onClick={() => setShowGuide(false)}>
              ✅ I've Downloaded My Chase File
            </Button>
          </FlexBox>
        </>
      )}

      {!showGuide && (
        <>
          <h3>📤 Upload Your Chase File</h3>
          
          <FileUploadArea
            className={dragActive ? 'drag-active' : ''}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => document.getElementById('chase-file-input')?.click()}
          >
            <UploadIcon>📁</UploadIcon>
            <UploadText>
              {isProcessing ? 'Processing your Chase file...' : 'Drop your Chase CSV file here or click to browse'}
            </UploadText>
            <UploadSubtext>
              Supported: CSV files downloaded from Chase Online Banking
            </UploadSubtext>
            <input
              id="chase-file-input"
              type="file"
              accept=".csv,.ofx,.qif"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
              disabled={isProcessing}
            />
          </FileUploadArea>

          <FlexBox style={{ marginTop: 20, gap: 10 }}>
            <Button 
              variant="secondary" 
              onClick={() => setShowGuide(true)}
            >
              ← Back to Instructions
            </Button>
          </FlexBox>
        </>
      )}
    </ChaseContainer>
  );
};

export default ChaseConnect;