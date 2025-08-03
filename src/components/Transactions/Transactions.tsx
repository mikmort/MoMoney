import React, { useState, useEffect, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridReadyEvent } from 'ag-grid-community';
import styled from 'styled-components';
import { Card, PageHeader, Button, FlexBox } from '../../styles/globalStyles';
import { Transaction } from '../../types';
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
  
  return subcategory ? `${category} → ${subcategory}` : category;
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
  const [filters, setFilters] = useState({
    category: '',
    type: '',
    dateFrom: '',
    dateTo: '',
    account: '',
    search: ''
  });

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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log('File selected:', file.name);
      // TODO: Implement file upload and AI parsing
    }
  };

  const applyFilters = useCallback(() => {
    let filtered = transactions.slice(); // Use slice() instead of spread

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
  }, [transactions, filters]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const calculateStats = () => {
    const totalIncome = filteredTransactions
      .filter((t: Transaction) => t.type === 'income')
      .reduce((sum: number, t: Transaction) => sum + t.amount, 0);
    
    const totalExpenses = filteredTransactions
      .filter((t: Transaction) => t.type === 'expense')
      .reduce((sum: number, t: Transaction) => sum + Math.abs(t.amount), 0);

    return {
      totalIncome,
      totalExpenses,
      netAmount: totalIncome - totalExpenses,
      count: filteredTransactions.length
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

  return (
    <div>
      <PageHeader>
        <h1>Transactions</h1>
        <FlexBox gap="12px">
          <Button variant="outline">Export</Button>
          <Button>Add Transaction</Button>
        </FlexBox>
      </PageHeader>

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
    </div>
  );
};

export default Transactions;
