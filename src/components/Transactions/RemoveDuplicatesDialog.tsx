import React, { useState } from 'react';
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
  min-width: 700px;
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

const DuplicatesList = styled.div`
  margin: 20px 0;
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
`;

const DuplicateItem = styled.div`
  border-bottom: 1px solid #eee;
  padding: 16px;
  
  &:last-child {
    border-bottom: none;
  }
  
  &:nth-child(even) {
    background: #fafafa;
  }
`;

const DuplicateHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const SimilarityBadge = styled.span<{ similarity: number }>`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: white;
  background: ${props => props.similarity > 0.95 ? '#f44336' : props.similarity > 0.85 ? '#ff9800' : '#2196f3'};
`;

const TransactionRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 120px 150px 120px 120px;
  gap: 12px;
  padding: 8px;
  font-size: 14px;
  align-items: center;
`;

const TransactionLabel = styled.div`
  font-weight: 600;
  color: #666;
  grid-column: 1 / -1;
  margin-bottom: 4px;
  font-size: 12px;
`;

const TransactionDetails = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Amount = styled.div<{ amount: number }>`
  font-weight: 600;
  text-align: right;
  color: ${props => props.amount >= 0 ? '#4caf50' : '#f44336'};
`;

const SelectionControls = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 20px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 4px;
`;

const DialogActions = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 12px 24px;
  border-radius: 6px;
  border: none;
  font-size: 14px;
  cursor: pointer;
  font-weight: 500;
  
  ${props => props.variant === 'primary' ? `
    background: #2196f3;
    color: white;
    
    &:hover {
      background: #1976d2;
    }
    
    &:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
  ` : props.variant === 'danger' ? `
    background: #f44336;
    color: white;
    
    &:hover {
      background: #d32f2f;
    }
    
    &:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
  ` : `
    background: #f5f5f5;
    color: #333;
    
    &:hover {
      background: #e0e0e0;
    }
  `}
`;

interface RemoveDuplicatesDialogProps {
  isOpen: boolean;
  duplicates: DuplicateTransaction[];
  isLoading?: boolean;
  onClose: () => void;
  onRemoveDuplicates: (duplicateIds: string[]) => Promise<void>;
}

export const RemoveDuplicatesDialog: React.FC<RemoveDuplicatesDialogProps> = ({
  isOpen,
  duplicates,
  isLoading = false,
  onClose,
  onRemoveDuplicates
}) => {
  const [selectedDuplicates, setSelectedDuplicates] = useState<Set<string>>(new Set());
  const [isRemoving, setIsRemoving] = useState(false);

  if (!isOpen) return null;

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

  const handleSelectAll = () => {
    if (selectedDuplicates.size === duplicates.length) {
      setSelectedDuplicates(new Set());
    } else {
      const allIds = new Set(duplicates.map((dup, index) => {
        // Use the ID from newTransaction if it exists (it's a full Transaction), otherwise use index
        const newTx = dup.newTransaction as any;
        return newTx.id || `dup-${index}`;
      }));
      setSelectedDuplicates(allIds);
    }
  };

  const handleSelectDuplicate = (duplicateId: string) => {
    const newSelected = new Set(selectedDuplicates);
    if (newSelected.has(duplicateId)) {
      newSelected.delete(duplicateId);
    } else {
      newSelected.add(duplicateId);
    }
    setSelectedDuplicates(newSelected);
  };

  const handleRemove = async () => {
    if (selectedDuplicates.size === 0) return;

    try {
      setIsRemoving(true);
      await onRemoveDuplicates(Array.from(selectedDuplicates));
      setSelectedDuplicates(new Set());
      onClose();
    } catch (error) {
      console.error('Error removing duplicates:', error);
      alert('Failed to remove duplicates. Please try again.');
    } finally {
      setIsRemoving(false);
    }
  };

  if (isLoading) {
    return (
      <DialogOverlay>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🔍 Searching for Duplicates</DialogTitle>
            <DialogDescription>
              Please wait while we analyze your transactions for duplicates...
            </DialogDescription>
          </DialogHeader>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div>Analyzing transactions...</div>
          </div>
        </DialogContent>
      </DialogOverlay>
    );
  }

  if (duplicates.length === 0) {
    return (
      <DialogOverlay>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>✅ No Duplicates Found</DialogTitle>
            <DialogDescription>
              Great! We didn't find any duplicate transactions in your account.
            </DialogDescription>
          </DialogHeader>
          <DialogActions>
            <div></div>
            <Button variant="primary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogContent>
      </DialogOverlay>
    );
  }

  return (
    <DialogOverlay>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            ⚠️ Duplicate Transactions Found
          </DialogTitle>
          <DialogDescription>
            Found {duplicates.length} duplicate transaction{duplicates.length > 1 ? 's' : ''}. 
            Select the duplicate transactions you want to remove.
          </DialogDescription>
        </DialogHeader>

        <SelectionControls>
          <Button 
            variant="primary" 
            onClick={handleSelectAll}
            style={{
              border: '2px solid #1976d2',
              outline: '1px solid #2196f3',
              boxShadow: '0 2px 4px rgba(33, 150, 243, 0.2)'
            }}
          >
            {selectedDuplicates.size === duplicates.length ? 'Deselect All' : 'Select All'}
          </Button>
          <span>
            {selectedDuplicates.size} of {duplicates.length} selected
          </span>
        </SelectionControls>

        <DuplicatesList>
          {duplicates.map((duplicate, index) => {
            const newTx = duplicate.newTransaction as any;
            const duplicateId = newTx.id || `dup-${index}`;
            const isSelected = selectedDuplicates.has(duplicateId);

            return (
              <DuplicateItem key={`${duplicate.existingTransaction.id}-${duplicateId}`}>
                <DuplicateHeader>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleSelectDuplicate(duplicateId)}
                      style={{ marginRight: '8px' }}
                    />
                    <span style={{ fontWeight: 'bold', color: '#333' }}>
                      Duplicate Pair #{index + 1}
                    </span>
                  </label>
                  <SimilarityBadge similarity={duplicate.similarity}>
                    {Math.round(duplicate.similarity * 100)}% match
                  </SimilarityBadge>
                </DuplicateHeader>

                <TransactionLabel>📋 Original Transaction (will be kept)</TransactionLabel>
                <TransactionRow>
                  <TransactionDetails title={duplicate.existingTransaction.description}>
                    {duplicate.existingTransaction.description}
                  </TransactionDetails>
                  <div>{formatDate(duplicate.existingTransaction.date)}</div>
                  <div>{duplicate.existingTransaction.account}</div>
                  <Amount amount={duplicate.existingTransaction.amount}>
                    {formatAmount(duplicate.existingTransaction.amount)}
                  </Amount>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {duplicate.existingTransaction.category}
                  </div>
                </TransactionRow>

                <TransactionLabel style={{ color: '#f44336' }}>
                  🗑️ Duplicate Transaction (will be removed if selected)
                </TransactionLabel>
                <TransactionRow>
                  <TransactionDetails title={duplicate.newTransaction.description}>
                    {duplicate.newTransaction.description}
                  </TransactionDetails>
                  <div>{formatDate(duplicate.newTransaction.date)}</div>
                  <div>{duplicate.newTransaction.account}</div>
                  <Amount amount={duplicate.newTransaction.amount}>
                    {formatAmount(duplicate.newTransaction.amount)}
                  </Amount>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {duplicate.newTransaction.category}
                  </div>
                </TransactionRow>

                {(duplicate.daysDifference || duplicate.amountDifference) && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                    {duplicate.daysDifference && duplicate.daysDifference > 0 && (
                      <span style={{ marginRight: '12px' }}>
                        📅 {duplicate.daysDifference} days difference
                      </span>
                    )}
                    {duplicate.amountDifference && duplicate.amountDifference > 0 && (
                      <span>
                        💰 ${duplicate.amountDifference.toFixed(2)} amount difference
                      </span>
                    )}
                  </div>
                )}
              </DuplicateItem>
            );
          })}
        </DuplicatesList>

        <DialogActions>
          <div style={{ fontSize: '14px', color: '#666' }}>
            ⚠️ This action cannot be undone. Please review carefully.
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button variant="secondary" onClick={onClose} disabled={isRemoving}>
              Cancel
            </Button>
            <Button 
              variant="danger" 
              onClick={handleRemove}
              disabled={selectedDuplicates.size === 0 || isRemoving}
            >
              {isRemoving ? 'Removing...' : `Remove ${selectedDuplicates.size} Duplicate${selectedDuplicates.size !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </DialogActions>
      </DialogContent>
    </DialogOverlay>
  );
};