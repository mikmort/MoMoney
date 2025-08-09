import React from 'react';
import styled from 'styled-components';

interface CategoryEditConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (option: 'current' | 'future' | 'all') => void;
  transactionDescription: string;
  oldCategory: string;
  newCategory: string;
  oldSubcategory?: string;
  newSubcategory?: string;
}

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const Dialog = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
`;

const Title = styled.h3`
  margin: 0 0 16px 0;
  color: #333;
  font-size: 1.2em;
`;

const Description = styled.div`
  margin-bottom: 20px;
  line-height: 1.5;
`;

const TransactionInfo = styled.div`
  background: #f8f9fa;
  padding: 12px;
  border-radius: 4px;
  margin: 12px 0;
  border-left: 4px solid #007bff;
  
  .transaction-desc {
    font-weight: 600;
    color: #495057;
    margin-bottom: 8px;
  }
  
  .category-change {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9em;
    color: #666;
    
    .old {
      color: #dc3545;
    }
    
    .new {
      color: #28a745;
      font-weight: 600;
    }
    
    .arrow {
      color: #6c757d;
    }
  }
`;

const Options = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 20px 0;
`;

const OptionButton = styled.button`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 16px;
  border: 2px solid #e9ecef;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  
  &:hover {
    border-color: #007bff;
    background: #f8f9fa;
  }
  
  .option-title {
    font-weight: 600;
    color: #495057;
    margin-bottom: 4px;
  }
  
  .option-description {
    font-size: 0.85em;
    color: #6c757d;
    line-height: 1.4;
  }
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #e9ecef;
`;

const CancelButton = styled.button`
  padding: 8px 16px;
  border: 1px solid #6c757d;
  border-radius: 4px;
  background: white;
  color: #6c757d;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: #6c757d;
    color: white;
  }
`;

export const CategoryEditConfirmDialog: React.FC<CategoryEditConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  transactionDescription,
  oldCategory,
  newCategory,
  oldSubcategory,
  newSubcategory,
}) => {
  if (!isOpen) return null;

  const formatCategory = (category: string, subcategory?: string) => {
    return subcategory ? `${category} → ${subcategory}` : category;
  };

  const oldCategoryText = formatCategory(oldCategory, oldSubcategory);
  const newCategoryText = formatCategory(newCategory, newSubcategory);

  return (
    <Overlay onClick={onClose}>
      <Dialog onClick={(e) => e.stopPropagation()}>
        <Title>Apply Category Change</Title>
        
        <Description>
          You've changed the category for this transaction. How would you like to apply this change?
        </Description>
        
        <TransactionInfo>
          <div className="transaction-desc">"{transactionDescription}"</div>
          <div className="category-change">
            <span className="old">{oldCategoryText}</span>
            <span className="arrow">→</span>
            <span className="new">{newCategoryText}</span>
          </div>
        </TransactionInfo>
        
        <Options>
          <OptionButton onClick={() => onConfirm('current')}>
            <div className="option-title">This transaction only</div>
            <div className="option-description">
              Change just this transaction. Future similar transactions won't be affected.
            </div>
          </OptionButton>
          
          <OptionButton onClick={() => onConfirm('future')}>
            <div className="option-title">Future transactions</div>
            <div className="option-description">
              Change this transaction and automatically categorize future transactions with the same description and account.
            </div>
          </OptionButton>
          
          <OptionButton onClick={() => onConfirm('all')}>
            <div className="option-title">All existing and future transactions</div>
            <div className="option-description">
              Change this transaction, update existing transactions with the same description and account, and automatically categorize future ones.
            </div>
          </OptionButton>
        </Options>
        
        <ButtonRow>
          <CancelButton onClick={onClose}>Cancel</CancelButton>
        </ButtonRow>
      </Dialog>
    </Overlay>
  );
};