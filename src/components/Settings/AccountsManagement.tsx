import React, { useState, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import styled from 'styled-components';
import { Card, Button, FlexBox } from '../../styles/globalStyles';
import { Account } from '../../types';
import { useAccountManagement } from '../../hooks/useAccountManagement';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

const AccountsContainer = styled.div`
  .ag-theme-alpine {
    height: 400px;
    width: 100%;
  }

  .stats-bar {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
    
    .stat-item {
      background: #f8f9fa;
      padding: 12px 16px;
      border-radius: 8px;
      text-align: center;
      
      .label {
        font-size: 0.85rem;
        color: #666;
        margin-bottom: 4px;
      }
      
      .value {
        font-size: 1.2rem;
        font-weight: 600;
        color: #333;
      }
    }
  }
`;

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
    
    input, select {
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

interface AccountsManagementProps {}

export const AccountsManagement: React.FC<AccountsManagementProps> = () => {
  const { accounts, addAccount, updateAccount } = useAccountManagement();
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountForm, setAccountForm] = useState({
    name: '',
    type: 'checking' as Account['type'],
    institution: '',
    balance: 0,
    isActive: true
  });

  const handleEditAccount = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      setEditingAccount(account);
      setAccountForm({
        name: account.name,
        type: account.type,
        institution: account.institution,
        balance: account.balance || 0,
        isActive: account.isActive
      });
      setShowEditModal(true);
    }
  };

  const handleAddAccount = () => {
    setEditingAccount(null);
    setAccountForm({
      name: '',
      type: 'checking',
      institution: '',
      balance: 0,
      isActive: true
    });
    setShowEditModal(true);
  };

  const handleSaveAccount = () => {
    if (editingAccount) {
      // Update existing account
      updateAccount(editingAccount.id, accountForm);
    } else {
      // Add new account
      addAccount(accountForm);
    }
    setShowEditModal(false);
    setEditingAccount(null);
  };

  const handleFormChange = (field: string, value: any) => {
    setAccountForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const columnDefs: ColDef[] = [
    {
      headerName: 'Name',
      field: 'name',
      flex: 1,
      cellRenderer: (params: any) => {
        const isActive = params.data.isActive;
        return `<span style="font-weight: ${isActive ? '600' : '400'}; color: ${isActive ? '#333' : '#999'}">${params.value}${!isActive ? ' (Inactive)' : ''}</span>`;
      }
    },
    {
      headerName: 'Type',
      field: 'type',
      width: 120,
      cellRenderer: (params: any) => {
        const typeColors = {
          checking: '#4caf50',
          savings: '#2196f3',
          credit: '#ff9800',
          investment: '#9c27b0',
          cash: '#795548'
        };
        const color = typeColors[params.value as keyof typeof typeColors] || '#666';
        return `<span style="background: ${color}; color: white; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; text-transform: capitalize;">${params.value}</span>`;
      }
    },
    {
      headerName: 'Institution',
      field: 'institution',
      width: 200
    },
    {
      headerName: 'Balance',
      field: 'balance',
      width: 150,
      cellRenderer: (params: any) => {
        const balance = params.value;
        if (balance === undefined || balance === null) return '';
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(balance);
        return `<span style="color: ${balance >= 0 ? '#4caf50' : '#f44336'}">${formatted}</span>`;
      }
    },
    {
      headerName: 'Status',
      field: 'isActive',
      width: 100,
      cellRenderer: (params: any) => {
        return params.value ? 
          '<span style="color: #4caf50;">✅ Active</span>' : 
          '<span style="color: #f44336;">❌ Inactive</span>';
      }
    },
    {
      headerName: 'Actions',
      width: 100,
      cellRenderer: (params: any) => {
        return `<button class="edit-account-btn" data-id="${params.data.id}" style="padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer;">Edit</button>`;
      }
    }
  ];

  const onGridReady = (params: any) => {
    params.api.addEventListener('cellClicked', (event: any) => {
      if (event.event.target.classList.contains('edit-account-btn')) {
        const accountId = event.event.target.dataset.id;
        handleEditAccount(accountId);
      }
    });
  };

  const stats = {
    totalAccounts: accounts.length,
    activeAccounts: accounts.filter(a => a.isActive).length,
    inactiveAccounts: accounts.filter(a => !a.isActive).length,
    bankAccounts: accounts.filter(a => ['checking', 'savings'].includes(a.type)).length
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3>Account Management</h3>
        <Button onClick={handleAddAccount}>Add Account</Button>
      </div>

      <div className="stats-bar">
        <div className="stat-item">
          <div className="label">Total Accounts</div>
          <div className="value">{stats.totalAccounts}</div>
        </div>
        <div className="stat-item">
          <div className="label">Active</div>
          <div className="value">{stats.activeAccounts}</div>
        </div>
        <div className="stat-item">
          <div className="label">Inactive</div>
          <div className="value">{stats.inactiveAccounts}</div>
        </div>
        <div className="stat-item">
          <div className="label">Bank Accounts</div>
          <div className="value">{stats.bankAccounts}</div>
        </div>
      </div>

      <AccountsContainer>
        <div className="ag-theme-alpine">
          <AgGridReact
            columnDefs={columnDefs}
            rowData={accounts}
            onGridReady={onGridReady}
            pagination={true}
            paginationPageSize={20}
            defaultColDef={{
              resizable: true,
              sortable: true
            }}
          />
        </div>
      </AccountsContainer>

      {/* Edit Account Modal */}
      {showEditModal && (
        <EditModalOverlay onClick={() => setShowEditModal(false)}>
          <EditModalContent onClick={(e) => e.stopPropagation()}>
            <h2>{editingAccount ? 'Edit Account' : 'Add Account'}</h2>
            
            <div className="form-row">
              <div className="form-group">
                <label>Account Name *</label>
                <input
                  type="text"
                  value={accountForm.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  placeholder="e.g., Chase Checking"
                />
              </div>

              <div className="form-group">
                <label>Account Type *</label>
                <select
                  value={accountForm.type}
                  onChange={(e) => handleFormChange('type', e.target.value)}
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="credit">Credit Card</option>
                  <option value="investment">Investment</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Institution *</label>
              <input
                type="text"
                value={accountForm.institution}
                onChange={(e) => handleFormChange('institution', e.target.value)}
                placeholder="e.g., Chase Bank"
              />
            </div>

            <div className="form-group">
              <label>Current Balance</label>
              <input
                type="number"
                step="0.01"
                value={accountForm.balance}
                onChange={(e) => handleFormChange('balance', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={accountForm.isActive}
                  onChange={(e) => handleFormChange('isActive', e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                Account is active
              </label>
            </div>

            <div className="form-actions">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveAccount}>
                {editingAccount ? 'Update' : 'Create'} Account
              </Button>
            </div>
          </EditModalContent>
        </EditModalOverlay>
      )}
    </div>
  );
};

export default AccountsManagement;
