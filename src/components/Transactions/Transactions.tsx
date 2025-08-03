import React, { useState, useEffect, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridReadyEvent } from 'ag-grid-community';
import styled from 'styled-components';
import { Card, PageHeader, Button, FlexBox } from '../../styles/globalStyles';
import { Transaction } from '../../types';
import { dataService } from '../../services/dataService';
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
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
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

const ActionsBar = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  align-items: center;
  flex-wrap: wrap;
`;

const ExportButton = styled(Button)`
  background: #28a745;
  
  &:hover {
    background: #218838;
  }
`;

const BulkActionsBar = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
  align-items: center;
  
  .selection-info {
    font-weight: 500;
    color: #495057;
  }
`;

const QuickAddModal = styled.div`
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
  
  .modal-content {
    background: white;
    padding: 24px;
    border-radius: 12px;
    width: 500px;
    max-width: 90vw;
    max-height: 90vh;
    overflow-y: auto;
    
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      
      h3 {
        margin: 0;
      }
    }
    
    .form-group {
      margin-bottom: 16px;
      
      label {
        display: block;
        margin-bottom: 4px;
        font-weight: 500;
        color: #333;
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
        resize: vertical;
        min-height: 60px;
      }
    }
    
    .form-row {
      display: flex;
      gap: 16px;
      
      .form-group {
        flex: 1;
      }
    }
    
    .modal-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 24px;
    }
  }
`;

// Custom cell renderers
const AmountCellRenderer = (params: any) => {
  const amount = params.value;
  const className = amount >= 0 ? 'positive' : 'negative';
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
  
  return <span className={className}>{formatted}</span>;
};

const CategoryCellRenderer = (params: any) => {
  const category = params.value;
  const subcategory = params.data.subcategory;
  const isUncategorized = category === 'Uncategorized';
  
  const displayText = subcategory ? `${category} → ${subcategory}` : category;
  
  if (isUncategorized) {
    return React.createElement('span', {
      style: {
        color: '#ff9800',
        fontWeight: 'bold',
        backgroundColor: '#fff3e0',
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '0.9em'
      },
      title: 'This transaction needs manual categorization'
    }, `⚠️ ${displayText}`);
  }
  
  return displayText;
};

const ConfidenceCellRenderer = (params: any) => {
  const confidence = params.value;
  if (!confidence) return '';
  
  const percentage = Math.round(confidence * 100);
  const isLowConfidence = percentage < 70;
  const className = percentage >= 80 ? 'high' : percentage >= 60 ? 'medium' : 'low';
  
  const displayText = `${percentage}%`;
  
  if (isLowConfidence) {
    return React.createElement('span', {
      className: `confidence ${className}`,
      style: {
        backgroundColor: '#ffebee',
        color: '#c62828',
        fontWeight: 'bold',
        border: '1px solid #f8bbd9'
      },
      title: 'Low confidence - consider manual review'
    }, `⚠️ ${displayText}`);
  }
  
  return React.createElement('span', {
    className: `confidence ${className}`
  }, displayText);
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
  const [loading, setLoading] = useState(true);
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [filters, setFilters] = useState({
    category: '',
    type: '',
    dateFrom: '',
    dateTo: '',
    account: '',
    search: ''
  });

  // Form state for adding/editing transactions
  const [transactionForm, setTransactionForm] = useState({
    description: '',
    amount: '',
    category: '',
    subcategory: '',
    account: '',
    type: 'expense' as 'income' | 'expense',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  // Column definitions for AG Grid
  const columnDefs: ColDef[] = [
    {
      headerName: '',
      width: 50,
      checkboxSelection: true,
      headerCheckboxSelection: true,
      pinned: 'left'
    },
    {
      headerName: 'Date',
      field: 'date',
      sortable: true,
      filter: 'agDateColumnFilter',
      width: 120,
      editable: true,
      cellEditor: 'agDateCellEditor',
      valueFormatter: (params: any) => {
        return new Date(params.value).toLocaleDateString();
      },
      valueSetter: (params: any) => {
        params.data.date = new Date(params.newValue);
        return true;
      }
    },
    {
      headerName: 'Description',
      field: 'description',
      sortable: true,
      filter: 'agTextColumnFilter',
      flex: 2,
      minWidth: 200,
      editable: true,
      cellEditor: 'agTextCellEditor'
    },
    {
      headerName: 'Category',
      field: 'category',
      sortable: true,
      filter: 'agTextColumnFilter',
      width: 180,
      cellRenderer: CategoryCellRenderer,
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: [] // Will be populated dynamically
      }
    },
    {
      headerName: 'Account',
      field: 'account',
      sortable: true,
      filter: 'agTextColumnFilter',
      width: 140,
      editable: true,
      cellEditor: 'agTextCellEditor'
    },
    {
      headerName: 'Amount',
      field: 'amount',
      sortable: true,
      filter: 'agNumberColumnFilter',
      width: 120,
      cellRenderer: AmountCellRenderer,
      type: 'rightAligned',
      editable: true,
      cellEditor: 'agNumberCellEditor',
      cellEditorParams: {
        precision: 2
      }
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
      },
      editable: true,
      cellEditor: 'agCheckboxCellEditor'
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

  // Load transactions on component mount
  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    console.log('📥 loadTransactions started...');
    setLoading(true);
    try {
      const data = await dataService.getAllTransactions();
      console.log(`📊 loadTransactions: Retrieved ${data.length} transactions from dataService`);
      console.log(`📊 Sample transactions:`, data.slice(0, 2).map(t => ({ id: t.id, description: t.description, amount: t.amount })));
      setTransactions(data);
      setFilteredTransactions(data);
      console.log(`✅ loadTransactions: State updated with ${data.length} transactions`);
    } catch (error) {
      console.error('❌ Failed to load transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Apply filters when filters or transactions change
  useEffect(() => {
    let filtered = [...transactions];

    // Apply category filter
    if (filters.category) {
      filtered = filtered.filter(t => t.category === filters.category);
    }

    // Apply type filter
    if (filters.type) {
      filtered = filtered.filter(t => t.type === filters.type);
    }

    // Apply account filter
    if (filters.account) {
      filtered = filtered.filter(t => t.account === filters.account);
    }

    // Apply date filters
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filtered = filtered.filter(t => t.date >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      filtered = filtered.filter(t => t.date <= toDate);
    }

    // Apply search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(t => 
        t.description.toLowerCase().includes(searchTerm) ||
        t.category.toLowerCase().includes(searchTerm) ||
        t.subcategory?.toLowerCase().includes(searchTerm) ||
        t.additionalNotes?.toLowerCase().includes(searchTerm)
      );
    }

    setFilteredTransactions(filtered);
  }, [transactions, filters]);

  // Get unique values for filter dropdowns
  const uniqueCategories = Array.from(new Set(transactions.map(t => t.category))).sort();
  const uniqueAccounts = Array.from(new Set(transactions.map(t => t.account).filter(Boolean))).sort() as string[];

  // Calculate statistics
  const stats = {
    totalIncome: filteredTransactions.filter(t => t.type === 'income' || t.amount > 0).reduce((sum, t) => sum + Math.abs(t.amount), 0),
    totalExpenses: filteredTransactions.filter(t => t.type === 'expense' || t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0),
    count: filteredTransactions.length,
    get netAmount() { return this.totalIncome - this.totalExpenses; }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const handleImportComplete = async (importedCount: number) => {
    console.log(`🔄 handleImportComplete called with ${importedCount} transactions`);
    
    // Add a small delay to ensure the dataService has completed saving
    setTimeout(async () => {
      try {
        console.log(`📊 Before reload - Current state has ${transactions.length} transactions`);
        
        await loadTransactions();
        console.log(`🔄 loadTransactions completed`);
        
        // Force a re-render by updating state
        const freshData = await dataService.getAllTransactions();
        console.log(`📊 Fresh data from dataService: ${freshData.length} transactions`);
        console.log(`📊 First few transactions:`, freshData.slice(0, 3).map(t => ({ id: t.id, description: t.description })));
        
        setTransactions(freshData);
        setFilteredTransactions(freshData);
        
        console.log(`✅ State updated - should now show ${freshData.length} transactions`);
      } catch (error) {
        console.error('❌ Failed to reload transactions after import:', error);
      }
    }, 500);
  };

  // Handle cell value changes (inline editing)
  const onCellValueChanged = async (params: any) => {
    try {
      await dataService.updateTransaction(params.data.id, {
        [params.colDef.field]: params.newValue
      });
      console.log(`Updated ${params.colDef.field} for transaction ${params.data.id}`);
    } catch (error) {
      console.error('Failed to update transaction:', error);
      // Revert the change
      params.node.setDataValue(params.colDef.field, params.oldValue);
    }
  };

  // Handle row selection
  const onSelectionChanged = (params: any) => {
    const selectedNodes = params.api.getSelectedNodes();
    const selectedIds = selectedNodes.map((node: any) => node.data.id);
    setSelectedTransactions(selectedIds);
  };

  // Bulk operations
  const handleBulkDelete = async () => {
    if (selectedTransactions.length === 0) return;
    
    if (window.confirm(`Delete ${selectedTransactions.length} selected transactions?`)) {
      try {
        await dataService.deleteTransactions(selectedTransactions);
        await loadTransactions();
        setSelectedTransactions([]);
      } catch (error) {
        console.error('Failed to delete transactions:', error);
      }
    }
  };

  const handleBulkCategoryChange = async (newCategory: string) => {
    if (selectedTransactions.length === 0) return;
    
    try {
      for (const id of selectedTransactions) {
        await dataService.updateTransaction(id, { category: newCategory });
      }
      await loadTransactions();
      setSelectedTransactions([]);
    } catch (error) {
      console.error('Failed to update transaction categories:', error);
    }
  };

  // Quick add functionality
  const handleQuickAdd = async () => {
    if (!transactionForm.description || !transactionForm.amount) {
      alert('Please fill in required fields');
      return;
    }

    try {
      const newTransaction = {
        description: transactionForm.description,
        amount: transactionForm.type === 'expense' ? -Math.abs(Number(transactionForm.amount)) : Math.abs(Number(transactionForm.amount)),
        category: transactionForm.category || 'Uncategorized',
        subcategory: transactionForm.subcategory,
        account: transactionForm.account || 'Default',
        type: transactionForm.type,
        date: new Date(transactionForm.date),
        additionalNotes: transactionForm.notes,
        confidence: 1.0, // Manual entry gets full confidence
        reasoning: 'Manually entered transaction',
        isVerified: true
      };

      await dataService.addTransaction(newTransaction);
      await loadTransactions();
      
      // Reset form
      setTransactionForm({
        description: '',
        amount: '',
        category: '',
        subcategory: '',
        account: '',
        type: 'expense',
        date: new Date().toISOString().split('T')[0],
        notes: ''
      });
      
      setShowQuickAddModal(false);
    } catch (error) {
      console.error('Failed to add transaction:', error);
    }
  };

  // Handle action button clicks in grid
  const onGridReady = useCallback((params: GridReadyEvent) => {
    // Add event listeners for action buttons
    params.api.addEventListener('cellClicked', (event: any) => {
      if (event.event.target.classList.contains('edit-btn')) {
        const transactionId = event.event.target.dataset.id;
        const transaction = transactions.find(t => t.id === transactionId);
        if (transaction) {
          setEditingTransaction(transaction);
          setTransactionForm({
            description: transaction.description,
            amount: Math.abs(transaction.amount).toString(),
            category: transaction.category,
            subcategory: transaction.subcategory || '',
            account: transaction.account || '',
            type: transaction.type || 'expense',
            date: new Date(transaction.date).toISOString().split('T')[0],
            notes: transaction.additionalNotes || ''
          });
          setShowQuickAddModal(true);
        }
      } else if (event.event.target.classList.contains('delete-btn')) {
        const transactionId = event.event.target.dataset.id;
        if (window.confirm('Delete this transaction?')) {
          handleDeleteTransaction(transactionId);
        }
      }
    });
  }, [transactions]);

  const handleDeleteTransaction = async (id: string) => {
    try {
      await dataService.deleteTransaction(id);
      await loadTransactions();
    } catch (error) {
      console.error('Failed to delete transaction:', error);
    }
  };

  const startEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setTransactionForm({
      description: transaction.description,
      amount: Math.abs(transaction.amount).toString(),
      category: transaction.category,
      subcategory: transaction.subcategory || '',
      account: transaction.account || '',
      type: transaction.type || 'expense',
      date: new Date(transaction.date).toISOString().split('T')[0],
      notes: transaction.additionalNotes || ''
    });
    setShowQuickAddModal(true);
  };

  const handleEditTransaction = async () => {
    if (!editingTransaction || !transactionForm.description || !transactionForm.amount) {
      alert('Please fill in required fields');
      return;
    }

    try {
      const updates = {
        description: transactionForm.description,
        amount: transactionForm.type === 'expense' ? -Math.abs(Number(transactionForm.amount)) : Math.abs(Number(transactionForm.amount)),
        category: transactionForm.category || 'Uncategorized',
        subcategory: transactionForm.subcategory,
        account: transactionForm.account || 'Default',
        type: transactionForm.type,
        date: new Date(transactionForm.date),
        additionalNotes: transactionForm.notes,
      };

      await dataService.updateTransaction(editingTransaction.id, updates);
      await loadTransactions();
      
      setEditingTransaction(null);
      setShowQuickAddModal(false);
    } catch (error) {
      console.error('Failed to update transaction:', error);
    }
  };

  // Handle template usage
  const handleUseTemplate = (template: any) => {
    setTransactionForm({
      description: template.description,
      amount: Math.abs(template.amount).toString(),
      category: template.category,
      subcategory: template.subcategory || '',
      account: template.account,
      type: template.type,
      date: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setShowQuickAddModal(true);
  };

  const handleExportCSV = async () => {
    try {
      const csvData = await dataService.exportToCSV();
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export transactions:', error);
    }
  };

  const handleExportJSON = async () => {
    try {
      const jsonData = await dataService.exportToJSON();
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `transactions-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export transactions:', error);
    }
  };

  const clearFilters = () => {
    setFilters({
      category: '',
      type: '',
      dateFrom: '',
      dateTo: '',
      account: '',
      search: ''
    });
  };

  if (loading) {
    return (
      <div>
        <PageHeader>
          <h1>💳 Transactions</h1>
        </PageHeader>
        <Card>
          <p>Loading transactions...</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader>
        <h1>💳 Transactions (Updated)</h1>
        <FlexBox>
          <span>{transactions.length} total transactions</span>
        </FlexBox>
      </PageHeader>

      <FileImport onImportComplete={handleImportComplete} />

      <ActionsBar>
        <ExportButton onClick={handleExportCSV}>
          📄 Export CSV
        </ExportButton>
        <ExportButton onClick={handleExportJSON}>
          📄 Export JSON
        </ExportButton>
        <Button onClick={() => setShowQuickAddModal(true)}>
          ➕ Add Transaction
        </Button>
        <Button onClick={() => setShowAnalytics(!showAnalytics)}>
          📊 {showAnalytics ? 'Hide' : 'Show'} Analytics
        </Button>
        <Button onClick={() => setShowTemplates(!showTemplates)}>
          🔖 {showTemplates ? 'Hide' : 'Show'} Templates
        </Button>
        <Button onClick={clearFilters}>
          🗑️ Clear Filters
        </Button>
      </ActionsBar>

      {selectedTransactions.length > 0 && (
        <BulkActionsBar>
          <span className="selection-info">
            {selectedTransactions.length} transactions selected
          </span>
          <Button onClick={handleBulkDelete} variant="outline">
            🗑️ Delete Selected
          </Button>
          <select onChange={(e) => e.target.value && handleBulkCategoryChange(e.target.value)}>
            <option value="">Change Category...</option>
            {uniqueCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </BulkActionsBar>
      )}

      {showAnalytics && (
        <TransactionAnalytics transactions={transactions} />
      )}

      {showTemplates && (
        <TransactionTemplates 
          onUseTemplate={handleUseTemplate}
          uniqueCategories={uniqueCategories}
          uniqueAccounts={uniqueAccounts}
        />
      )}

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
            <label>From Date</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
            />
          </div>

          <div className="filter-group">
            <label>To Date</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
            />
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
        </div>
        
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            style={{
              padding: '6px 12px',
              fontSize: '14px',
              border: filters.category === 'Uncategorized' ? '2px solid #ff9800' : '1px solid #ddd',
              background: filters.category === 'Uncategorized' ? '#fff3e0' : 'white',
              color: filters.category === 'Uncategorized' ? '#ff9800' : '#666',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: filters.category === 'Uncategorized' ? 'bold' : 'normal'
            }}
            onClick={() => setFilters({...filters, category: filters.category === 'Uncategorized' ? '' : 'Uncategorized'})}
            title="Show only transactions that need manual categorization"
          >
            ⚠️ Uncategorized ({transactions.filter(t => t.category === 'Uncategorized').length})
          </button>
          
          <button
            style={{
              padding: '6px 12px',
              fontSize: '14px',
              border: '1px solid #ddd',
              background: 'white',
              color: '#666',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            onClick={() => setFilters({ category: '', type: '', account: '', dateFrom: '', dateTo: '', search: '' })}
            title="Clear all filters"
          >
            Clear Filters
          </button>
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
          <div className="label">Filtered Results</div>
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
              onCellValueChanged={onCellValueChanged}
              onSelectionChanged={onSelectionChanged}
              rowSelection="multiple"
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

      {/* Quick Add/Edit Modal */}
      {showQuickAddModal && (
        <QuickAddModal onClick={(e) => e.target === e.currentTarget && setShowQuickAddModal(false)}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingTransaction ? 'Edit Transaction' : 'Add New Transaction'}</h3>
              <Button onClick={() => {
                setShowQuickAddModal(false);
                setEditingTransaction(null);
              }}>
                ✕
              </Button>
            </div>
            
            <div className="form-group">
              <label>Description *</label>
              <input
                type="text"
                value={transactionForm.description}
                onChange={(e) => setTransactionForm({...transactionForm, description: e.target.value})}
                placeholder="Enter transaction description"
              />
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={transactionForm.amount}
                  onChange={(e) => setTransactionForm({...transactionForm, amount: e.target.value})}
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select
                  value={transactionForm.type}
                  onChange={(e) => setTransactionForm({...transactionForm, type: e.target.value as 'income' | 'expense'})}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Category</label>
                <select
                  value={transactionForm.category}
                  onChange={(e) => setTransactionForm({...transactionForm, category: e.target.value})}
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
                  onChange={(e) => setTransactionForm({...transactionForm, account: e.target.value})}
                >
                  <option value="">Select Account</option>
                  {uniqueAccounts.map(acc => (
                    <option key={acc} value={acc}>{acc}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                value={transactionForm.date}
                onChange={(e) => setTransactionForm({...transactionForm, date: e.target.value})}
              />
            </div>
            
            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={transactionForm.notes}
                onChange={(e) => setTransactionForm({...transactionForm, notes: e.target.value})}
                placeholder="Optional notes..."
              />
            </div>
            
            <div className="modal-actions">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowQuickAddModal(false);
                  setEditingTransaction(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={editingTransaction ? handleEditTransaction : handleQuickAdd}>
                {editingTransaction ? 'Update' : 'Add'} Transaction
              </Button>
            </div>
          </div>
        </QuickAddModal>
      )}
    </div>
  );
};

export default Transactions;

// Explicit module marker for TypeScript isolatedModules
export type {};
