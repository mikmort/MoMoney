import React, { useState } from 'react';
import styled from 'styled-components';
import { Account } from '../../types';
import { Button } from '../../styles/globalStyles';
import { userPreferencesService } from '../../services/userPreferencesService';

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
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;

  h2 {
    margin: 0 0 16px 0;
    color: #333;
  }

  .file-info {
    background: #f5f5f5;
    padding: 12px;
    border-radius: 4px;
    margin-bottom: 20px;
    font-size: 14px;
    color: #666;
  }

  .detection-info {
    background: #e3f2fd;
    padding: 12px;
    border-radius: 4px;
    margin-bottom: 20px;
    border-left: 4px solid #2196f3;

    .confidence {
      font-weight: bold;
      color: #1976d2;
    }

    .reasoning {
      margin-top: 8px;
      font-style: italic;
      color: #666;
    }
  }

  .account-options {
    margin: 20px 0;
  }

  .account-option {
    display: flex;
    align-items: center;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
      background-color: #f5f5f5;
    }

    &.selected {
      background-color: #e3f2fd;
      border-color: #2196f3;
    }

    input[type="radio"] {
      margin-right: 12px;
    }

    .account-info {
      flex: 1;

      .account-name {
        font-weight: bold;
        color: #333;
      }

      .account-details {
        font-size: 12px;
        color: #666;
        margin-top: 4px;
      }
    }

    .confidence-badge {
      background: #e8f5e8;
      color: #4caf50;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: bold;

      &.medium {
        background: #fff3e0;
        color: #ff9800;
      }

      &.low {
        background: #ffebee;
        color: #f44336;
      }
    }
  }

  .new-account {
    border: 2px dashed #ddd;
    text-align: center;
    color: #666;

    &:hover {
      border-color: #2196f3;
      color: #2196f3;
    }
  }

  .actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid #eee;
  }
`;

const NewAccountForm = styled.div`
  margin: 20px 0;
  padding: 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fafafa;

  .form-group {
    margin-bottom: 16px;

    label {
      display: block;
      margin-bottom: 4px;
      font-weight: bold;
      color: #333;
    }

    input, select {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;

      &:focus {
        outline: none;
        border-color: #2196f3;
      }
    }
  }
`;

export interface AccountDetectionResult {
  detectedAccountId?: string;
  confidence: number;
  reasoning: string;
  suggestedAccounts: Array<{
    accountId: string;
    confidence: number;
    reasoning: string;
  }>;
}

interface AccountSelectionDialogProps {
  isOpen: boolean;
  fileName: string;
  detectionResult?: AccountDetectionResult;
  accounts: Account[];
  onAccountSelect: (accountId: string) => void;
  onNewAccount: (account: Omit<Account, 'id'>) => void;
  onCancel: () => void;
}

export const AccountSelectionDialog: React.FC<AccountSelectionDialogProps> = ({
  isOpen,
  fileName,
  detectionResult,
  accounts,
  onAccountSelect,
  onNewAccount,
  onCancel
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string | 'new'>(
    detectionResult?.detectedAccountId || ''
  );
  const [showNewAccountForm, setShowNewAccountForm] = useState(false);
  const [newAccount, setNewAccount] = useState({
    name: '',
    type: 'checking' as const,
    institution: '',
    currency: 'USD',
    isActive: true
  });

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedAccountId === 'new') {
      if (newAccount.name && newAccount.institution) {
        onNewAccount(newAccount);
      }
    } else if (selectedAccountId) {
      onAccountSelect(selectedAccountId);
    }
  };

  const getConfidenceClass = (confidence: number) => {
    if (confidence > 0.9) return 'high';
    if (confidence >= 0.6) return 'medium';
    return 'low';
  };

  const getConfidenceBadge = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`;
  };

  return (
    <DialogOverlay onClick={onCancel}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <h2>Select Account for Import</h2>
        
        <div className="file-info">
          <strong>File:</strong> {fileName}
        </div>

        {detectionResult && detectionResult.confidence > 0 && (
          <div className="detection-info">
            <div className="confidence">
              Auto-detection confidence: {getConfidenceBadge(detectionResult.confidence)}
            </div>
            <div className="reasoning">{detectionResult.reasoning}</div>
          </div>
        )}

        <div className="account-options">
          {accounts.map((account) => {
            const suggestion = detectionResult?.suggestedAccounts.find(s => s.accountId === account.id);
            
            return (
              <div
                key={account.id}
                className={`account-option ${selectedAccountId === account.id ? 'selected' : ''}`}
                onClick={() => setSelectedAccountId(account.id)}
              >
                <input
                  type="radio"
                  checked={selectedAccountId === account.id}
                  onChange={() => setSelectedAccountId(account.id)}
                />
                <div className="account-info">
                  <div className="account-name">{account.name}</div>
                  <div className="account-details">
                    {account.type} • {account.institution}
                  </div>
                </div>
                {suggestion && (
                  <div className={`confidence-badge ${getConfidenceClass(suggestion.confidence)}`}>
                    {getConfidenceBadge(suggestion.confidence)}
                  </div>
                )}
              </div>
            );
          })}

          <div
            className={`account-option new-account ${selectedAccountId === 'new' ? 'selected' : ''}`}
            onClick={() => {
              setSelectedAccountId('new');
              setShowNewAccountForm(true);
            }}
          >
            <input
              type="radio"
              checked={selectedAccountId === 'new'}
              onChange={() => {
                setSelectedAccountId('new');
                setShowNewAccountForm(true);
              }}
            />
            <div className="account-info">
              <div className="account-name">+ Add New Account</div>
              <div className="account-details">Create a new account for these transactions</div>
            </div>
          </div>
        </div>

        {showNewAccountForm && selectedAccountId === 'new' && (
          <NewAccountForm>
            <div className="form-group">
              <label>Account Name *</label>
              <input
                type="text"
                value={newAccount.name}
                onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                placeholder="e.g., Chase Freedom Credit Card"
              />
            </div>
            <div className="form-group">
              <label>Account Type *</label>
              <select
                value={newAccount.type}
                onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value as any })}
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="credit">Credit Card</option>
                <option value="investment">Investment</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <div className="form-group">
              <label>Institution *</label>
              <input
                type="text"
                value={newAccount.institution}
                onChange={(e) => setNewAccount({ ...newAccount, institution: e.target.value })}
                placeholder="e.g., JPMorgan Chase Bank"
              />
            </div>
            <div className="form-group">
              <label>Currency *</label>
              <select
                value={newAccount.currency}
                onChange={(e) => setNewAccount({ ...newAccount, currency: e.target.value })}
              >
                {userPreferencesService.getCurrencyOptions().map(currency => (
                  <option key={currency.value} value={currency.value}>
                    {currency.label} ({currency.symbol})
                  </option>
                ))}
              </select>
            </div>
          </NewAccountForm>
        )}

        <div className="actions">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            type="button"
            onClick={handleConfirm}
            disabled={!selectedAccountId || (selectedAccountId === 'new' && (!newAccount.name || !newAccount.institution))}
          >
            {selectedAccountId === 'new' ? 'Create & Import' : 'Import to Account'}
          </Button>
        </div>
      </DialogContent>
    </DialogOverlay>
  );
};
