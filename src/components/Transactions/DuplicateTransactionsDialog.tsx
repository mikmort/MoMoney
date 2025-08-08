import React from 'react';
import styled from 'styled-components';
import { DuplicateTransaction } from '../../types';

const DialogOverlay = styled.div`
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
`;

const DialogContent = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  max-width: 90%;
  max-height: 90%;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 600px;
`;

const DialogHeader = styled.div`
  margin-bottom: 20px;
`;

const DialogTitle = styled.h2`
  margin: 0 0 8px 0;
  color: #f44336;
  font-size: 20px;
`;

const DialogDescription = styled.p`
  margin: 0;
  color: #666;
  font-size: 14px;
`;

const DuplicateGrid = styled.div`
  margin: 20px 0;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  max-height: 400px;
  overflow-y: auto;
`;

const GridHeader = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 120px;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
  font-weight: bold;
  padding: 8px;
  font-size: 12px;
  color: #333;
`;

const GridRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 120px;
  border-bottom: 1px solid #eee;
  padding: 8px;
  font-size: 12px;
  
  &:last-child {
    border-bottom: none;
  }
  
  &:nth-child(even) {
    background: #fafafa;
  }
`;

const GridCell = styled.div`
  padding: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DialogActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' }>`
  padding: 12px 24px;
  border-radius: 6px;
  border: none;
  font-size: 14px;
  cursor: pointer;
  
  ${props => props.variant === 'primary' ? `
    background: #0066cc;
    color: white;
    
    &:hover {
      background: #0052a3;
    }
  ` : `
    background: #f5f5f5;
    color: #333;
    
    &:hover {
      background: #e0e0e0;
    }
  `}
`;

const WarningIcon = styled.span`
  color: #f44336;
  font-size: 18px;
  margin-right: 8px;
`;

interface DuplicateTransactionsDialogProps {
  duplicates: DuplicateTransaction[];
  onImportAnyway: () => void;
  onIgnoreDuplicates: () => void;
}

export const DuplicateTransactionsDialog: React.FC<DuplicateTransactionsDialogProps> = ({
  duplicates,
  onImportAnyway,
  onIgnoreDuplicates
}) => {
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString();
  };

  return (
    <DialogOverlay>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <WarningIcon>⚠️</WarningIcon>
            Duplicate Transactions Found
          </DialogTitle>
          <DialogDescription>
            {duplicates.length} duplicate transaction{duplicates.length > 1 ? 's' : ''} detected. 
            These transactions appear to already exist in your account.
          </DialogDescription>
        </DialogHeader>

        <DuplicateGrid>
          <GridHeader>
            <GridCell>Date</GridCell>
            <GridCell>Description</GridCell>
            <GridCell>Amount</GridCell>
            <GridCell>Account</GridCell>
            <GridCell>Status</GridCell>
          </GridHeader>
          
          {duplicates.map((duplicate, index) => (
            <GridRow key={index}>
              <GridCell title={formatDate(duplicate.newTransaction.date)}>
                {formatDate(duplicate.newTransaction.date)}
              </GridCell>
              <GridCell title={duplicate.newTransaction.description}>
                {duplicate.newTransaction.description}
              </GridCell>
              <GridCell>
                {formatAmount(duplicate.newTransaction.amount)}
              </GridCell>
              <GridCell title={duplicate.newTransaction.account}>
                {duplicate.newTransaction.account}
              </GridCell>
              <GridCell>
                <span style={{ color: '#f44336', fontSize: '11px' }}>
                  Duplicate
                </span>
              </GridCell>
            </GridRow>
          ))}
        </DuplicateGrid>

        <DialogActions>
          <Button variant="secondary" onClick={onIgnoreDuplicates}>
            Ignore Duplicates (Recommended)
          </Button>
          <Button variant="primary" onClick={onImportAnyway}>
            Import Anyway
          </Button>
        </DialogActions>
      </DialogContent>
    </DialogOverlay>
  );
};