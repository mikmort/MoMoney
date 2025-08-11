import React, { useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '../../styles/globalStyles';
import { Account, AccountStatementAnalysisResponse, MultipleAccountAnalysisResponse } from '../../types';
import { useAccountManagement } from '../../hooks/useAccountManagement';
import { userPreferencesService } from '../../services/userPreferencesService';
import { accountManagementService } from '../../services/accountManagementService';
import BalanceHistoryModal from '../Accounts/BalanceHistoryModal';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

const AccountsContainer = styled.div`
  margin-top: 8px;
  position: relative;
  z-index: 0; /* create stacking context below header */

  .ag-theme-alpine {
    padding-top: 4px; /* avoid edge contact with header */
    height: 85vh; /* expand to use more vertical space */
    min-height: 600px; /* ensure it's comfortably tall on small screens */
    width: 100%;
    position: relative;
    z-index: 1; /* keep grid below header's z-index 100 */
  }
`;

// Header area above the grid; no sticky background to avoid visual rectangle
const HeaderBar = styled.div`
  position: relative;
  z-index: 19990; /* above grid, below modal overlay (20000) */
  pointer-events: auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
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
  z-index: 20000;
`;

const EditModalContent = styled.div`
  background: white;
  border-radius: 8px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
  z-index: 20001;

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

const UploadSection = styled.div`
  border: 2px dashed #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 0;
  text-align: center;
  background: #fafafa;

  &.dragover {
    border-color: #2196f3;
    background: #e3f2fd;
  }

  p {
    margin: 8px 0;
    color: #666;
  }

  .upload-note {
    font-size: 0.9em;
    color: #888;
    margin-top: 16px;
  }
`;

const AnalysisResult = styled.div`
  margin: 20px 0;
  padding: 16px;
  border-radius: 8px;
  background: #f5f5f5;

  .confidence {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.9em;
    font-weight: 500;
    margin-left: 8px;
  }

  .confidence.high { background: #c8e6c9; color: #2e7d32; }
  .confidence.medium { background: #fff3e0; color: #f57c00; }
  .confidence.low { background: #ffebee; color: #d32f2f; }

  .extracted-fields {
    margin-top: 12px;
    font-size: 0.9em;
    color: #666;
  }

  .reasoning {
    margin-top: 12px;
    font-style: italic;
    color: #555;
  }
`;

interface AccountsManagementProps {}

export const AccountsManagement: React.FC<AccountsManagementProps> = () => {
  const navigate = useNavigate();
  const { accounts, addAccount, updateAccount, deleteAccount, error, refreshAccounts } = useAccountManagement();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({
    name: '',
    type: 'checking' as Account['type'],
    institution: '',
    currency: 'USD',
    balance: 0,
    isActive: true
  });

  // Account creation choice modal
  const [showAccountCreationChoice, setShowAccountCreationChoice] = useState(false);

  // Statement upload functionality
  const [showStatementUpload, setShowStatementUpload] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AccountStatementAnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Multiple account detection
  const [multipleAccountsResult, setMultipleAccountsResult] = useState<MultipleAccountAnalysisResponse | null>(null);
  const [showMultipleAccountsDialog, setShowMultipleAccountsDialog] = useState(false);
  const [selectedAccountsForCreation, setSelectedAccountsForCreation] = useState<number[]>([]);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string>('');

  // Balance history modal
  const [showBalanceHistoryModal, setShowBalanceHistoryModal] = useState(false);
  const [selectedAccountForHistory, setSelectedAccountForHistory] = useState<Account | null>(null);

  const sanitizeReasoning = (reason?: string): string => {
    if (!reason) return '';
    const lower = reason.toLowerCase();
    const flagged = ['encrypted', 'unreadable', 'corrupted', 'gibberish', 'nonsensical'];
    if (flagged.some(w => lower.includes(w))) {
      return 'Insufficient readable text was available from this file in the browser context. The analysis relied on the filename and any readable snippets; confidence is adjusted accordingly.';
    }
    return reason;
  };

  const handleDeleteAccount = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      setDeletingAccount(account);
      setShowDeleteModal(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (deletingAccount) {
      setDeleteError(null);
      const success = await deleteAccount(deletingAccount.id);
      if (success) {
        setShowDeleteModal(false);
        setDeletingAccount(null);
      } else {
        // Show the error message from the hook
        setDeleteError(error || 'Failed to delete account. It may have associated transactions.');
      }
    }
  };

  const handleEditAccount = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    if (account) {
      setEditingAccount(account);
      setAccountForm({
        name: account.name,
        type: account.type,
        institution: account.institution,
        currency: account.currency,
        balance: account.balance || 0,
        isActive: account.isActive
      });
      setShowEditModal(true);
    }
  };

  // Handle single "Add Account" button click - show choice modal
  // Stop propagation and defer state change to avoid immediate overlay onClick closing it
  const handleAddAccountClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Defer to next tick so the originating click doesn't bubble into the new overlay
    setTimeout(() => setShowAccountCreationChoice(true), 0);
  };

  const handleAddAccount = () => {
    setEditingAccount(null);
    setAccountForm({
      name: '',
      type: 'checking',
      institution: '',
      currency: 'USD',
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

  // Handle choice: Create from Statement
  const handleChoiceCreateFromStatement = () => {
    setShowAccountCreationChoice(false);
    setShowStatementUpload(true);
    setUploadedFile(null);
    setAnalysisResult(null);
  };

  // Handle choice: Add Manually  
  const handleChoiceAddManually = () => {
    setShowAccountCreationChoice(false);
    handleAddAccount();
  };

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file);
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setMultipleAccountsResult(null);

    try {
      // Use new multiple account detection
      const result = await accountManagementService.detectMultipleAccountsFromStatement(file);
      
      if (result.success) {
        if (result.accounts && result.accounts.length > 0) {
          // Accounts were successfully created automatically (single account with high confidence)
          setShowStatementUpload(false);
          refreshAccounts();
        } else if (result.multipleAccountsResult) {
          // Multiple accounts detected or needs user review
          setMultipleAccountsResult(result.multipleAccountsResult);
          
          // Check for warning
          if (result.warning) {
            setWarningMessage(result.warning);
            setShowWarningDialog(true);
          } else {
            // Show multiple accounts dialog directly
            setShowMultipleAccountsDialog(true);
            // Pre-select all accounts by default
            setSelectedAccountsForCreation(
              result.multipleAccountsResult.accounts.map((_, index) => index)
            );
          }
        }
      } else {
        // Error occurred, show error message
        setAnalysisResult({
          confidence: 0,
          reasoning: result.error || 'Failed to process statement',
          extractedFields: []
        });
      }
    } catch (error) {
      console.error('Error processing statement:', error);
      setAnalysisResult({
        confidence: 0,
        reasoning: 'Failed to process statement: ' + (error instanceof Error ? error.message : 'Unknown error'),
        extractedFields: []
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleCreateAccountFromAnalysis = () => {
    if (analysisResult) {
      // Create account with the form data (potentially modified by user)
      const newAccountData = {
        ...accountForm,
        maskedAccountNumber: analysisResult.maskedAccountNumber,
        historicalBalance: accountForm.balance,
  historicalBalanceDate: analysisResult.balanceDate,
  // Align with service: set lastSyncDate to the baseline date
  lastSyncDate: analysisResult.balanceDate
      };
      
      addAccount(newAccountData).then(() => {
        // Refresh to ensure the grid updates immediately
        refreshAccounts();
      });
      setShowStatementUpload(false);
      setAnalysisResult(null);
      setUploadedFile(null);
    }
  };

  const getConfidenceClass = (confidence: number) => {
    if (confidence >= 0.7) return 'high';
    if (confidence >= 0.4) return 'medium';
    return 'low';
  };

  // Handler for warning dialog confirmation
  const handleWarningConfirmation = () => {
    setShowWarningDialog(false);
    setShowMultipleAccountsDialog(true);
    // Pre-select all accounts by default
    if (multipleAccountsResult) {
      setSelectedAccountsForCreation(
        multipleAccountsResult.accounts.map((_, index) => index)
      );
    }
  };

  // Handler for warning dialog cancellation
  const handleWarningCancellation = () => {
    setShowWarningDialog(false);
    setShowStatementUpload(false);
    setMultipleAccountsResult(null);
    setUploadedFile(null);
  };

  // Handler for toggling account selection
  const handleAccountSelectionToggle = (index: number) => {
    setSelectedAccountsForCreation(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      } else {
        return [...prev, index];
      }
    });
  };

  // Handler for selecting/deselecting all accounts
  const handleSelectAllAccounts = () => {
    if (!multipleAccountsResult) return;
    
    if (selectedAccountsForCreation.length === multipleAccountsResult.accounts.length) {
      // Deselect all
      setSelectedAccountsForCreation([]);
    } else {
      // Select all
      setSelectedAccountsForCreation(
        multipleAccountsResult.accounts.map((_, index) => index)
      );
    }
  };

  // Handler for creating selected accounts
  const handleCreateSelectedAccounts = async () => {
    if (!multipleAccountsResult || selectedAccountsForCreation.length === 0) return;

    try {
      const result = await accountManagementService.createAccountsFromMultipleAnalysis(
        multipleAccountsResult,
        selectedAccountsForCreation
      );

      if (result.success && result.createdAccounts) {
        // Success - close dialog and refresh
        setShowMultipleAccountsDialog(false);
        setShowStatementUpload(false);
        setMultipleAccountsResult(null);
        setSelectedAccountsForCreation([]);
        setUploadedFile(null);
        refreshAccounts();

        // Show success message if there were errors
        if (result.errors && result.errors.length > 0) {
          console.warn('Some accounts failed to create:', result.errors);
        }
      } else {
        // Show errors
        console.error('Failed to create accounts:', result.errors);
      }
    } catch (error) {
      console.error('Error creating selected accounts:', error);
    }
  };

  // Handler for canceling multiple account creation
  const handleCancelMultipleAccounts = () => {
    setShowMultipleAccountsDialog(false);
    setShowStatementUpload(false);
    setMultipleAccountsResult(null);
    setSelectedAccountsForCreation([]);
    setUploadedFile(null);
  };

  const handleAccountClick = (accountName: string) => {
    // Navigate to transactions page with account filter
    navigate(`/transactions?account=${encodeURIComponent(accountName)}`);
  };

  const handleBalanceClick = (account: Account) => {
    // Show balance history modal instead of navigating
    setSelectedAccountForHistory(account);
    setShowBalanceHistoryModal(true);
  };

  const handleCloseBalanceHistory = () => {
    setShowBalanceHistoryModal(false);
    setSelectedAccountForHistory(null);
  };

  // React cell renderers
  const NameRenderer: React.FC<any> = (params) => {
    const isActive = params.data.isActive;
    const style: React.CSSProperties = { 
      fontWeight: isActive ? 600 : 400, 
      color: isActive ? '#2196f3' : '#999',
      cursor: 'pointer',
      textDecoration: 'none'
    };
    
    return (
      <span 
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          handleAccountClick(params.value);
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.textDecoration = 'underline';
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.textDecoration = 'none';
        }}
        title={`Click to view transactions for ${params.value}`}
      >
        {params.value}
        {!isActive ? ' (Inactive)' : ''}
      </span>
    );
  };

  const TypeRenderer: React.FC<any> = (params) => {
    const typeColors = {
      checking: '#4caf50',
      savings: '#2196f3',
      credit: '#ff9800',
      investment: '#9c27b0',
      cash: '#795548'
    } as const;
    const color = typeColors[params.value as keyof typeof typeColors] || '#666';
    const style: React.CSSProperties = { background: color, color: 'white', padding: '4px 8px', borderRadius: '12px', fontSize: '0.8rem', textTransform: 'capitalize' };
    return <span style={style}>{params.value}</span>;
  };

  const BalanceRenderer: React.FC<any> = (params) => {
    const [currentBalance, setCurrentBalance] = React.useState<number | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    
    React.useEffect(() => {
      const calculateBalance = async () => {
        setIsLoading(true);
        try {
          const balance = await accountManagementService.calculateCurrentBalance(params.data.id);
          setCurrentBalance(balance);
        } catch (error) {
          console.error('Error calculating balance:', error);
          setCurrentBalance(params.data.balance || 0);
        } finally {
          setIsLoading(false);
        }
      };
      
      calculateBalance();
    }, [
      params.data.id,
      params.data.balance,
      params.data.historicalBalance,
      params.data.historicalBalanceDate
    ]);

    if (isLoading) {
      return <span style={{ color: '#666', fontStyle: 'italic' }}>Loading...</span>;
    }

    if (currentBalance === null || currentBalance === undefined) return null;

    const currencyCode: string = params.data?.currency || 'USD';
    let formatted = '';

    // Try native Intl currency formatting first
    try {
      formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(currentBalance);
    } catch {
      // Fallback for unknown/unsupported currency codes
      const symbol = userPreferencesService.getCurrencySymbol(currencyCode);
      const abs = Math.abs(currentBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const sign = currentBalance < 0 ? '-' : '';
      // Place symbol before number by default; some currencies append, but keep simple here
      formatted = `${sign}${symbol}${abs}`;
    }

    const style: React.CSSProperties = { 
      color: currentBalance >= 0 ? '#4caf50' : '#f44336',
      cursor: 'pointer',
      textDecoration: 'none'
    };

    return (
      <span 
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          handleBalanceClick(params.data);
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.textDecoration = 'underline';
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.textDecoration = 'none';
        }}
        title={`Click to view balance history for ${params.data.name}`}
      >
        {formatted}
      </span>
    );
  };

  const LastUpdatedRenderer: React.FC<any> = (params) => {
    const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    
    React.useEffect(() => {
      const calculateLastUpdated = async () => {
        setIsLoading(true);
        try {
          const date = await accountManagementService.calculateLastUpdatedDate(params.data.id);
          setLastUpdated(date);
        } catch (error) {
          console.error('Error calculating last updated date:', error);
          setLastUpdated(null);
        } finally {
          setIsLoading(false);
        }
      };
      
      calculateLastUpdated();
    }, [params.data.id]);

    if (isLoading) {
      return <span style={{ color: '#666', fontStyle: 'italic' }}>Loading...</span>;
    }

    if (!lastUpdated) {
      return <span style={{ color: '#999', fontStyle: 'italic' }}>No transactions</span>;
    }

    const formattedDate = lastUpdated.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    return <span style={{ color: '#666' }}>{formattedDate}</span>;
  };

  const StatusRenderer: React.FC<any> = (params) => (
    params.value ? (
      <span style={{ color: '#4caf50' }}>✅ Active</span>
    ) : (
      <span style={{ color: '#f44336' }}>❌ Inactive</span>
    )
  );

  const ActionsRenderer: React.FC<any> = (params) => (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '100%' }}>
      <button
        className="edit-account-btn"
        data-id={params.data.id}
        onClick={(e) => {
          e.stopPropagation();
          handleEditAccount(params.data.id);
        }}
        style={{ 
          padding: '4px 8px', 
          border: '1px solid #ddd', 
          borderRadius: '4px', 
          background: 'white', 
          cursor: 'pointer',
          fontSize: '12px',
          height: '28px'
        }}
      >
        Edit
      </button>
      <button
        className="delete-account-btn"
        data-id={params.data.id}
        onClick={(e) => {
          e.stopPropagation();
          handleDeleteAccount(params.data.id);
        }}
        style={{ 
          padding: '4px 8px', 
          border: '1px solid #dc3545', 
          borderRadius: '4px', 
          background: '#dc3545',
          color: 'white',
          cursor: 'pointer',
          fontSize: '12px',
          height: '28px'
        }}
      >
        Delete
      </button>
    </div>
  );

  const columnDefs: ColDef[] = [
    {
      headerName: 'Name',
      field: 'name',
      flex: 1,
      minWidth: 120,
      cellRenderer: NameRenderer
    },
    {
      headerName: 'Type',
      field: 'type',
      width: 120,
      cellRenderer: TypeRenderer
    },
    {
      headerName: 'Institution',
      field: 'institution',
      width: 200
    },
    {
      headerName: 'Currency',
      field: 'currency',
      width: 100
    },
    {
      headerName: 'Balance',
      field: 'balance',
      width: 150,
      cellRenderer: BalanceRenderer
    },
    {
      headerName: 'Last Updated',
      field: 'lastUpdated',
      width: 140,
      cellRenderer: LastUpdatedRenderer
    },
    {
      headerName: 'Status',
      field: 'isActive',
      width: 100,
      cellRenderer: StatusRenderer
    },
    {
      headerName: 'Actions',
      width: 140,
      cellRenderer: ActionsRenderer,
      cellStyle: { display: 'flex', alignItems: 'center' }
    }
  ];

  const onGridReady = (_params: any) => {
    // No-op; actions are bound directly on buttons to avoid event delegation issues
  };

  return (
    <div>
      <HeaderBar>
        <h3 style={{ margin: 0 }}>Account Management</h3>
    <div style={{ display: 'flex', gap: '12px' }}>
          <Button
            type="button"
            onClick={(e) => handleAddAccountClick(e)}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = 'brightness(0.97)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = 'none')}
            style={{ position: 'relative', zIndex: 19991, pointerEvents: 'auto' }}
          >
            Add Account
          </Button>
        </div>
      </HeaderBar>

      <AccountsContainer>
        <div className="ag-theme-alpine">
          <AgGridReact
            columnDefs={columnDefs}
            rowData={accounts}
            onGridReady={onGridReady}
            pagination={true}
            paginationPageSize={20}
            paginationPageSizeSelector={[10, 20, 50, 100]}
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

            <div className="form-row">
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
                <label>Currency *</label>
                <select
                  value={accountForm.currency}
                  onChange={(e) => handleFormChange('currency', e.target.value)}
                >
                  {userPreferencesService.getCurrencyOptions().map(currency => (
                    <option key={currency.value} value={currency.value}>
                      {currency.label} ({currency.symbol})
                    </option>
                  ))}
                </select>
              </div>
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
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={accountForm.isActive}
                  onChange={(e) => handleFormChange('isActive', e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ marginLeft: '20px', cursor: 'pointer' }} onClick={() => handleFormChange('isActive', !accountForm.isActive)}>
                  Account is active
                </span>
              </div>
            </div>

            <div className="form-actions">
              <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSaveAccount}>
                {editingAccount ? 'Update' : 'Create'} Account
              </Button>
            </div>
          </EditModalContent>
        </EditModalOverlay>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deletingAccount && (
        <EditModalOverlay onClick={() => setShowDeleteModal(false)}>
          <EditModalContent onClick={(e) => e.stopPropagation()}>
            <h2>Delete Account</h2>
            
            <p style={{ marginBottom: '20px', color: '#666' }}>
              Are you sure you want to delete <strong>{deletingAccount.name}</strong>?
              This action cannot be undone.
            </p>

            <div style={{ 
              background: '#fff3cd',
              border: '1px solid #ffeaa7',
              borderRadius: '4px',
              padding: '12px',
              marginBottom: '20px'
            }}>
              <strong>⚠️ Warning:</strong> This will permanently remove the account from your records.
              Make sure this account has no associated transactions before proceeding.
            </div>

            {deleteError && (
              <div style={{ 
                background: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: '4px',
                padding: '12px',
                marginBottom: '20px',
                color: '#721c24'
              }}>
                <strong>Error:</strong> {deleteError}
              </div>
            )}

            <div className="form-actions">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleConfirmDelete}
                style={{ backgroundColor: '#dc3545', borderColor: '#dc3545' }}
              >
                Delete Account
              </Button>
            </div>
          </EditModalContent>
        </EditModalOverlay>
      )}

      {/* Account Creation Choice Modal */}
      {showAccountCreationChoice && (
        <EditModalOverlay onClick={() => setShowAccountCreationChoice(false)}>
          <EditModalContent onClick={(e) => e.stopPropagation()}>
            <h2>Add Account</h2>
            
            <p style={{ marginBottom: '24px', color: '#666', lineHeight: '1.5' }}>
              How would you like to create your new account?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Button 
                onClick={handleChoiceCreateFromStatement}
                style={{ 
                  padding: '16px 20px',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  background: '#f8f9fa',
                  border: '2px solid #e9ecef',
                  color: '#333'
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                    📄 Create account by uploading statement
                  </div>
                  <div style={{ fontSize: '0.9em', color: '#666' }}>
                    Upload a bank statement (PDF, CSV, Excel) and let AI extract account details automatically
                  </div>
                </div>
              </Button>

              <Button 
                onClick={handleChoiceAddManually}
                style={{ 
                  padding: '16px 20px',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  background: '#f8f9fa',
                  border: '2px solid #e9ecef',
                  color: '#333'
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                    ✏️ Add Account Manually
                  </div>
                  <div style={{ fontSize: '0.9em', color: '#666' }}>
                    Enter account information manually with a simple form
                  </div>
                </div>
              </Button>
            </div>

            <div className="form-actions">
              <Button type="button" variant="outline" onClick={() => setShowAccountCreationChoice(false)}>
                Cancel
              </Button>
            </div>
          </EditModalContent>
        </EditModalOverlay>
      )}

      {/* Statement Upload Modal */}
      {showStatementUpload && (
        <EditModalOverlay onClick={() => setShowStatementUpload(false)}>
          <EditModalContent onClick={(e) => e.stopPropagation()}>
            <h2>Create Account from Statement</h2>
            
            {!uploadedFile && (
              <UploadSection 
                className={dragOver ? 'dragover' : ''}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <p><strong>Upload a bank statement to automatically create an account</strong></p>
                <p>Drag & drop a statement file here, or</p>
                <Button as="label" variant="outline" style={{ cursor: 'pointer' }}>
                  Choose File
                  <input
                    type="file"
                    accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
                    onChange={handleFileInput}
                    style={{ display: 'none' }}
                  />
                </Button>
                <div className="upload-note">
                  <p>📋 Supported formats: PDF, CSV, Excel, Images</p>
                  <p>🔒 Account numbers are masked for security (only last 3 digits shown)</p>
                  <p>💡 AI will extract account name, institution, balance, and other details</p>
                </div>
              </UploadSection>
            )}

            {isAnalyzing && (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <p>🤖 Analyzing statement with AI...</p>
                <p>This may take a few moments...</p>
              </div>
            )}

            {analysisResult && (
              <>
                <AnalysisResult>
                  <h4>AI Analysis Result
                    <span className={`confidence ${getConfidenceClass(analysisResult.confidence)}`}>
                      {Math.round(analysisResult.confidence * 100)}% confidence
                    </span>
                  </h4>
                  
                  {analysisResult.extractedFields.length > 0 && (
                    <div className="extracted-fields">
                      <strong>Extracted:</strong> {analysisResult.extractedFields.join(', ')}
                    </div>
                  )}
                  
                  <div className="reasoning">{sanitizeReasoning(analysisResult.reasoning)}</div>
                </AnalysisResult>

                {analysisResult.confidence >= 0.3 && (
                  <>
                    <p><strong>Review and adjust the account details:</strong></p>
                    
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
                          onChange={(e) => handleFormChange('type', e.target.value as Account['type'])}
                        >
                          <option value="checking">Checking</option>
                          <option value="savings">Savings</option>
                          <option value="credit">Credit Card</option>
                          <option value="investment">Investment</option>
                          <option value="cash">Cash</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Institution *</label>
                        <input
                          type="text"
                          value={accountForm.institution}
                          onChange={(e) => handleFormChange('institution', e.target.value)}
                          placeholder="e.g., JPMorgan Chase Bank"
                        />
                      </div>
                      <div className="form-group">
                        <label>Currency</label>
                        <select
                          value={accountForm.currency}
                          onChange={(e) => handleFormChange('currency', e.target.value)}
                        >
                          {userPreferencesService.getCurrencyOptions().map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Balance (as of statement date)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={accountForm.balance}
                          onChange={(e) => handleFormChange('balance', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                        />
                        {analysisResult.balanceDate && (
                          <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
                            Balance date: {analysisResult.balanceDate.toLocaleDateString()}
                          </small>
                        )}
                      </div>
                      {analysisResult.maskedAccountNumber && (
                        <div className="form-group">
                          <label>Account Number</label>
                          <input
                            type="text"
                            value={analysisResult.maskedAccountNumber}
                            readOnly
                            style={{ background: '#f5f5f5' }}
                          />
                          <small style={{ color: '#666', marginTop: '4px', display: 'block' }}>
                            For security, only last 3 digits are shown
                          </small>
                        </div>
                      )}
                    </div>

                    <div className="form-actions">
                      <Button type="button" variant="outline" onClick={() => setShowStatementUpload(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateAccountFromAnalysis}>
                        Create Account
                      </Button>
                    </div>
                  </>
                )}

                {analysisResult.confidence < 0.3 && (
                  <>
                    <div style={{ color: '#666', marginBottom: 12 }}>
                      Tip: If this was a PDF or image, the browser may not expose full text. Try uploading a CSV/Excel export from your bank for better results, or create the account manually below.
                    </div>
                    <div className="form-actions">
                    <Button variant="outline" onClick={() => setShowStatementUpload(false)}>
                      Close
                    </Button>
                    <Button onClick={handleAddAccount}>
                      Create Account Manually
                    </Button>
                    </div>
                  </>
                )}
              </>
            )}

            {!isAnalyzing && !analysisResult && (
              <div className="form-actions">
                <Button variant="outline" onClick={() => setShowStatementUpload(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </EditModalContent>
        </EditModalOverlay>
      )}
      
      {/* Balance History Modal */}
      {showBalanceHistoryModal && selectedAccountForHistory && (
        <BalanceHistoryModal
          account={selectedAccountForHistory}
          isOpen={showBalanceHistoryModal}
          onClose={handleCloseBalanceHistory}
        />
      )}

      {/* Warning Dialog for >10 accounts */}
      {showWarningDialog && (
        <EditModalOverlay onClick={handleWarningCancellation}>
          <EditModalContent onClick={(e) => e.stopPropagation()}>
            <h2>⚠️ Large Number of Accounts Detected</h2>
            <p>{warningMessage}</p>
            <p>Would you like to proceed and review the accounts to create?</p>
            <div className="form-actions">
              <Button variant="outline" onClick={handleWarningCancellation}>
                Cancel
              </Button>
              <Button onClick={handleWarningConfirmation}>
                Proceed to Review
              </Button>
            </div>
          </EditModalContent>
        </EditModalOverlay>
      )}

      {/* Multiple Accounts Selection Dialog */}
      {showMultipleAccountsDialog && multipleAccountsResult && (
        <EditModalOverlay onClick={handleCancelMultipleAccounts}>
          <EditModalContent 
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '700px', maxHeight: '80vh' }}
          >
            <h2>
              {multipleAccountsResult.hasMultipleAccounts 
                ? `${multipleAccountsResult.totalAccountsFound} Accounts Detected` 
                : 'Account Detected'
              }
            </h2>
            
            <p>{multipleAccountsResult.reasoning}</p>
            
            {multipleAccountsResult.hasMultipleAccounts && (
              <p>
                Select which accounts you want to create. 
                <span className="confidence medium" style={{ marginLeft: 8 }}>
                  Confidence: {Math.round(multipleAccountsResult.confidence * 100)}%
                </span>
              </p>
            )}

            <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
              <Button 
                variant="outline" 
                onClick={handleSelectAllAccounts}
                style={{ fontSize: '0.9em', padding: '6px 12px' }}
              >
                {selectedAccountsForCreation.length === multipleAccountsResult.accounts.length 
                  ? 'Deselect All' 
                  : 'Select All'
                }
              </Button>
              <span style={{ color: '#666', fontSize: '0.9em' }}>
                {selectedAccountsForCreation.length} of {multipleAccountsResult.accounts.length} selected
              </span>
            </div>

            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: 20 }}>
              {multipleAccountsResult.accounts.map((account, index) => (
                <div 
                  key={index}
                  style={{
                    border: '1px solid #e0e0e0',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8,
                    background: selectedAccountsForCreation.includes(index) ? '#f0f8ff' : '#f9f9f9',
                    cursor: 'pointer'
                  }}
                  onClick={() => handleAccountSelectionToggle(index)}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <input
                      type="checkbox"
                      checked={selectedAccountsForCreation.includes(index)}
                      onChange={() => handleAccountSelectionToggle(index)}
                      style={{ marginTop: 4 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {account.accountName || `Account ${index + 1}`}
                      </div>
                      <div style={{ fontSize: '0.9em', color: '#666', marginBottom: 6 }}>
                        {account.institution && (
                          <span style={{ marginRight: 12 }}>
                            🏦 {account.institution}
                          </span>
                        )}
                        {account.accountType && (
                          <span style={{ 
                            background: '#e0e7ff', 
                            color: '#3b4de8', 
                            padding: '2px 6px', 
                            borderRadius: 4,
                            fontSize: '0.8em',
                            textTransform: 'capitalize',
                            marginRight: 12
                          }}>
                            {account.accountType}
                          </span>
                        )}
                        {account.maskedAccountNumber && (
                          <span style={{ color: '#888' }}>
                            {account.maskedAccountNumber}
                          </span>
                        )}
                      </div>
                      {account.balance !== null && account.balance !== undefined && (
                        <div style={{ fontSize: '0.9em', fontWeight: 500 }}>
                          Balance: {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: account.currency || 'USD'
                          }).format(account.balance)}
                          {account.balanceDate && (
                            <span style={{ color: '#666', fontWeight: 400 }}>
                              {' '}as of {account.balanceDate.toLocaleDateString ? account.balanceDate.toLocaleDateString() : String(account.balanceDate)}
                            </span>
                          )}
                        </div>
                      )}
                      <div style={{ fontSize: '0.8em', color: '#888', marginTop: 6 }}>
                        AI Confidence: {Math.round(account.confidence * 100)}% • 
                        Fields: {account.extractedFields.join(', ') || 'None'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="form-actions">
              <Button variant="outline" onClick={handleCancelMultipleAccounts}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreateSelectedAccounts}
                disabled={selectedAccountsForCreation.length === 0}
              >
                Create {selectedAccountsForCreation.length} Account{selectedAccountsForCreation.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </EditModalContent>
        </EditModalOverlay>
      )}
    </div>
  );
};

export default AccountsManagement;
