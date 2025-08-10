import React, { useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import styled from 'styled-components';
import { Button } from '../../styles/globalStyles';
import { Account, AccountStatementAnalysisResponse } from '../../types';
import { useAccountManagement } from '../../hooks/useAccountManagement';
import { userPreferencesService } from '../../services/userPreferencesService';
import { accountManagementService } from '../../services/accountManagementService';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

const AccountsContainer = styled.div`
  .ag-theme-alpine {
    height: 400px;
    width: 100%;
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
  const { accounts, addAccount, updateAccount, deleteAccount, error } = useAccountManagement();
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

  // Statement upload functionality
  const [showStatementUpload, setShowStatementUpload] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AccountStatementAnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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

  // Statement upload handlers
  const handleCreateFromStatement = () => {
    setShowStatementUpload(true);
    setUploadedFile(null);
    setAnalysisResult(null);
  };

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file);
    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const result = await accountManagementService.createAccountFromStatement(file);
      
      if (result.success && result.account) {
        // Account created successfully
        setShowStatementUpload(false);
        // The useAccountManagement hook should automatically refresh the accounts list
      } else if (result.analysis) {
        // Analysis completed but needs user review
        setAnalysisResult(result.analysis);
        
        // Pre-populate form with extracted data
        setAccountForm({
          name: result.analysis.accountName || `Account from ${file.name}`,
          type: result.analysis.accountType || 'checking',
          institution: result.analysis.institution || '',
          currency: result.analysis.currency || 'USD',
          balance: result.analysis.balance || 0,
          isActive: true
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
        historicalBalanceDate: analysisResult.balanceDate
      };
      
      addAccount(newAccountData);
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

  // React cell renderers
  const NameRenderer: React.FC<any> = (params) => {
    const isActive = params.data.isActive;
    const style: React.CSSProperties = { fontWeight: isActive ? 600 : 400, color: isActive ? '#333' : '#999' };
    return (
      <span style={style}>
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
    const balance: number | undefined = params.value;
    if (balance === undefined || balance === null) return null;

    const currencyCode: string = params.data?.currency || 'USD';
    let formatted = '';

    // Try native Intl currency formatting first
    try {
      formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(balance);
    } catch {
      // Fallback for unknown/unsupported currency codes
      const symbol = userPreferencesService.getCurrencySymbol(currencyCode);
      const abs = Math.abs(balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const sign = balance < 0 ? '-' : '';
      // Place symbol before number by default; some currencies append, but keep simple here
      formatted = `${sign}${symbol}${abs}`;
    }

    const style: React.CSSProperties = { color: balance >= 0 ? '#4caf50' : '#f44336' };
    return <span style={style}>{formatted}</span>;
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
          fontSize: '12px'
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
          fontSize: '12px'
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3>Account Management</h3>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Button onClick={handleCreateFromStatement} variant="outline">Create from Statement</Button>
          <Button onClick={handleAddAccount}>Add Account</Button>
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
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
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
                      <Button variant="outline" onClick={() => setShowStatementUpload(false)}>
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
    </div>
  );
};

export default AccountsManagement;
