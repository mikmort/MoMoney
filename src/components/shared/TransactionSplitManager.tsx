import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Transaction, TransactionSplit, Category } from '../../types';
import { Button } from '../../styles/globalStyles';
import { 
  hasTransactionSplits, 
  getSplitTotal, 
  validateSplits, 
  createEmptySplit,
  convertToSplitTransaction,
  removeSplit,
  updateSplit
} from '../../utils/transactionUtils';

interface TransactionSplitManagerProps {
  transaction: Transaction;
  categories: Category[];
  onSplitsChange: (splits: TransactionSplit[] | undefined) => void;
  disabled?: boolean;
}

const SplitContainer = styled.div`
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0;
  background-color: #fafafa;

  .split-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    
    h4 {
      margin: 0;
      color: #333;
      font-size: 1rem;
    }
    
    .split-toggle {
      font-size: 0.9rem;
      padding: 6px 12px;
    }
  }

  .split-summary {
    background: #f0f8ff;
    padding: 12px;
    border-radius: 6px;
    margin-bottom: 16px;
    border-left: 4px solid #2196f3;
    
    .summary-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 0.9rem;
      
      &:last-child {
        margin-bottom: 0;
        font-weight: bold;
        padding-top: 4px;
        border-top: 1px solid #e0e7ff;
      }
      
      .amount {
        font-family: 'Courier New', monospace;
      }
    }
  }

  .split-error {
    background: #ffebee;
    color: #c62828;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 0.85rem;
    margin-bottom: 16px;
    border-left: 4px solid #f44336;
  }

  .splits-list {
    .split-item {
      background: white;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
      
      .split-header {
        display: flex;
        justify-content: between;
        align-items: center;
        margin-bottom: 12px;
        
        .split-number {
          font-weight: bold;
          color: #666;
          font-size: 0.85rem;
        }
        
        .remove-split {
          background: none;
          border: none;
          color: #f44336;
          cursor: pointer;
          font-size: 1.1rem;
          padding: 4px;
          border-radius: 4px;
          
          &:hover {
            background: #ffebee;
          }
        }
      }
      
      .split-fields {
        display: grid;
        grid-template-columns: 1fr 2fr 2fr;
        gap: 12px;
        align-items: end;
        
        .field-group {
          display: flex;
          flex-direction: column;
          
          label {
            font-size: 0.85rem;
            font-weight: 500;
            color: #666;
            margin-bottom: 4px;
          }
          
          input, select {
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 0.9rem;
            
            &:focus {
              outline: none;
              border-color: #2196f3;
              box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
            }
          }
        }
      }
    }
  }

  .split-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 16px;
    
    .add-split-btn {
      background: #e8f5e8;
      color: #2e7d32;
      border: 1px solid #4caf50;
      
      &:hover {
        background: #c8e6c9;
      }
    }
  }
`;

export const TransactionSplitManager: React.FC<TransactionSplitManagerProps> = ({
  transaction,
  categories,
  onSplitsChange,
  disabled = false
}) => {
  const [splits, setSplits] = useState<TransactionSplit[]>([]);
  const [isSplitMode, setIsSplitMode] = useState(false);

  // Initialize splits based on transaction
  useEffect(() => {
    const hasSplits = hasTransactionSplits(transaction);
    setIsSplitMode(hasSplits);
    
    if (hasSplits) {
      setSplits(transaction.splits!);
    } else {
      setSplits([]);
    }
  }, [transaction]);

  // Update parent when splits change
  useEffect(() => {
    if (isSplitMode && splits.length > 0) {
      onSplitsChange(splits);
    } else {
      onSplitsChange(undefined);
    }
  }, [splits, isSplitMode, onSplitsChange]);

  const toggleSplitMode = () => {
    if (!isSplitMode) {
      // Enable split mode - convert current transaction to a single split
      const initialSplits = convertToSplitTransaction(transaction);
      setSplits(initialSplits);
      setIsSplitMode(true);
    } else {
      // Disable split mode
      setSplits([]);
      setIsSplitMode(false);
    }
  };

  const addSplit = () => {
    const remainingAmount = Math.abs(transaction.amount) - Math.abs(getSplitTotal(splits));
    const newSplit = createEmptySplit(transaction.category, transaction.subcategory);
    newSplit.amount = Math.max(0, remainingAmount);
    setSplits([...splits, newSplit]);
  };

  const removeSplitItem = (splitId: string) => {
    const newSplits = removeSplit({ ...transaction, splits }, splitId);
    setSplits(newSplits);
    
    // If no splits left, exit split mode
    if (newSplits.length === 0) {
      setIsSplitMode(false);
    }
  };

  const updateSplitItem = (splitId: string, field: keyof TransactionSplit, value: any) => {
    const updates = { [field]: value };
    const newSplits = updateSplit({ ...transaction, splits }, splitId, updates);
    setSplits(newSplits);
  };

  const getAvailableSubcategories = (categoryName: string) => {
    const category = categories.find(cat => cat.name === categoryName);
    return category?.subcategories || [];
  };

  const validation = validateSplits({ ...transaction, splits });

  return (
    <SplitContainer>
      <div className="split-header">
        <h4>💸 Transaction Splits</h4>
        <Button 
          variant="outline" 
          className="split-toggle"
          onClick={toggleSplitMode}
          disabled={disabled}
        >
          {isSplitMode ? 'Disable Splits' : 'Enable Splits'}
        </Button>
      </div>

      {isSplitMode && (
        <>
          <div className="split-summary">
            <div className="summary-row">
              <span>Original Amount:</span>
              <span className="amount">${Math.abs(transaction.amount).toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Split Total:</span>
              <span className="amount">${Math.abs(getSplitTotal(splits)).toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Remaining:</span>
              <span className="amount">
                ${(Math.abs(transaction.amount) - Math.abs(getSplitTotal(splits))).toFixed(2)}
              </span>
            </div>
          </div>

          {!validation.isValid && (
            <div className="split-error">
              ⚠️ {validation.message}
            </div>
          )}

          <div className="splits-list">
            {splits.map((split, index) => (
              <div key={split.id} className="split-item">
                <div className="split-header">
                  <span className="split-number">Split #{index + 1}</span>
                  {splits.length > 1 && (
                    <button
                      className="remove-split"
                      onClick={() => removeSplitItem(split.id)}
                      disabled={disabled}
                      title="Remove this split"
                    >
                      ✕
                    </button>
                  )}
                </div>
                
                <div className="split-fields">
                  <div className="field-group">
                    <label>Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={split.amount}
                      onChange={(e) => updateSplitItem(split.id, 'amount', parseFloat(e.target.value) || 0)}
                      disabled={disabled}
                    />
                  </div>
                  
                  <div className="field-group">
                    <label>Category</label>
                    <select
                      value={split.category}
                      onChange={(e) => {
                        updateSplitItem(split.id, 'category', e.target.value);
                        updateSplitItem(split.id, 'subcategory', ''); // Reset subcategory
                      }}
                      disabled={disabled}
                    >
                      <option value="">Select Category</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="field-group">
                    <label>Subcategory</label>
                    <select
                      value={split.subcategory || ''}
                      onChange={(e) => updateSplitItem(split.id, 'subcategory', e.target.value)}
                      disabled={disabled || !split.category}
                    >
                      <option value="">Select Subcategory</option>
                      {getAvailableSubcategories(split.category).map(sub => (
                        <option key={sub.id} value={sub.name}>{sub.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="split-actions">
            <Button 
              variant="outline" 
              className="add-split-btn"
              onClick={addSplit}
              disabled={disabled}
            >
              ➕ Add Split
            </Button>
          </div>
        </>
      )}
    </SplitContainer>
  );
};

export default TransactionSplitManager;