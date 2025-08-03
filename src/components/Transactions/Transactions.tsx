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

// Edit Transaction Modal styles
const EditModalOverlay = styled.div`
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

const EditModalContent = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;

  h2 {
    margin: 0 0 20px 0;
    color: #333;
    font-size: 1.5rem;
  }

  .form-group {
    margin-bottom: 16px;
    
    label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: #555;
      font-size: 0.9rem;
    }
    
    input, select, textarea {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      
      &:focus {
        outline: none;
        border-color: #2196f3;
        box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
      }
    }
    
    textarea {
      min-height: 60px;
      resize: vertical;
    }
  }

  .form-row {
    display: flex;
    gap: 16px;
    
    .form-group {
      flex: 1;
    }
  }

  .form-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid #eee;
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

  // Edit transaction modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionForm, setTransactionForm] = useState({
    description: '',
    amount: '',
    category: '',
    subcategory: '',
    account: '',
    type: '',
    date: '',
    notes: ''
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
    
    // Set the transaction being edited
    setEditingTransaction(transaction);
    
    // Populate the form with current transaction data
    setTransactionForm({
      description: transaction.description || '',
      amount: transaction.amount?.toString() || '',
      category: transaction.category || '',
      subcategory: transaction.subcategory || '',
      account: transaction.account || '',
      type: transaction.type || '',
      date: transaction.date ? transaction.date.toISOString().split('T')[0] : '',
      notes: transaction.notes || ''
    });
    
    // Show the edit modal
    setShowEditModal(true);
  };

  const handleEditFormChange = (field: string, value: string) => {
    setTransactionForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleEditFormSubmit = async () => {
    if (!editingTransaction) return;
    
    try {
      // Create updated transaction object
      const updatedTransaction: Transaction = {
        ...editingTransaction,
        description: transactionForm.description,
        amount: parseFloat(transactionForm.amount),
        category: transactionForm.category,
        subcategory: transactionForm.subcategory,
        account: transactionForm.account,
        type: transactionForm.type as 'income' | 'expense',
        date: new Date(transactionForm.date),
        notes: transactionForm.notes,
        lastModifiedDate: new Date()
      };

      // Update the transaction
      await dataService.updateTransaction(editingTransaction.id, {
        description: updatedTransaction.description,
        amount: updatedTransaction.amount,
        category: updatedTransaction.category,
        subcategory: updatedTransaction.subcategory,
        account: updatedTransaction.account,
        type: updatedTransaction.type,
        date: updatedTransaction.date,
        notes: updatedTransaction.notes,
        lastModifiedDate: updatedTransaction.lastModifiedDate
      });
      
      // Refresh the transactions list
      const updatedTransactions = await dataService.getAllTransactions();
      setTransactions(updatedTransactions);
      setFilteredTransactions(updatedTransactions);
      
      // Close the modal
      setShowEditModal(false);
      setEditingTransaction(null);
      
      console.log('✅ Transaction updated successfully');
    } catch (error) {
      console.error('❌ Error updating transaction:', error);
      alert('Failed to update transaction. Please try again.');
    }
  };

  const handleEditFormCancel = () => {
    setShowEditModal(false);
    setEditingTransaction(null);
    setTransactionForm({
      description: '',
      amount: '',
      category: '',
      subcategory: '',
      account: '',
      type: '',
      date: '',
      notes: ''
    });
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

      {/* Edit Transaction Modal */}
      {showEditModal && (
        <EditModalOverlay onClick={handleEditFormCancel}>
          <EditModalContent onClick={(e) => e.stopPropagation()}>
            <h2>Edit Transaction</h2>
            
            <div className="form-group">
              <label>Description *</label>
              <input
                type="text"
                value={transactionForm.description}
                onChange={(e) => handleEditFormChange('description', e.target.value)}
                placeholder="Transaction description"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={transactionForm.amount}
                  onChange={(e) => handleEditFormChange('amount', e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label>Type</label>
                <select
                  value={transactionForm.type}
                  onChange={(e) => handleEditFormChange('type', e.target.value)}
                >
                  <option value="">Select Type</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Category</label>
                <select
                  value={transactionForm.category}
                  onChange={(e) => handleEditFormChange('category', e.target.value)}
                >
                  <option value="">Select Category</option>
                  {uniqueCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Account</label>
                <select
                  value={transactionForm.account}
                  onChange={(e) => handleEditFormChange('account', e.target.value)}
                >
                  <option value="">Select Account</option>
                  {uniqueAccounts.map(account => (
                    <option key={account} value={account}>{account}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Subcategory</label>
                <input
                  type="text"
                  value={transactionForm.subcategory}
                  onChange={(e) => handleEditFormChange('subcategory', e.target.value)}
                  placeholder="Subcategory (optional)"
                />
              </div>

              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={transactionForm.date}
                  onChange={(e) => handleEditFormChange('date', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={transactionForm.notes}
                onChange={(e) => handleEditFormChange('notes', e.target.value)}
                placeholder="Additional notes (optional)"
              />
            </div>

            <div className="form-actions">
              <Button variant="outline" onClick={handleEditFormCancel}>
                Cancel
              </Button>
              <Button onClick={handleEditFormSubmit}>
                Save Changes
              </Button>
            </div>
          </EditModalContent>
        </EditModalOverlay>
      )}
    </div>
  );
};

export default Transactions;
