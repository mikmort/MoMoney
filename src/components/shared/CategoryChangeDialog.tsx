import React, { useState } from 'react';
import styled from 'styled-components';
import { Button } from '../../styles/globalStyles';

export interface CategoryChangeOption {
  type: 'single' | 'future' | 'retroactive';
  label: string;
  description: string;
}

export interface CategoryChangeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (option: CategoryChangeOption['type'], ruleType?: 'exact' | 'contains' | 'startsWith') => void;
  transactionDescription: string;
  oldCategory: string;
  newCategory: string;
  matchingTransactionCount?: number;
}

const DialogOverlay = styled.div`
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

const DialogContent = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
`;

const DialogHeader = styled.div`
  margin-bottom: 20px;
  
  h3 {
    margin: 0 0 8px 0;
    color: #333;
    font-size: 18px;
  }
  
  p {
    margin: 0;
    color: #666;
    font-size: 14px;
  }
`;

const OptionCard = styled.div<{ selected: boolean }>`
  border: 2px solid ${props => props.selected ? '#2196f3' : '#ddd'};
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: ${props => props.selected ? '#f3f8ff' : 'white'};
  
  &:hover {
    border-color: #2196f3;
    background: #f3f8ff;
  }
  
  .option-title {
    font-weight: 600;
    color: #333;
    margin-bottom: 4px;
  }
  
  .option-description {
    font-size: 13px;
    color: #666;
    line-height: 1.4;
  }
  
  .option-impact {
    font-size: 12px;
    color: #888;
    margin-top: 8px;
    font-style: italic;
  }
`;

const RuleTypeSection = styled.div`
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #eee;
  
  .rule-type-title {
    font-size: 14px;
    font-weight: 600;
    color: #333;
    margin-bottom: 8px;
  }
  
  .rule-type-options {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  
  .rule-type-option {
    padding: 6px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    
    &.selected {
      background: #2196f3;
      color: white;
      border-color: #2196f3;
    }
    
    &:hover:not(.selected) {
      border-color: #2196f3;
    }
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #eee;
`;

export const CategoryChangeDialog: React.FC<CategoryChangeDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  transactionDescription,
  oldCategory,
  newCategory,
  matchingTransactionCount = 0,
}) => {
  const [selectedOption, setSelectedOption] = useState<CategoryChangeOption['type'] | null>(null);
  const [ruleType, setRuleType] = useState<'exact' | 'contains' | 'startsWith'>('exact');

  if (!isOpen) return null;

  const options: CategoryChangeOption[] = [
    {
      type: 'single',
      label: 'This transaction only',
      description: `Change only this transaction from "${oldCategory}" to "${newCategory}".`,
    },
    {
      type: 'future',
      label: 'This and all future transactions',
      description: `Create a rule to categorize similar transactions as "${newCategory}" in the future. This transaction will also be updated.`,
    },
    {
      type: 'retroactive',
      label: 'This, past, and future transactions',
      description: `Create a rule and update ${matchingTransactionCount > 0 ? `${matchingTransactionCount} existing similar transactions` : 'any existing similar transactions'} to "${newCategory}".`,
    },
  ];

  const handleConfirm = () => {
    if (selectedOption) {
      onConfirm(selectedOption, selectedOption !== 'single' ? ruleType : undefined);
    }
  };

  const shouldShowRuleType = selectedOption && selectedOption !== 'single';

  return (
    <DialogOverlay onClick={onClose}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <h3>Category Change Options</h3>
          <p>
            You're changing the category for: <strong>"{transactionDescription.length > 50 
              ? transactionDescription.substring(0, 50) + '...' 
              : transactionDescription}"</strong>
          </p>
        </DialogHeader>

        {options.map((option) => (
          <OptionCard
            key={option.type}
            selected={selectedOption === option.type}
            onClick={() => setSelectedOption(option.type)}
          >
            <div className="option-title">{option.label}</div>
            <div className="option-description">{option.description}</div>
            {option.type === 'retroactive' && matchingTransactionCount > 0 && (
              <div className="option-impact">
                Impact: {matchingTransactionCount} existing transactions will be updated
              </div>
            )}
          </OptionCard>
        ))}

        {shouldShowRuleType && (
          <RuleTypeSection>
            <div className="rule-type-title">Rule matching type:</div>
            <div className="rule-type-options">
              <div
                className={`rule-type-option ${ruleType === 'exact' ? 'selected' : ''}`}
                onClick={() => setRuleType('exact')}
              >
                Exact match
              </div>
              <div
                className={`rule-type-option ${ruleType === 'contains' ? 'selected' : ''}`}
                onClick={() => setRuleType('contains')}
              >
                Contains text
              </div>
              <div
                className={`rule-type-option ${ruleType === 'startsWith' ? 'selected' : ''}`}
                onClick={() => setRuleType('startsWith')}
              >
                Starts with
              </div>
            </div>
          </RuleTypeSection>
        )}

        <ButtonGroup>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleConfirm}
            disabled={!selectedOption}
          >
            Apply Changes
          </Button>
        </ButtonGroup>
      </DialogContent>
    </DialogOverlay>
  );
};