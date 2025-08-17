import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Modal } from '../shared/Modal';
import { Card } from '../../styles/globalStyles';
import { dataService } from '../../services/dataService';
import { currencyDisplayService } from '../../services/currencyDisplayService';
import { Transaction } from '../../types';

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
`;

const StatCard = styled(Card)`
  text-align: center;
  
  .stat-value {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 8px 0;
    color: #2196f3;
    
    &.expense {
      color: #f44336;
    }
    
    &.income {
      color: #4caf50;
    }
  }
  
  .stat-label {
    color: #666;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
`;

const TransactionsList = styled.div`
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 4px;
  
  .transaction-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid #eee;
    
    &:last-child {
      border-bottom: none;
    }
    
    &:hover {
      background-color: #f9f9f9;
    }
  }
  
  .transaction-info {
    flex: 1;
    
    .description {
      font-weight: 500;
      margin-bottom: 4px;
    }
    
    .details {
      font-size: 0.85rem;
      color: #666;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      
      .date {
        color: #666;
      }
      
      .category {
        color: #2196f3;
      }
      
      .account {
        color: #666;
      }
    }
  }
  
  .transaction-amount {
    text-align: right;
    font-weight: 600;
    
    .amount {
      margin-bottom: 4px;
      
      &.expense {
        color: #f44336;
      }
      
      &.income {
        color: #4caf50;
      }
    }
    
    .type {
      font-size: 0.75rem;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .currency-info {
      font-size: 0.75rem;
      color: #888;
      margin-top: 2px;
    }
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px 20px;
  color: #666;
  
  .icon {
    font-size: 3rem;
    margin-bottom: 16px;
  }
  
  .message {
    font-size: 1.1rem;
    margin-bottom: 8px;
  }
  
  .submessage {
    font-size: 0.9rem;
    color: #888;
  }
`;

// Reusable component for displaying transaction amounts with currency conversion
const TransactionAmount: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
  const [displayData, setDisplayData] = useState<{
    displayAmount: string;
    tooltip?: string;
    isConverted: boolean;
    approxConvertedDisplay?: string;
  }>({
    displayAmount: '$0.00',
    isConverted: false
  });

  useEffect(() => {
    const formatAmount = async () => {
      const data = await currencyDisplayService.formatTransactionAmount(transaction);
      setDisplayData(data);
    };
    formatAmount();
  }, [transaction]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'income': return 'income';
      case 'expense': return 'expense';
      default: return '';
    }
  };

  return (
    <div className="transaction-amount">
      <div className={`amount ${getTypeColor(transaction.type)}`} title={displayData.tooltip}>
        {displayData.displayAmount}
      </div>
      {displayData.isConverted && displayData.approxConvertedDisplay && (
        <div className="currency-info">
          {displayData.approxConvertedDisplay}
        </div>
      )}
      <div className="type">{transaction.type}</div>
    </div>
  );
};

export interface TransactionFilter {
  type: 'category' | 'month' | 'month-type';
  category?: string;
  month?: string;
  year?: number;
  transactionType?: 'income' | 'expense';
  dateRange?: { startDate: Date; endDate: Date };
}

interface TransactionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  filter: TransactionFilter;
  title: string;
}

const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({
  isOpen,
  onClose,
  filter,
  title
}) => {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [convertedTransactions, setConvertedTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    
    const loadTransactions = async () => {
      setLoading(true);
      try {
        let filteredTransactions: Transaction[] = [];
        
        switch (filter.type) {
          case 'category':
            if (filter.category) {
              filteredTransactions = await dataService.getTransactionsByCategory(filter.category);
            }
            break;
            
          case 'month':
            if (filter.dateRange) {
              filteredTransactions = await dataService.getTransactionsByDateRange(
                filter.dateRange.startDate,
                filter.dateRange.endDate
              );
            }
            break;
            
          case 'month-type':
            if (filter.dateRange && filter.transactionType) {
              const rangeTransactions = await dataService.getTransactionsByDateRange(
                filter.dateRange.startDate,
                filter.dateRange.endDate
              );
              filteredTransactions = rangeTransactions.filter(t => t.type === filter.transactionType);
            }
            break;
        }
        
        // Sort by date (newest first)
        filteredTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        // Convert all transactions for proper stat calculations
        const converted = await currencyDisplayService.convertTransactionsBatch(filteredTransactions);
        
        setTransactions(filteredTransactions); // Keep originals for display
        setConvertedTransactions(converted); // Use converted for calculations
      } catch (error) {
        console.error('Failed to load transactions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, [isOpen, filter]);

  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
  useEffect(() => {
    (async () => setDefaultCurrency(await currencyDisplayService.getDefaultCurrency()))();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: defaultCurrency
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  };

  // Calculate stats - use converted transactions for accurate aggregation
  const totalAmount = convertedTransactions.reduce((sum, t) => sum + t.amount, 0);
  const incomeTotal = convertedTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expenseTotal = Math.abs(convertedTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
  const transactionCount = transactions.length;

  if (loading) {
    return (
      <Modal 
        isOpen={isOpen} 
        onClose={onClose} 
        title="Loading Transaction Details..."
        maxWidth="1000px"
      >
        <div style={{ textAlign: 'center', padding: '40px' }}>
          Loading transactions...
        </div>
      </Modal>
    );
  }

  if (transactions.length === 0) {
    return (
      <Modal 
        isOpen={isOpen} 
        onClose={onClose} 
        title={title}
        maxWidth="1000px"
      >
        <EmptyState>
          <div className="icon">📊</div>
          <div className="message">No transactions found</div>
          <div className="submessage">
            There are no transactions matching the selected criteria.
          </div>
        </EmptyState>
      </Modal>
    );
  }

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={title}
      maxWidth="1000px"
      maxHeight="90vh"
    >
      {/* Statistics Overview */}
      <StatsGrid>
        <StatCard>
          <div className="stat-label">Total Transactions</div>
          <div className="stat-value">{transactionCount}</div>
        </StatCard>
        
        {incomeTotal > 0 && (
          <StatCard>
            <div className="stat-label">Total Income</div>
            <div className="stat-value income">{formatCurrency(incomeTotal)}</div>
          </StatCard>
        )}
        
        {expenseTotal > 0 && (
          <StatCard>
            <div className="stat-label">Total Expenses</div>
            <div className="stat-value expense">{formatCurrency(expenseTotal)}</div>
          </StatCard>
        )}
        
        <StatCard>
          <div className="stat-label">Net Amount</div>
          <div className={`stat-value ${totalAmount >= 0 ? 'income' : 'expense'}`}>
            {formatCurrency(totalAmount)}
          </div>
        </StatCard>
      </StatsGrid>

      {/* Transactions List */}
      <Card>
        <h3>Transaction Details ({transactionCount} transactions)</h3>
        <TransactionsList>
          {transactions.map((transaction, index) => (
            <div key={transaction.id || index} className="transaction-item">
              <div className="transaction-info">
                <div className="description">{transaction.description}</div>
                <div className="details">
                  <span className="date">{formatDate(transaction.date)}</span>
                  <span className="category">{transaction.category}</span>
                  {transaction.account && <span className="account">{transaction.account}</span>}
                </div>
              </div>
              <TransactionAmount transaction={transaction} />
            </div>
          ))}
        </TransactionsList>
      </Card>
    </Modal>
  );
};

export default TransactionDetailsModal;