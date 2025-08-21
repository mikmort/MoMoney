import React, { useState } from 'react';
import styled from 'styled-components';
import { Button } from '../../styles/globalStyles';
import { Account } from '../../types';

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20000;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 400px;
  position: relative;
  z-index: 20001;

  h2 {
    margin: 0 0 20px 0;
    color: #333;
    font-size: 1.3rem;
    text-align: center;
  }

  .balance-entry-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
    margin: 20px 0;
  }

  .balance-row {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 1.1rem;
    
    input {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 1.1rem;
      text-align: center;
      
      &:focus {
        outline: none;
        border-color: #2196f3;
        box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
      }
      
      &[type="number"] {
        width: 140px;
      }
      
      &[type="date"] {
        width: 160px;
      }
    }
  }

  .current-balance-info {
    background: #f8f9fa;
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 16px;
    text-align: center;
    color: #666;
    font-size: 0.9rem;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    margin-top: 24px;
    gap: 12px;
  }
`;

interface SetBalanceModalProps {
  account: Account | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (balance: number, date: Date) => void;
}

export const SetBalanceModal: React.FC<SetBalanceModalProps> = ({
  account,
  isOpen,
  onClose,
  onSave
}) => {
  const [balance, setBalance] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen && account) {
      setBalance(account.balance?.toString() || '');
      setDate(new Date().toISOString().split('T')[0]);
    }
  }, [isOpen, account]);

  if (!isOpen || !account) return null;

  const handleSave = () => {
    const parsedBalance = parseFloat(balance);
    if (isNaN(parsedBalance)) {
      alert('Please enter a valid balance amount');
      return;
    }
    
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      alert('Please enter a valid date');
      return;
    }

    onSave(parsedBalance, parsedDate);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const formatCurrency = (amount: number) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: account.currency || 'USD'
      }).format(amount);
    } catch {
      return `$${amount.toFixed(2)}`;
    }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <h2>Set Balance for {account.name}</h2>
        
        {account.balance !== undefined && (
          <div className="current-balance-info">
            Current Balance: {formatCurrency(account.balance)}
            {account.historicalBalanceDate && (
              <div style={{ fontSize: '0.85em', marginTop: '4px' }}>
                as of {
                  account.historicalBalanceDate instanceof Date 
                    ? account.historicalBalanceDate.toLocaleDateString()
                    : new Date(account.historicalBalanceDate).toLocaleDateString()
                }
              </div>
            )}
          </div>
        )}
        
        <div className="balance-entry-form">
          <div className="balance-row">
            <input
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
            <span>as of date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="actions">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Set Balance
          </Button>
        </div>
      </ModalContent>
    </ModalOverlay>
  );
};

export default SetBalanceModal;