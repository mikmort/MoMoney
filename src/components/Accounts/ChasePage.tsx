import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { PageHeader, Card, FlexBox, Button } from '../../styles/globalStyles';
import ChaseConnect from './ChaseConnect';
import { fileProcessingService } from '../../services/fileProcessingService';
import { dataService } from '../../services/dataService';

const ChasePageContainer = styled.div`
  max-width: 1000px;
  margin: 0 auto;
`;

const StatusCard = styled(Card)<{ status: 'success' | 'error' | 'processing' }>`
  margin-top: 20px;
  padding: 20px;
  border-left: 4px solid ${props => 
    props.status === 'success' ? '#28a745' :
    props.status === 'error' ? '#dc3545' : '#0066cc'
  };
  background: ${props => 
    props.status === 'success' ? '#d4edda' :
    props.status === 'error' ? '#f8d7da' : '#e3f2fd'
  };
`;

const StatusIcon = styled.div<{ status: 'success' | 'error' | 'processing' }>`
  font-size: 24px;
  margin-bottom: 10px;
  
  &:before {
    content: ${props => 
      props.status === 'success' ? '"✅"' :
      props.status === 'error' ? '"❌"' : '"⏳"'
    };
  }
`;

const TransactionSummary = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin: 15px 0;
`;

const SummaryItem = styled.div`
  background: white;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  text-align: center;
`;

const SummaryNumber = styled.div`
  font-size: 24px;
  font-weight: bold;
  color: #0066cc;
  margin-bottom: 5px;
`;

const SummaryLabel = styled.div`
  font-size: 14px;
  color: #666;
`;

interface ImportResult {
  success: boolean;
  message: string;
  transactionCount?: number;
  accountName?: string;
  errorDetails?: string;
}

const ChasePage: React.FC = () => {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleFileUpload = useCallback(async (file: File) => {
    setIsProcessing(true);
    setImportResult(null);

    try {
      console.log('🏦 Processing Chase file:', file.name);
      
      // Process the uploaded file
      const processingResult = await fileProcessingService.processUploadedFile(file);
      
      if (processingResult.chaseDetection?.isChase) {
        console.log('🏦 Chase file detected and processed successfully');
        
        if (processingResult.transactions && processingResult.transactions.length > 0) {
          // Import the transactions
          await dataService.addTransactions(processingResult.transactions);
          
          setImportResult({
            success: true,
            message: `Successfully imported ${processingResult.transactions.length} Chase transactions`,
            transactionCount: processingResult.transactions.length,
            accountName: processingResult.chaseDetection.accountInfo?.accountName || 'Chase Account'
          });
        } else {
          setImportResult({
            success: false,
            message: 'No transactions found in the Chase file',
            errorDetails: 'The file appears to be empty or does not contain valid transaction data.'
          });
        }
      } else if (processingResult.needsAccountSelection) {
        // File was processed but needs account selection - redirect to transactions page
        setImportResult({
          success: true,
          message: 'File uploaded successfully, but account selection is needed',
          transactionCount: processingResult.transactions?.length || 0
        });
        
        // Navigate to transactions page after a short delay
        setTimeout(() => {
          navigate('/transactions');
        }, 2000);
      } else {
        setImportResult({
          success: false,
          message: 'Unable to process the file as a Chase statement',
          errorDetails: 'The file format was not recognized as a Chase CSV export. Please ensure you downloaded the file in CSV format from Chase Online Banking.'
        });
      }
    } catch (error) {
      console.error('Error processing Chase file:', error);
      setImportResult({
        success: false,
        message: 'Failed to process the Chase file',
        errorDetails: error instanceof Error ? error.message : 'An unknown error occurred'
      });
    } finally {
      setIsProcessing(false);
    }
  }, [navigate]);

  const handleViewTransactions = () => {
    navigate('/transactions');
  };

  const handleTryAgain = () => {
    setImportResult(null);
  };

  return (
    <ChasePageContainer>
      <PageHeader>
        <h1>🏦 Connect Chase Account</h1>
        <p>Import your Chase transactions securely into Mo Money</p>
      </PageHeader>

      <ChaseConnect 
        onFileUpload={handleFileUpload} 
        isProcessing={isProcessing}
      />

      {importResult && (
        <StatusCard status={importResult.success ? 'success' : 'error'}>
          <StatusIcon status={importResult.success ? 'success' : 'error'} />
          <h3>{importResult.message}</h3>
          
          {importResult.success && importResult.transactionCount && (
            <>
              <TransactionSummary>
                <SummaryItem>
                  <SummaryNumber>{importResult.transactionCount}</SummaryNumber>
                  <SummaryLabel>Transactions Imported</SummaryLabel>
                </SummaryItem>
                <SummaryItem>
                  <SummaryNumber>Chase</SummaryNumber>
                  <SummaryLabel>Bank Detected</SummaryLabel>
                </SummaryItem>
                <SummaryItem>
                  <SummaryNumber>✅</SummaryNumber>
                  <SummaryLabel>Ready to Use</SummaryLabel>
                </SummaryItem>
              </TransactionSummary>
              
              <FlexBox style={{ marginTop: 20, gap: 10 }}>
                <Button onClick={handleViewTransactions}>
                  📊 View Transactions
                </Button>
                <Button variant="secondary" onClick={handleTryAgain}>
                  📁 Import Another File
                </Button>
              </FlexBox>
            </>
          )}
          
          {!importResult.success && (
            <>
              {importResult.errorDetails && (
                <p style={{ marginTop: 10, fontSize: '14px', color: '#721c24' }}>
                  <strong>Details:</strong> {importResult.errorDetails}
                </p>
              )}
              
              <FlexBox style={{ marginTop: 20, gap: 10 }}>
                <Button onClick={handleTryAgain}>
                  🔄 Try Again
                </Button>
                <Button variant="secondary" onClick={() => navigate('/transactions')}>
                  📊 Manual Import
                </Button>
              </FlexBox>
            </>
          )}
        </StatusCard>
      )}

      {isProcessing && (
        <StatusCard status="processing">
          <StatusIcon status="processing" />
          <h3>Processing your Chase file...</h3>
          <p>Please wait while we import your transactions. This may take a few moments.</p>
        </StatusCard>
      )}
    </ChasePageContainer>
  );
};

export default ChasePage;