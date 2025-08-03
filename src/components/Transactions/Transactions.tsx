import React, { useState, useEffect, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridReadyEvent } from 'ag-grid-community';
import styled from 'styled-components';
import { Card, PageHeader, Button, FlexBox } from '../../styles/globalStyles';
import { Transaction, ReimbursementMatch, Account } from '../../types';
import { useReimbursementMatching } from '../../hooks/useReimbursementMatching';
import { useAccountManagement } from '../../hooks/useAccountManagement';
import { AccountSelectionDialog, AccountDetectionResult } from './AccountSelectionDialog';
import { fileProcessingService } from '../../services/fileProcessingService';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

const TransactionsContainer = styled.div`
  .ag-theme-alpine {
    height: 600px;
    width: 100%;
  }

  .ag-cell {
    .positive {
      color: #4caf50;
      font-weight: 600;
    }
    
    .negative {
      color: #f44336;
      font-weight: 600;
    }
    
    .reimbursed {
      color: #666;
      text-decoration: line-through;
      opacity: 0.7;
    }
    
    .confidence {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.85rem;
      font-weight: 500;
      
      &.high {
        background: #e8f5e8;
        color: #2e7d32;
      }
      
      &.medium {
        background: #fff3cd;
        color: #856404;
      }
      
      &.low {
        background: #f8d7da;
        color: #721c24;
      }
    }
  }
`;

const ReimbursementPanel = styled(Card)`
  margin-bottom: 20px;
  
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    
    h3 {
      margin: 0;
      color: #333;
    }
  }
  
  .matches-list {
    .match-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      margin-bottom: 8px;
      background: #f9f9f9;
      
      .match-info {
        flex: 1;
        
        .expense {
          font-weight: 600;
          color: #f44336;
        }
        
        .reimbursement {
          font-weight: 600;
          color: #4caf50;
        }
        
        .match-details {
          font-size: 0.9rem;
          color: #666;
          margin-top: 4px;
        }
      }
      
      .match-actions {
        display: flex;
        gap: 8px;
      }
      
      .confidence-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.8rem;
        font-weight: 600;
        
        &.high {
          background: #e8f5e8;
          color: #2e7d32;
        }
        
        &.medium {
          background: #fff3cd;
          color: #856404;
        }
        
        &.low {
          background: #f8d7da;
          color: #721c24;
        }
      }
    }
    
    .no-matches {
      text-align: center;
      color: #666;
      padding: 20px;
      font-style: italic;
    }
  }
`;

const FilterBar = styled(Card)`
  margin-bottom: 20px;
  
  .filter-row {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
  }
  
  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    
    label {
      font-size: 0.9rem;
      font-weight: 500;
      color: #666;
    }
    
    select, input {
      min-width: 150px;
    }
  }
`;

const StatsBar = styled.div`
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  
  .stat {
    background: white;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    
    .label {
      font-size: 0.85rem;
      color: #666;
      margin-bottom: 4px;
    }
    
    .value {
      font-size: 1.1rem;
      font-weight: 600;
      
      &.positive {
        color: #4caf50;
      }
      
      &.negative {
        color: #f44336;
      }
    }
  }
`;

const UploadArea = styled.div`
  border: 2px dashed #ddd;
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  background: #fafafa;
  margin-bottom: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover, &.dragover {
    border-color: #2196f3;
    background: #f0f8ff;
  }
  
  .upload-text {
    font-size: 1.1rem;
    color: #666;
    margin-bottom: 8px;
  }
  
  .upload-subtext {
    font-size: 0.9rem;
    color: #999;
  }
`;

// Custom cell renderers
const AmountCellRenderer = (params: any) => {
  const amount = params.value;
  const isReimbursed = params.data.reimbursed;
  const className = amount >= 0 ? 'positive' : 'negative';
  const reimbursedClass = isReimbursed ? ' reimbursed' : '';
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
  
  return <span className={className + reimbursedClass}>{formatted}</span>;
};

const CategoryCellRenderer = (params: any) => {
  const category = params.value;
  const subcategory = params.data.subcategory;
  const isReimbursed = params.data.reimbursed;
  const reimbursedClass = isReimbursed ? ' reimbursed' : '';
  
  const displayText = subcategory ? `${category} → ${subcategory}` : category;
  return <span className={reimbursedClass}>{displayText}</span>;
};

const ConfidenceCellRenderer = (params: any) => {
  const confidence = params.value;
  if (!confidence) return '';
  
  const percentage = Math.round(confidence * 100);
  const className = percentage >= 80 ? 'high' : percentage >= 60 ? 'medium' : 'low';
  
  return <span className={`confidence ${className}`}>{percentage}%</span>;
};

const Transactions: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [showReimbursementPanel, setShowReimbursementPanel] = useState(false);
  const [showReimbursedTransactions, setShowReimbursedTransactions] = useState(true);
  
  // Account selection dialog state
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [accountDetectionResult, setAccountDetectionResult] = useState<AccountDetectionResult | undefined>();
  
  const [filters, setFilters] = useState({
    category: '',
    type: '',
    dateFrom: '',
    dateTo: '',
    account: '',
    search: ''
  });

  const { 
    isLoading: isMatchingLoading, 
    error: matchingError, 
    matches, 
    findMatches, 
    applyMatches,
    filterNonReimbursed 
  } = useReimbursementMatching();

  const {
    accounts,
    addAccount
  } = useAccountManagement();

  // Column definitions for AG Grid
  const columnDefs: ColDef[] = [
    {
      headerName: 'Date',
      field: 'date',
      sortable: true,
      filter: 'agDateColumnFilter',
      width: 120,
      valueFormatter: (params: any) => {
        return new Date(params.value).toLocaleDateString();
      }
    },
    {
      headerName: 'Description',
      field: 'description',
      sortable: true,
      filter: 'agTextColumnFilter',
      flex: 2,
      minWidth: 200
    },
    {
      headerName: 'Category',
      field: 'category',
      sortable: true,
      filter: 'agTextColumnFilter',
      width: 180,
      cellRenderer: CategoryCellRenderer
    },
    {
      headerName: 'Account',
      field: 'account',
      sortable: true,
      filter: 'agTextColumnFilter',
      width: 140
    },
    {
      headerName: 'Amount',
      field: 'amount',
      sortable: true,
      filter: 'agNumberColumnFilter',
      width: 120,
      cellRenderer: AmountCellRenderer,
      type: 'rightAligned'
    },
    {
      headerName: 'AI Confidence',
      field: 'confidence',
      sortable: true,
      width: 130,
      cellRenderer: ConfidenceCellRenderer
    },
    {
      headerName: 'Verified',
      field: 'isVerified',
      width: 100,
      cellRenderer: (params: any) => {
        return params.value ? '✅' : '⏳';
      }
    },
    {
      headerName: 'Reimbursed',
      field: 'reimbursed',
      width: 110,
      cellRenderer: (params: any) => {
        return params.value ? '💰' : '';
      }
    }
  ];

  useEffect(() => {
    // Mock data - replace with actual API calls
    const mockTransactions: Transaction[] = [
      {
        id: '1',
        date: new Date('2025-08-01'),
        amount: -125.50,
        description: 'Whole Foods Market #123',
        category: 'Food & Dining',
        subcategory: 'Groceries',
        account: 'Chase Checking',
        type: 'expense',
        confidence: 0.95,
        isVerified: true,
        vendor: 'Whole Foods'
      },
      {
        id: '2',
        date: new Date('2025-08-01'),
        amount: 2750.00,
        description: 'Direct Deposit - ACME Corp',
        category: 'Salary & Wages',
        subcategory: 'Primary Job',
        account: 'Chase Checking',
        type: 'income',
        confidence: 0.99,
        isVerified: true
      },
      {
        id: '3',
        date: new Date('2025-07-31'),
        amount: -45.30,
        description: 'Shell Service Station',
        category: 'Transportation',
        subcategory: 'Fuel/Gas',
        account: 'Chase Checking',
        type: 'expense',
        confidence: 0.92,
        isVerified: false,
        vendor: 'Shell'
      },
      {
        id: '4',
        date: new Date('2025-07-30'),
        amount: -89.99,
        description: 'Amazon.com Purchase',
        category: 'Shopping',
        subcategory: 'Miscellaneous',
        account: 'Chase Credit',
        type: 'expense',
        confidence: 0.78,
        isVerified: false,
        vendor: 'Amazon'
      },
      {
        id: '5',
        date: new Date('2025-07-30'),
        amount: -12.50,
        description: 'Netflix Monthly Subscription',
        category: 'Entertainment',
        subcategory: 'Streaming Services',
        account: 'Chase Credit',
        type: 'expense',
        confidence: 0.98,
        isVerified: true,
        vendor: 'Netflix'
      },
      {
        id: '6',
        date: new Date('2025-07-28'),
        amount: -245.75,
        description: 'CVS Pharmacy - Prescription Medication',
        category: 'Healthcare',
        subcategory: 'Pharmacy',
        account: 'Chase Checking',
        type: 'expense',
        confidence: 0.92,
        isVerified: true,
        vendor: 'CVS'
      },
      {
        id: '7',
        date: new Date('2025-08-02'),
        amount: 245.75,
        description: 'HSA Reimbursement - Medical Expenses',
        category: 'Other Income',
        subcategory: 'Insurance Claims',
        account: 'Chase Checking',
        type: 'income',
        confidence: 0.95,
        isVerified: true
      },
      {
        id: '8',
        date: new Date('2025-07-25'),
        amount: -550.00,
        description: 'United Airlines - Business Travel LAX-JFK',
        category: 'Transportation',
        subcategory: 'Business Travel',
        account: 'Chase Credit',
        type: 'expense',
        confidence: 0.89,
        isVerified: false,
        vendor: 'United Airlines'
      },
      {
        id: '9',
        date: new Date('2025-07-30'),
        amount: 550.00,
        description: 'Expense Reimbursement - ACME Corp',
        category: 'Business Income',
        subcategory: 'Expense Reimbursement',
        account: 'Chase Checking',
        type: 'income',
        confidence: 0.94,
        isVerified: true
      },
      {
        id: '10',
        date: new Date('2025-07-22'),
        amount: -89.45,
        description: 'London Hotel - Business Trip',
        category: 'Transportation',
        subcategory: 'Business Travel',
        account: 'Chase Credit',
        type: 'expense',
        confidence: 0.87,
        isVerified: false,
        originalCurrency: 'GBP',
        exchangeRate: 1.27
      },
      {
        id: '11',
        date: new Date('2025-08-01'),
        amount: 113.60,
        description: 'Payroll - Travel Reimbursement',
        category: 'Business Income',
        subcategory: 'Expense Reimbursement',
        account: 'Chase Checking',
        type: 'income',
        confidence: 0.91,
        isVerified: true
      }
    ];

    setTimeout(() => {
      setTransactions(mockTransactions);
      setFilteredTransactions(mockTransactions);
    }, 1000);
  }, []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      console.log('Processing file:', file.name);
      const result = await fileProcessingService.processUploadedFile(file);
      
      if (result.needsAccountSelection) {
        // Show account selection dialog
        setPendingFile(file);
        setAccountDetectionResult(result.detectionResult);
        setShowAccountDialog(true);
      } else {
        // File processed successfully with auto-detected account
        if (result.transactions) {
          setTransactions(prev => [...prev, ...result.transactions!]);
          console.log(`Successfully imported ${result.transactions.length} transactions to account: ${result.file.accountId}`);
        }
      }
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Failed to process file. Please try again.');
    }
    
    // Reset file input
    event.target.value = '';
  };

  const handleAccountSelection = async (accountId: string) => {
    if (!pendingFile) return;

    try {
      const newTransactions = await fileProcessingService.assignAccountToFile('temp-id', accountId);
      setTransactions(prev => [...prev, ...newTransactions]);
      console.log(`Successfully imported ${newTransactions.length} transactions to account: ${accountId}`);
      
      // Close dialog and reset state
      setShowAccountDialog(false);
      setPendingFile(null);
      setAccountDetectionResult(undefined);
    } catch (error) {
      console.error('Error assigning account to file:', error);
      alert('Failed to import transactions. Please try again.');
    }
  };

  const handleNewAccount = async (newAccountData: Omit<Account, 'id'>) => {
    try {
      const newAccount = await addAccount(newAccountData);
      
      // Now assign the file to this new account
      await handleAccountSelection(newAccount.id);
    } catch (error) {
      console.error('Error creating new account:', error);
      alert('Failed to create new account. Please try again.');
    }
  };

  const handleCancelAccountSelection = () => {
    setShowAccountDialog(false);
    setPendingFile(null);
    setAccountDetectionResult(undefined);
  };

  const applyFilters = useCallback(() => {
    let filtered = transactions.slice(); // Use slice() instead of spread

    // Filter out reimbursed transactions if the toggle is off
    if (!showReimbursedTransactions) {
      filtered = filterNonReimbursed(filtered);
    }

    if (filters.category) {
      filtered = filtered.filter((t: Transaction) => t.category === filters.category);
    }
    if (filters.type) {
      filtered = filtered.filter((t: Transaction) => t.type === filters.type);
    }
    if (filters.account) {
      filtered = filtered.filter((t: Transaction) => t.account === filters.account);
    }
    if (filters.search) {
      filtered = filtered.filter((t: Transaction) => 
        t.description.toLowerCase().includes(filters.search.toLowerCase())
      );
    }
    if (filters.dateFrom) {
      filtered = filtered.filter((t: Transaction) => t.date >= new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      filtered = filtered.filter((t: Transaction) => t.date <= new Date(filters.dateTo));
    }

    setFilteredTransactions(filtered);
  }, [transactions, filters, showReimbursedTransactions, filterNonReimbursed]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const calculateStats = () => {
    const transactionsToCalculate = showReimbursedTransactions ? filteredTransactions : filterNonReimbursed(filteredTransactions);
    
    const totalIncome = transactionsToCalculate
      .filter((t: Transaction) => t.type === 'income')
      .reduce((sum: number, t: Transaction) => sum + t.amount, 0);
    
    const totalExpenses = transactionsToCalculate
      .filter((t: Transaction) => t.type === 'expense')
      .reduce((sum: number, t: Transaction) => sum + Math.abs(t.amount), 0);

    return {
      totalIncome,
      totalExpenses,
      netAmount: totalIncome - totalExpenses,
      count: transactionsToCalculate.length
    };
  };

  const stats = calculateStats();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const uniqueCategories = Array.from(new Set(transactions.map((t: Transaction) => t.category)));
  const uniqueAccounts = Array.from(new Set(transactions.map((t: Transaction) => t.account)));

  const handleFindReimbursements = async () => {
    const result = await findMatches({
      transactions,
      maxDaysDifference: 90,
      tolerancePercentage: 0.05
    });
    
    if (result) {
      setShowReimbursementPanel(true);
    }
  };

  const handleApplyMatch = async (match: ReimbursementMatch) => {
    const updatedTransactions = await applyMatches(transactions, [match]);
    setTransactions(updatedTransactions);
  };

  const getConfidenceClass = (confidence: number) => {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.6) return 'medium';
    return 'low';
  };

  const renderReimbursementPanel = () => {
    if (!showReimbursementPanel) return null;

    return (
      <ReimbursementPanel>
        <div className="panel-header">
          <h3>Reimbursement Matches ({matches.length})</h3>
          <Button variant="outline" onClick={() => setShowReimbursementPanel(false)}>
            Close
          </Button>
        </div>
        
        {matchingError && (
          <div style={{ color: '#f44336', marginBottom: '16px' }}>
            Error: {matchingError}
          </div>
        )}
        
        <div className="matches-list">
          {matches.length === 0 ? (
            <div className="no-matches">
              No reimbursement matches found. Try adjusting the date range or tolerance settings.
            </div>
          ) : (
            matches.map((match) => {
              const expense = transactions.find(t => t.id === match.expenseTransactionId);
              const reimbursement = transactions.find(t => t.id === match.reimbursementTransactionId);
              
              if (!expense || !reimbursement) return null;
              
              return (
                <div key={match.id} className="match-item">
                  <div className="match-info">
                    <div className="expense">
                      Expense: {expense.description} ({formatCurrency(expense.amount)})
                    </div>
                    <div className="reimbursement">
                      Reimbursement: {reimbursement.description} ({formatCurrency(reimbursement.amount)})
                    </div>
                    <div className="match-details">
                      {match.reasoning} • {match.dateDifference} days apart
                      {match.amountDifference > 0 && ` • $${match.amountDifference.toFixed(2)} difference`}
                    </div>
                  </div>
                  <div className="match-actions">
                    <span className={`confidence-badge ${getConfidenceClass(match.confidence)}`}>
                      {Math.round(match.confidence * 100)}%
                    </span>
                    <Button 
                      onClick={() => handleApplyMatch(match)}
                      disabled={expense.reimbursed}
                      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                    >
                      {expense.reimbursed ? 'Applied' : 'Apply'}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ReimbursementPanel>
    );
  };

  return (
    <div>
      <PageHeader>
        <h1>Transactions</h1>
        <FlexBox gap="12px">
          <Button 
            variant="outline" 
            onClick={handleFindReimbursements}
            disabled={isMatchingLoading}
          >
            {isMatchingLoading ? 'Finding...' : 'Find Reimbursements'}
          </Button>
          <Button variant="outline">Export</Button>
          <Button>Add Transaction</Button>
        </FlexBox>
      </PageHeader>

      {renderReimbursementPanel()}

      <UploadArea>
        <input
          type="file"
          accept=".pdf,.csv,.xlsx,.png,.jpg,.jpeg"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          id="file-upload"
        />
        <label htmlFor="file-upload">
          <div className="upload-text">📄 Drop bank statements here or click to upload</div>
          <div className="upload-subtext">Supports PDF, CSV, Excel, and image files</div>
        </label>
      </UploadArea>

      <FilterBar>
        <div className="filter-row">
          <div className="filter-group">
            <label>Category</label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({...filters, category: e.target.value})}
            >
              <option value="">All Categories</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          
          <div className="filter-group">
            <label>Type</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({...filters, type: e.target.value})}
            >
              <option value="">All Types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Account</label>
            <select
              value={filters.account}
              onChange={(e) => setFilters({...filters, account: e.target.value})}
            >
              <option value="">All Accounts</option>
              {uniqueAccounts.map(account => (
                <option key={account} value={account}>{account}</option>
              ))}
            </select>
          </div>
          
          <div className="filter-group">
            <label>Search</label>
            <input
              type="text"
              placeholder="Search descriptions..."
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
            />
          </div>
          
          <div className="filter-group">
            <label>
              <input
                type="checkbox"
                checked={showReimbursedTransactions}
                onChange={(e) => setShowReimbursedTransactions(e.target.checked)}
                style={{ marginRight: '8px' }}
              />
              Show Reimbursed
            </label>
          </div>
        </div>
      </FilterBar>

      <StatsBar>
        <div className="stat">
          <div className="label">Total Income</div>
          <div className="value positive">{formatCurrency(stats.totalIncome)}</div>
        </div>
        <div className="stat">
          <div className="label">Total Expenses</div>
          <div className="value negative">{formatCurrency(stats.totalExpenses)}</div>
        </div>
        <div className="stat">
          <div className="label">Net Amount</div>
          <div className={`value ${stats.netAmount >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(stats.netAmount)}
          </div>
        </div>
        <div className="stat">
          <div className="label">Transactions</div>
          <div className="value">{stats.count}</div>
        </div>
      </StatsBar>

      <Card>
        <TransactionsContainer>
          <div className="ag-theme-alpine">
            <AgGridReact
              columnDefs={columnDefs}
              rowData={filteredTransactions}
              onGridReady={onGridReady}
              pagination={true}
              paginationPageSize={50}
              defaultColDef={{
                resizable: true,
                sortable: true,
                filter: true
              }}
            />
          </div>
        </TransactionsContainer>
      </Card>

      <AccountSelectionDialog
        isOpen={showAccountDialog}
        fileName={pendingFile?.name || ''}
        detectionResult={accountDetectionResult}
        accounts={accounts}
        onAccountSelect={handleAccountSelection}
        onNewAccount={handleNewAccount}
        onCancel={handleCancelAccountSelection}
      />
    </div>
  );
};

export default Transactions;
