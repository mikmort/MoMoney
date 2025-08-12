import React, { useState, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import styled from 'styled-components';
import { PageHeader, Card, Button, FlexBox, Badge } from '../../styles/globalStyles';
import { Budget, Category } from '../../types';
import { budgetService } from '../../services/budgetService';
import { dataService } from '../../services/dataService';
import { defaultCategories } from '../../data/defaultCategories';
import { useNotification } from '../../contexts/NotificationContext';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

const BudgetsContainer = styled.div`
  .ag-theme-alpine {
    height: 400px;
    width: 100%;
  }

  .budget-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .progress-bar {
    width: 100%;
    height: 10px;
    background-color: #e0e0e0;
    border-radius: 5px;
    overflow: hidden;
    margin: 8px 0;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .progress-fill {
    height: 100%;
    transition: width 0.3s ease;
    border-radius: 5px;
    background-image: linear-gradient(45deg, rgba(255, 255, 255, 0.15) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.15) 75%, transparent 75%, transparent);
    background-size: 20px 20px;
  }

  .progress-safe { background-color: #4CAF50; }
  .progress-warning { background-color: #FF9800; }
  .progress-danger { background-color: #F44336; }
  .progress-exceeded { background-color: #D32F2F; }
`;

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
  max-width: 500px;

  h2 {
    margin: 0 0 20px 0;
    color: #333;
    font-size: 1.5rem;
  }

  .form-group {
    margin-bottom: 16px;

    label {
      display: block;
      margin-bottom: 4px;
      font-weight: 500;
      color: #333;
    }

    input, select {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;

      &:focus {
        outline: none;
        border-color: #1976d2;
        box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2);
      }
    }

    .help-text {
      font-size: 0.9rem;
      color: #666;
      margin-top: 4px;
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

const BudgetProgressGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`;

const BudgetProgressCard = styled.div`
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border: 1px solid #e0e0e0;

  .category-name {
    font-weight: 600;
    font-size: 1.1rem;
    margin-bottom: 8px;
    color: #333;
  }

  .amounts {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    color: #666;
    margin-bottom: 8px;
  }

  .progress-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    margin-top: 8px;
    color: #666;
    
    .percentage-text {
      font-weight: 600;
      font-size: 0.9rem;
      color: #333;
    }
  }
`;

const Budgets: React.FC = () => {
  const { showAlert, showConfirmation } = useNotification();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [budgetForm, setBudgetForm] = useState({
    name: '',
    categoryId: '',
    amount: '',
    period: 'monthly' as Budget['period'],
    alertThreshold: '80',
    isActive: true,
  });
  const [budgetProgress, setBudgetProgress] = useState<any[]>([]);

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const budgetData = budgetService.getAllBudgets();
      const transactionData = await dataService.getAllTransactions();
      
      // Load categories from localStorage or use defaults
      let categoriesData = defaultCategories;
      const savedCategories = localStorage.getItem('mo-money-categories');
      if (savedCategories) {
        try {
          categoriesData = JSON.parse(savedCategories);
        } catch (error) {
          console.error('Failed to load categories from localStorage:', error);
        }
      }
      
      setBudgets(budgetData);
      setCategories(categoriesData);

      // Calculate budget progress
      const progress = budgetService.getBudgetProgressForAll(transactionData, categoriesData);
      setBudgetProgress(progress);
    } catch (error) {
      console.error('Failed to load budget data:', error);
    }
  };

  // Grid column definitions
  const columnDefs: ColDef[] = [
    {
      field: 'name',
      headerName: 'Budget Name',
      flex: 2,
      minWidth: 200,
      cellRenderer: (params: any) => (
        <span 
          onClick={() => handleEditBudget(params.data)}
          style={{ 
            cursor: 'pointer', 
            color: '#1976d2', 
            textDecoration: 'none',
            fontWeight: 600
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.textDecoration = 'underline';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.textDecoration = 'none';
          }}
        >
          {params.value}
        </span>
      ),
    },
    {
      field: 'categoryName',
      headerName: 'Category',
      flex: 1.5,
      minWidth: 150,
      valueGetter: (params) => {
        const category = categories.find(c => c.id === params.data.categoryId);
        return category?.name || 'Unknown Category';
      },
    },
    {
      field: 'amount',
      headerName: 'Budget Amount',
      flex: 1,
      minWidth: 120,
      valueFormatter: (params) => {
        // Use a simple formatting since formatAmount is async
        const formatter = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        });
        return formatter.format(params.value);
      },
    },
    {
      field: 'period',
      headerName: 'Period',
      flex: 1,
      minWidth: 100,
      valueFormatter: (params) => params.value.charAt(0).toUpperCase() + params.value.slice(1),
    },
    {
      field: 'isActive',
      headerName: 'Status',
      flex: 1,
      minWidth: 100,
      cellRenderer: (params: any) => {
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            {params.value ? (
              <span title="Active Budget">✅</span>
            ) : (
              <span title="Inactive Budget">❌</span>
            )}
          </div>
        );
      },
    },
    {
      field: 'alertThreshold',
      headerName: 'Alert at',
      flex: 1,
      minWidth: 100,
      valueFormatter: (params) => params.value ? `${params.value}%` : 'No Alert',
    },
    {
      headerName: 'Actions',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => (
        <FlexBox gap="8px" style={{ justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <Button 
            variant="outline" 
            onClick={() => handleEditBudget(params.data)}
            style={{ padding: '4px 8px', fontSize: '12px' }}
          >
            Edit
          </Button>
          <Button 
            variant="secondary" 
            onClick={() => handleDeleteBudget(params.data.id)}
            style={{ padding: '4px 8px', fontSize: '12px' }}
          >
            Delete
          </Button>
        </FlexBox>
      ),
      cellStyle: { display: 'flex', alignItems: 'center' }
    },
  ];

  const handleCreateBudget = () => {
    setBudgetForm({
      name: '',
      categoryId: '',
      amount: '',
      period: 'monthly',
      alertThreshold: '80',
      isActive: true,
    });
    setEditingBudget(null);
    setShowCreateModal(true);
  };

  const handleEditBudget = (budget: Budget) => {
    setBudgetForm({
      name: budget.name,
      categoryId: budget.categoryId,
      amount: budget.amount.toString(),
      period: budget.period,
      alertThreshold: budget.alertThreshold?.toString() || '80',
      isActive: budget.isActive,
    });
    setEditingBudget(budget);
    setShowCreateModal(true);
  };

  const handleSaveBudget = () => {
    if (!budgetForm.name || !budgetForm.categoryId || !budgetForm.amount) {
      showAlert('error', 'Please fill in all required fields');
      return;
    }

    const budgetData: Omit<Budget, 'id'> = {
      name: budgetForm.name,
      categoryId: budgetForm.categoryId,
      amount: parseFloat(budgetForm.amount),
      period: budgetForm.period,
      startDate: new Date(), // Start from current date
      isActive: budgetForm.isActive,
      alertThreshold: budgetForm.alertThreshold ? parseFloat(budgetForm.alertThreshold) : undefined,
    };

    try {
      if (editingBudget) {
        budgetService.updateBudget(editingBudget.id, budgetData);
      } else {
        budgetService.createBudget(budgetData);
      }
      
      loadData(); // Refresh data
      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to save budget:', error);
      showAlert('error', 'Failed to save budget');
    }
  };

  const handleDeleteBudget = async (budgetId: string) => {
    const confirmed = await showConfirmation('Are you sure you want to delete this budget?', {
      title: 'Delete Budget',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true
    });
    
    if (confirmed) {
      try {
        budgetService.deleteBudget(budgetId);
        loadData(); // Refresh data
      } catch (error) {
        console.error('Failed to delete budget:', error);
        showAlert('error', 'Failed to delete budget');
      }
    }
  };

  const getExpenseCategories = () => {
    return categories.filter(c => c.type === 'expense');
  };

  const renderProgressBar = (progress: any) => {
    const percentage = Math.min(progress.percentage, 100);
    return (
      <div className="progress-bar">
        <div 
          className={`progress-fill progress-${progress.status}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    );
  };

  return (
    <div>
      <PageHeader>
        <h1>🎯 Budgets</h1>
      </PageHeader>

      {/* Budget Progress Overview */}
      {budgetProgress.length > 0 && (
        <Card>
          <h3>Budget Progress - {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
          <BudgetProgressGrid>
            {budgetProgress.map((progress) => (
              <BudgetProgressCard key={progress.budgetId}>
                <div className="category-name">{progress.categoryName}</div>
                <div className="amounts">
                  <span>Spent: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(progress.actualSpent)}</span>
                  <span>Budget: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(progress.budgetAmount)}</span>
                </div>
                {renderProgressBar(progress)}
                <div className="progress-info">
                  <span className="percentage-text">{progress.percentage.toFixed(1)}% used</span>
                  <Badge variant={
                    progress.status === 'safe' ? 'success' :
                    progress.status === 'warning' ? 'warning' :
                    progress.status === 'danger' ? 'warning' : 'error'
                  }>
                    {progress.status === 'exceeded' ? 'Over Budget' :
                     progress.status === 'danger' ? 'Near Limit' :
                     progress.status === 'warning' ? 'On Track' : 'Good'}
                  </Badge>
                </div>
                {progress.remaining >= 0 && (
                  <div className="progress-info">
                    <span>Remaining: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(progress.remaining)}</span>
                    <span>{progress.daysRemaining} days left</span>
                  </div>
                )}
              </BudgetProgressCard>
            ))}
          </BudgetProgressGrid>
        </Card>
      )}

      {/* Budget Management Table */}
      <Card>
        <div className="budget-header">
          <Button onClick={handleCreateBudget}>
            Create Budget
          </Button>
        </div>
        <div style={{ marginTop: '20px' }}>
          <BudgetsContainer>
            <div className="ag-theme-alpine">
              <AgGridReact
                columnDefs={columnDefs}
                rowData={budgets}
                animateRows={true}
                defaultColDef={{
                  sortable: true,
                  filter: true,
                  resizable: true,
                }}
                domLayout="autoHeight"
              />
            </div>
          </BudgetsContainer>
        </div>
      </Card>

      {/* Create/Edit Budget Modal */}
      {showCreateModal && (
        <ModalOverlay onClick={() => setShowCreateModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <h2>{editingBudget ? 'Edit Budget' : 'Create Budget'}</h2>
            
            <div className="form-group">
              <label>Budget Name *</label>
              <input
                type="text"
                value={budgetForm.name}
                onChange={(e) => setBudgetForm({...budgetForm, name: e.target.value})}
                placeholder="e.g., Monthly Food Budget"
              />
            </div>

            <div className="form-group">
              <label>Category *</label>
              <select
                value={budgetForm.categoryId}
                onChange={(e) => setBudgetForm({...budgetForm, categoryId: e.target.value})}
              >
                <option value="">Select a category</option>
                {getExpenseCategories().map(category => (
                  <option key={category.id} value={category.id}>
                    {category.icon} {category.name}
                  </option>
                ))}
              </select>
              <div className="help-text">Only expense categories can have budgets</div>
            </div>

            <div className="form-group">
              <label>Budget Amount *</label>
              <input
                type="number"
                value={budgetForm.amount}
                onChange={(e) => setBudgetForm({...budgetForm, amount: e.target.value})}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>

            <div className="form-group">
              <label>Period *</label>
              <select
                value={budgetForm.period}
                onChange={(e) => setBudgetForm({...budgetForm, period: e.target.value as Budget['period']})}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div className="form-group">
              <label>Alert Threshold (%)</label>
              <input
                type="number"
                value={budgetForm.alertThreshold}
                onChange={(e) => setBudgetForm({...budgetForm, alertThreshold: e.target.value})}
                placeholder="80"
                min="0"
                max="100"
              />
              <div className="help-text">Get notified when spending reaches this percentage</div>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', whiteSpace: 'nowrap', flexWrap: 'nowrap', justifyContent: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={budgetForm.isActive}
                  onChange={(e) => setBudgetForm({...budgetForm, isActive: e.target.checked})}
                  style={{ marginBottom: '0', flexShrink: 0 }}
                />
                Active Budget
              </label>
              <div className="help-text">Only active budgets are tracked and show alerts</div>
            </div>

            <div className="form-actions">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveBudget}>
                {editingBudget ? 'Update' : 'Create'} Budget
              </Button>
            </div>
          </ModalContent>
        </ModalOverlay>
      )}
    </div>
  );
};

export default Budgets;
