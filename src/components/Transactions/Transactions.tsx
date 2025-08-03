import React, { useState, useEffect, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridReadyEvent } from 'ag-grid-community';
import styled from 'styled-components';
import { Card, PageHeader, Button, FlexBox } from '../../styles/globalStyles';
import { Transaction, ReimbursementMatch, Account } from '../../types';
import { dataService } from '../../services/dataService';
import { useReimbursementMatching } from '../../hooks/useReimbursementMatching';
import { useAccountManagement } from '../../hooks/useAccountManagement';
import { AccountSelectionDialog, AccountDetectionResult } from './AccountSelectionDialog';
import { fileProcessingService } from '../../services/fileProcessingService';
import { FileImport } from './FileImport';
import { TransactionAnalytics } from './TransactionAnalytics';
import { TransactionTemplates } from './TransactionTemplates';
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
  const isUncategorized = category === 'Uncategorized';
  const reimbursedClass = isReimbursed ? ' reimbursed' : '';
  
  const displayText = subcategory ? `${category} → ${subcategory}` : category;
  
  if (isUncategorized) {
    return (
      <span 
        className={reimbursedClass}
        style={{
          color: '#ff9800',
          fontWeight: 'bold',
          backgroundColor: '#fff3e0',
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '0.9em'
        }}
        title="This transaction needs manual categorization"
      >
        ⚠️ {displayText}
      </span>
    );
  }
  
  return <span className={reimbursedClass}>{displayText}</span>;
};

const ConfidenceCellRenderer = (params: any) => {
  const confidence = params.value;
  if (!confidence) return '';
  
  const percentage = Math.round(confidence * 100);
  const isLowConfidence = percentage < 70;
  const className = percentage >= 80 ? 'high' : percentage >= 60 ? 'medium' : 'low';
  const displayText = `${percentage}%`;
  
  if (isLowConfidence) {
    return (
      <span 
        className={`confidence ${className}`}
        style={{
          backgroundColor: '#ffebee',
          color: '#c62828',
          fontWeight: 'bold',
          border: '1px solid #f8bbd9'
        }}
        title="Low confidence - consider manual review"
      >
        ⚠️ {displayText}
      </span>
    );
  }
  
  return <span className={`confidence ${className}`}>{displayText}</span>;
};

const NotesRenderer = (params: any) => {
  const { reasoning, additionalNotes } = params.data;
  const displayText = additionalNotes || reasoning || '';

  if (!displayText) return '';

  return (
    <span title={displayText}>
      {displayText.length > 50 ? `${displayText.substring(0, 50)}...` : displayText}
    </span>
  );
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
      headerName: 'Notes',
      field: 'reasoning',
      sortable: false,
      filter: 'agTextColumnFilter',
      width: 200,
      cellRenderer: NotesRenderer,
      editable: true,
      cellEditor: 'agLargeTextCellEditor',
      cellEditorParams: {
        maxLength: 500,
        rows: 3
      }
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
    },
    {
      headerName: 'Actions',
      width: 120,
      pinned: 'right',
      cellRenderer: (params: any) => {
        return React.createElement('div', {
          style: { display: 'flex', gap: '4px', height: '100%', alignItems: 'center' }
        }, [
          React.createElement('button', {
            key: 'edit',
            className: 'edit-btn',
            'data-id': params.data.id,
            style: {
              padding: '4px 8px',
              fontSize: '12px',
              border: '1px solid #ddd',
              background: 'white',
              borderRadius: '4px',
              cursor: 'pointer'
            },
            title: 'Edit transaction',
            onClick: (e: any) => {
              e.stopPropagation();
              startEditTransaction(params.data);
            }
          }, '✏️'),
          React.createElement('button', {
            key: 'delete',
            className: 'delete-btn',
            'data-id': params.data.id,
            style: {
              padding: '4px 8px',
              fontSize: '12px',
              border: '1px solid #f44336',
              background: '#fff5f5',
              color: '#f44336',
              borderRadius: '4px',
              cursor: 'pointer'
            },
            title: 'Delete transaction',
            onClick: (e: any) => {
              e.stopPropagation();
              handleDeleteTransaction(params.data.id);
            }
          }, '🗑️')
        ]);
      }
    }
  ];

  useEffect(() => {
    // Load real transactions from dataService
    const loadTransactions = async () => {
      try {
        console.log('🔄 Loading transactions from dataService...');
        const allTransactions = await dataService.getAllTransactions();
        console.log(`📊 Loaded ${allTransactions.length} transactions`);
        setTransactions(allTransactions);
        setFilteredTransactions(allTransactions);
      } catch (error) {
        console.error('❌ Error loading transactions:', error);
        // Fall back to empty array if loading fails
        setTransactions([]);
        setFilteredTransactions([]);
      }
    };

    loadTransactions();
  }, []);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    // Use setTimeout to avoid ResizeObserver conflicts
    setTimeout(() => {
      params.api.sizeColumnsToFit();
    }, 0);
  }, []);

  const handleDeleteTransaction = async (id: string) => {
    try {
      console.log('Deleting transaction:', id);
      // For now, just remove from state since we're using mock data
      const updatedTransactions = transactions.filter(t => t.id !== id);
      setTransactions(updatedTransactions);
      setFilteredTransactions(updatedTransactions);
    } catch (error) {
      console.error('Failed to delete transaction:', error);
    }
  };

  const startEditTransaction = (transaction: Transaction) => {
    console.log('Editing transaction:', transaction);
    // For now, just show an alert since we're using mock data
    alert(`Edit transaction: ${transaction.description}\nAmount: ${transaction.amount}\nCategory: ${transaction.category}`);
  };

  const handleImportComplete = async (importedCount: number) => {
    console.log(`🎉 Import completed! ${importedCount} transactions imported`);
    
    // Refresh the transactions list to show the newly imported data
    try {
      console.log('🔄 Refreshing transactions after import...');
      const allTransactions = await dataService.getAllTransactions();
      console.log(`📊 Refreshed data: ${allTransactions.length} total transactions`);
      setTransactions(allTransactions);
      setFilteredTransactions(allTransactions);
      
      // Show success message
      console.log(`✅ Successfully refreshed UI with ${importedCount} new transactions`);
    } catch (error) {
      console.error('❌ Error refreshing transactions after import:', error);
    }
  };

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
    console.log('🏦 handleAccountSelection called with accountId:', accountId);
    if (!pendingFile) {
      console.log('❌ No pending file, returning early');
      return;
    }

    console.log('📁 Processing pending file:', pendingFile.name);

    // Close dialog immediately for better UX
    console.log('🔄 Closing dialog immediately...');
    setShowAccountDialog(false);
    const fileToProcess = pendingFile; // Store reference before clearing
    setPendingFile(null);
    setAccountDetectionResult(undefined);
    console.log('✅ Dialog closed, starting background processing...');

    try {
      console.log(`🎯 Starting background processing for account: ${accountId}`);
      const newTransactions = await fileProcessingService.assignAccountToFile('temp-id', accountId, fileToProcess);
      setTransactions(prev => [...prev, ...newTransactions]);
      console.log(`Successfully imported ${newTransactions.length} transactions to account: ${accountId}`);
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

      <FileImport onImportComplete={handleImportComplete} />

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
            <label>Quick Filters</label>
            <button
              style={{
                padding: '8px 12px',
                border: filters.category === 'Uncategorized' ? '2px solid #ff9800' : '1px solid #ddd',
                borderRadius: '4px',
                background: filters.category === 'Uncategorized' ? '#fff3e0' : 'white',
                color: filters.category === 'Uncategorized' ? '#ff9800' : '#666',
                fontWeight: filters.category === 'Uncategorized' ? 'bold' : 'normal',
                cursor: 'pointer',
                fontSize: '14px'
              }}
              onClick={() => setFilters({...filters, category: filters.category === 'Uncategorized' ? '' : 'Uncategorized'})}
            >
              ⚠️ Uncategorized ({filteredTransactions.filter(t => t.category === 'Uncategorized').length})
            </button>
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
