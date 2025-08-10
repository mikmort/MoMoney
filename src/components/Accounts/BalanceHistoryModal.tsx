import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Button } from '../../styles/globalStyles';
import { Account } from '../../types';
import { accountManagementService } from '../../services/accountManagementService';
import { userPreferencesService } from '../../services/userPreferencesService';

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
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;

  h2 {
    margin: 0 0 20px 0;
    color: #333;
    font-size: 1.5rem;
  }

  .account-info {
    margin-bottom: 20px;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 6px;
    
    .account-name {
      font-weight: 600;
      font-size: 1.1rem;
      color: #333;
      margin-bottom: 4px;
    }
    
    .account-details {
      font-size: 0.9rem;
      color: #666;
    }
  }

  .loading {
    text-align: center;
    padding: 40px 20px;
    color: #666;
    font-style: italic;
  }

  .no-data {
    text-align: center;
    padding: 40px 20px;
    color: #888;
  }

  .balance-history {
    border: 1px solid #e9ecef;
    border-radius: 6px;
    overflow: hidden;
    
    .history-header {
      background: #f8f9fa;
      padding: 12px 16px;
      border-bottom: 1px solid #e9ecef;
      font-weight: 600;
      color: #333;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .history-list {
      max-height: 400px;
      overflow-y: auto;
    }
    
    .history-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #f1f3f4;
      
      &:last-child {
        border-bottom: none;
      }
      
      &:hover {
        background: #f8f9fa;
      }
      
      .date {
        font-weight: 500;
        color: #333;
      }
      
      .balance {
        font-weight: 600;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        
        &.positive {
          color: #28a745;
        }
        
        &.negative {
          color: #dc3545;
        }
        
        &.zero {
          color: #6c757d;
        }
      }
    }
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid #eee;
  }
`;

interface BalanceHistoryItem {
  date: Date;
  formattedDate: string;
  balance: number;
}

interface BalanceHistoryModalProps {
  account: Account;
  isOpen: boolean;
  onClose: () => void;
}

export const BalanceHistoryModal: React.FC<BalanceHistoryModalProps> = ({
  account,
  isOpen,
  onClose
}) => {
  const [balanceHistory, setBalanceHistory] = useState<BalanceHistoryItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadBalanceHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load balance history, current balance, and last updated date in parallel
      const [history, lastUpdatedDate, currentBal] = await Promise.all([
        accountManagementService.calculateMonthlyBalanceHistory(account.id),
        accountManagementService.calculateLastUpdatedDate(account.id),
        accountManagementService.calculateCurrentBalance(account.id)
      ]);

      setBalanceHistory(history);
      setLastUpdated(lastUpdatedDate);
      setCurrentBalance(currentBal || 0);
    } catch (error) {
      console.error('Error loading balance history:', error);
      setBalanceHistory([]);
      setLastUpdated(null);
      setCurrentBalance(account.balance || 0);
    } finally {
      setIsLoading(false);
    }
  }, [account.id, account.balance]);

  useEffect(() => {
    if (isOpen && account) {
      loadBalanceHistory();
    }
  }, [isOpen, account, loadBalanceHistory]);

  const formatCurrency = (amount: number): string => {
    const currencyCode = account.currency || 'USD';
    try {
      return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: currencyCode 
      }).format(amount);
    } catch {
      // Fallback for unknown currencies
      const symbol = userPreferencesService.getCurrencySymbol(currencyCode);
      const abs = Math.abs(amount).toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      });
      const sign = amount < 0 ? '-' : '';
      return `${sign}${symbol}${abs}`;
    }
  };

  const getBalanceClass = (balance: number): string => {
    if (balance > 0) return 'positive';
    if (balance < 0) return 'negative';
    return 'zero';
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <h2>Balance History</h2>
        
        <div className="account-info">
          <div className="account-name">{account.name}</div>
          <div className="account-details">
            {account.institution} • {account.type.charAt(0).toUpperCase() + account.type.slice(1)}
          </div>
        </div>

        {isLoading ? (
          <div className="loading">Loading balance history...</div>
        ) : (
          <div className="balance-history">
            <div className="history-header">
              <span>Monthly Balance History</span>
              {lastUpdated && (
                <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: '#666' }}>
                  Last updated: {lastUpdated.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })} • Current: {formatCurrency(currentBalance)}
                </span>
              )}
            </div>
            
            {balanceHistory.length === 0 ? (
              <div className="no-data">
                No transaction history available for this account.
              </div>
            ) : (
              <div className="history-list">
                {balanceHistory.map((item, index) => (
                  <div key={index} className="history-item">
                    <span className="date">{item.formattedDate}</span>
                    <span className={`balance ${getBalanceClass(item.balance)}`}>
                      {formatCurrency(item.balance)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="actions">
          <Button onClick={onClose}>Close</Button>
        </div>
      </ModalContent>
    </ModalOverlay>
  );
};

export default BalanceHistoryModal;