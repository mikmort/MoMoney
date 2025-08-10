import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridReadyEvent } from 'ag-grid-community';
import styled from 'styled-components';
import { Card, PageHeader, Button, FlexBox } from '../../styles/globalStyles';
import { Transaction, ReimbursementMatch, Account, AnomalyResult, TransactionSplit, CollapsedTransfer, TransferDisplayOptions, AttachedFile } from '../../types';
import { dataService } from '../../services/dataService';
import { defaultCategories } from '../../data/defaultCategories';
import { useReimbursementMatching } from '../../hooks/useReimbursementMatching';
import { useTransferMatching } from '../../hooks/useTransferMatching';
import { transferMatchingService } from '../../services/transferMatchingService';
import { useAccountManagement } from '../../hooks/useAccountManagement';
import { AccountSelectionDialog, AccountDetectionResult } from './AccountSelectionDialog';
import { AiConfidencePopup } from './AiConfidencePopup';
import { CategoryEditConfirmDialog } from './CategoryEditConfirmDialog';
import { ActionsMenu, MenuAction } from '../shared/ActionsMenu';
import { TransferMatchDialog } from './TransferMatchDialog';
import { fileProcessingService } from '../../services/fileProcessingService';
import { FileImport } from './FileImport';
import { TransactionSplitManager } from '../shared/TransactionSplitManager';
import { TransferList } from './TransferList';
import { FilePreview } from '../shared/FilePreview';
import { ReceiptUpload } from '../shared/ReceiptUpload';
import { getEffectiveCategory } from '../../utils/transactionUtils';
import { azureOpenAIService } from '../../services/azureOpenAIService';
import { rulesService } from '../../services/rulesService';
import { defaultCategories as categoriesCatalog } from '../../data/defaultCategories';
import { currencyDisplayService } from '../../services/currencyDisplayService';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

const TransactionsContainer = styled.div`
  .ag-theme-alpine {
    height: 600px;
    width: 100%;
  }

  /* Remove default blue outline only for the Actions cell button to avoid visual noise */
  .actions-cell button {
    outline: none !important;
    /* Make the button subtler inside the grid */
    border-color: #d0d7de !important; /* neutral border instead of theme blue */
    color: #444 !important;
    padding: 6px 10px !important; /* fit narrow column */
    border-width: 1px !important;
    background: #fff !important;
  }
  .actions-cell button:focus,
  .actions-cell button:focus-visible {
    outline: none !important;
    box-shadow: none !important;
  }
  .actions-cell button:hover {
    background: #f5f5f5 !important;
    border-color: #c7ced6 !important;
  }

  /* Style for filtered columns */
  .ag-header-cell-filtered .ag-header-cell-label {
    color: #2196f3;
    font-weight: 600;
  }
  
  .ag-header-cell-filtered::after {
    content: '🔍';
    position: absolute;
    top: 2px;
    right: 2px;
    font-size: 12px;
    color: #2196f3;
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

  /* Improve filter menu styling */
  .ag-filter-toolpanel-header {
    background: #f8f9fa;
    border-bottom: 1px solid #dee2e6;
    padding: 8px 12px;
    font-weight: 600;
  }
  
  .ag-filter-condition-input {
    margin: 4px 0;
  }
  
  .ag-filter-apply-panel {
    border-top: 1px solid #dee2e6;
    padding: 8px;
    background: #f8f9fa;
  }
  
  .ag-filter-apply-panel button {
    margin: 0 4px;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  /* Remove AG Grid blue focus outline specifically for the Actions cell */
  .ag-theme-alpine .ag-cell.actions-cell.ag-cell-focus,
  .ag-theme-alpine .ag-cell.actions-cell:focus-within {
    outline: none !important;
    border: none !important;
    box-shadow: none !important;
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

const TransferMatchingPanel = styled(Card)`
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
        
        .source-transfer {
          font-weight: 600;
          color: #9C27B0;
        }
        
        .target-transfer {
          font-weight: 600;
          color: #673AB7;
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
  margin-bottom: 16px;
  
  .filter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    
    h3 {
      margin: 0;
      font-size: 1rem;
      color: #333;
    }
    
    .clear-filters-btn {
      padding: 4px 10px;
      background: #f44336;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 500;
      transition: background-color 0.2s;
      
      &:hover {
        background: #d32f2f;
      }
      
      &:disabled {
        background: #ccc;
        cursor: not-allowed;
      }
    }
  }
  
  .filter-row {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }
  
  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
    
    label {
      font-size: 0.85rem;
      font-weight: 500;
      color: #666;
    }
    
    select, input {
      min-width: 140px;
      padding: 6px 8px;
      font-size: 0.9rem;
    }
  }
  
  .quick-filters-section {
    margin-top: 10px;
    
    .quick-filters-label {
      font-size: 0.85rem;
      font-weight: 500;
      color: #666;
      margin-bottom: 6px;
    }
    
    .quick-filters-container {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      align-items: center;
    }
  }
`;

const QuickFilterButton = styled.button.withConfig({
  shouldForwardProp: (prop) => !['isActive', 'activeColor', 'activeBackground'].includes(prop),
})<{ isActive: boolean; activeColor: string; activeBackground: string }>`
  padding: 5px 8px;
  border: ${props => props.isActive ? `2px solid ${props.activeColor}` : '1px solid #ddd'};
  border-radius: 4px;
  background: ${props => props.isActive ? props.activeBackground : 'white'};
  color: ${props => props.isActive ? props.activeColor : '#666'};
  font-weight: ${props => props.isActive ? 'bold' : 'normal'};
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  transition: all 0.2s ease;
  min-height: 28px;
  display: flex;
  align-items: center;
  
  &:hover {
    border-color: ${props => props.isActive ? props.activeColor : '#bbb'};
    background: ${props => props.isActive ? props.activeBackground : '#f5f5f5'};
  }
  
  &:active {
    transform: translateY(1px);
  }
`;

const StatsBar = styled.div`
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
  
  .stat {
    background: white;
    padding: 12px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    
    .label {
      font-size: 0.8rem;
      color: #666;
      margin-bottom: 3px;
    }
    
    .value {
      font-size: 1rem;
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

const BulkOperationsBar = styled(Card)`
  margin-bottom: 20px;
  background: #e3f2fd;
  border-left: 4px solid #2196f3;
  
  .bulk-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    
    .selection-info {
      display: flex;
      align-items: center;
      gap: 8px;
      
      .count {
        font-weight: 600;
        color: #1976d2;
      }
    }
    
    .clear-selection-btn {
      padding: 4px 8px;
      background: transparent;
      border: 1px solid #2196f3;
      color: #2196f3;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85rem;
      
      &:hover {
        background: #2196f3;
        color: white;
      }
    }
  }
  
  .bulk-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
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
  const [displayInfo, setDisplayInfo] = useState<{
    displayAmount: string;
    tooltip?: string;
    isConverted: boolean;
    approxConvertedDisplay?: string;
  }>({ displayAmount: '$0.00', isConverted: false });
  
  const amount = params.value;
  const transaction = params.data as Transaction;
  const isReimbursed = transaction.reimbursed;
  const isAnomaly = transaction.isAnomaly;
  const anomalyType = transaction.anomalyType;
  const anomalyScore = transaction.anomalyScore;
  
  // Initialize currency display service and format amount
  React.useEffect(() => {
    const formatAmount = async () => {
      try {
        await currencyDisplayService.initialize();
        const result = await currencyDisplayService.formatTransactionAmount(transaction);
        setDisplayInfo(result);
      } catch (error) {
        console.error('Error formatting currency:', error);
        // Fallback to basic formatting using default currency when available
        try {
          const fallbackCurrency = await currencyDisplayService.getDefaultCurrency();
          setDisplayInfo({
            displayAmount: new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: fallbackCurrency || 'USD'
            }).format(amount),
            isConverted: false
          });
        } catch {
          setDisplayInfo({
            displayAmount: new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD'
            }).format(amount),
            isConverted: false
          });
        }
      }
    };
    
    formatAmount();
  }, [amount, transaction]);
  
  const className = amount >= 0 ? 'positive' : 'negative';
  const reimbursedClass = isReimbursed ? ' reimbursed' : '';
  
  return (
    <span 
      className={className + reimbursedClass}
      title={displayInfo.tooltip}
      style={{ 
        cursor: displayInfo.tooltip ? 'help' : 'default'
      }}
    >
      {displayInfo.displayAmount}
      {displayInfo.isConverted && displayInfo.approxConvertedDisplay && (
        <span 
          style={{ 
            marginLeft: '6px', 
            fontSize: '0.85em',
            color: '#666',
            fontWeight: 500
          }}
          title={displayInfo.tooltip}
        >
          ({displayInfo.approxConvertedDisplay})
        </span>
      )}
      {isAnomaly && (
        <span 
          style={{ 
            marginLeft: '4px', 
            fontSize: '12px',
            color: anomalyType === 'high' ? '#f44336' : '#ff9800',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
          title={`Anomaly detected: ${anomalyType} amount (${anomalyScore} std dev from average)`}
        >
          {anomalyType === 'high' ? '🔺' : '🔻'}
        </span>
      )}
    </span>
  );
};

// Inline amount display for anomaly panel using currencyDisplayService
const AnomalyAmount: React.FC<{ tx: Transaction }> = ({ tx }) => {
  const [displayInfo, setDisplayInfo] = useState<{
    displayAmount: string;
    approxConvertedDisplay?: string;
    tooltip?: string;
    isConverted: boolean;
  }>({ displayAmount: '$0.00', isConverted: false });

  React.useEffect(() => {
    const run = async () => {
      try {
        await currencyDisplayService.initialize();
        const result = await currencyDisplayService.formatTransactionAmount(tx);
        setDisplayInfo(result);
      } catch (e) {
        try {
          const fallbackCurrency = await currencyDisplayService.getDefaultCurrency();
          setDisplayInfo({
            displayAmount: new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: fallbackCurrency || 'USD'
            }).format(tx.amount),
            isConverted: false
          });
        } catch {
          setDisplayInfo({
            displayAmount: new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD'
            }).format(tx.amount),
            isConverted: false
          });
        }
      }
    };
    run();
  }, [tx]);

  return (
    <span title={displayInfo.tooltip} style={{ cursor: displayInfo.tooltip ? 'help' : 'default' }}>
      {displayInfo.displayAmount}
      {displayInfo.isConverted && displayInfo.approxConvertedDisplay && (
        <span style={{ marginLeft: 6, color: '#666', fontSize: '0.9em' }}>
          ({displayInfo.approxConvertedDisplay})
        </span>
      )}
    </span>
  );
};

const CategoryCellRenderer = (params: any) => {
  const transaction = params.data as Transaction;
  const isReimbursed = transaction.reimbursed;
  const reimbursedClass = isReimbursed ? ' reimbursed' : '';
  
  const displayText = getEffectiveCategory(transaction);
  const isUncategorized = transaction.category === 'Uncategorized' && !transaction.splits;
  
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
  
  // Special styling for split transactions
  if (transaction.splits && transaction.splits.length > 1) {
    return (
      <span 
        className={reimbursedClass}
        style={{
          color: '#2196f3',
          fontWeight: 'bold',
          backgroundColor: '#e3f2fd',
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '0.9em'
        }}
        title={`Split into ${transaction.splits.length} categories`}
      >
        💸 {displayText}
      </span>
    );
  }
  
  return <span className={reimbursedClass}>{displayText}</span>;
};

const AnomalyResultsPanel = styled(Card)`
  margin-top: 20px;
  background: #fff9c4;
  border-left: 4px solid #ff9800;

  .anomaly-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

    h3 {
      margin: 0;
      color: #e65100;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .close-btn {
      padding: 4px 8px;
      background: transparent;
      border: 1px solid #ff9800;
      color: #ff9800;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;

      &:hover {
        background: #fff3e0;
      }
    }
  }

  .anomaly-list {
    .anomaly-item {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 12px;
      border: 1px solid #ffcc02;
      border-radius: 6px;
      margin-bottom: 12px;
      background: white;

      .anomaly-info {
        flex: 1;

        .transaction-details {
          font-weight: 600;
          color: #d84315;
          margin-bottom: 4px;
        }

        .anomaly-type {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.8rem;
          font-weight: 600;
          margin-right: 8px;
          
          &.unusual_amount { background: #ffebee; color: #c62828; }
          &.unusual_merchant { background: #e8f5e8; color: #2e7d32; }
          &.unusual_category { background: #e3f2fd; color: #1565c0; }
          &.unusual_frequency { background: #fff3e0; color: #ef6c00; }
          &.suspicious_pattern { background: #f3e5f5; color: #7b1fa2; }
        }

        .severity-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.8rem;
          font-weight: 600;
          margin-right: 8px;

          &.low { background: #e8f5e8; color: #2e7d32; }
          &.medium { background: #fff3cd; color: #856404; }
          &.high { background: #f8d7da; color: #721c24; }
        }

        .reasoning {
          margin-top: 8px;
          color: #666;
          font-style: italic;
          font-size: 0.95rem;
        }
      }

      .confidence-score {
        padding: 4px 8px;
        background: #e3f2fd;
        color: #1565c0;
        border-radius: 4px;
        font-size: 0.9rem;
        font-weight: 600;
      }
    }

    .no-anomalies {
      text-align: center;
      color: #666;
      padding: 20px;
      font-style: italic;
    }
  }
`;

const Transactions: React.FC = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [showReimbursementPanel, setShowReimbursementPanel] = useState(false);
  const [showReimbursedTransactions, setShowReimbursedTransactions] = useState(true);
  const [showTransferMatchingPanel, setShowTransferMatchingPanel] = useState(false);
  const [showMatchedTransfersOnly, setShowMatchedTransfersOnly] = useState(false);
  
  const [collapsedTransfers, setCollapsedTransfers] = useState<CollapsedTransfer[]>([]);
  
  // Transfer display options
  const [transferDisplayOptions, setTransferDisplayOptions] = useState<TransferDisplayOptions>({
    showTransfers: false,
    collapseMatched: true,
    showFees: false
  });
  
  // Account selection dialog state
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [accountDetectionResult, setAccountDetectionResult] = useState<AccountDetectionResult | undefined>();

  // AI Confidence popup state
  const [showConfidencePopup, setShowConfidencePopup] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // File preview state
  const [previewFile, setPreviewFile] = useState<AttachedFile | null>(null);

  // Category edit confirmation dialog state
  const [showCategoryEditDialog, setShowCategoryEditDialog] = useState(false);
  const [categoryEditData, setCategoryEditData] = useState<{
    transaction: Transaction;
    newCategory: string;
    newSubcategory?: string;
    updatedTransaction: Transaction;
  } | null>(null);

  // Anomaly detection state
  const [anomalies, setAnomalies] = useState<AnomalyResult[]>([]);
  const [isAnomalyDetectionLoading, setIsAnomalyDetectionLoading] = useState(false);
  const [showAnomalyResults, setShowAnomalyResults] = useState(false);
  
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
  
  // Undo/Redo state for tracking per-transaction capabilities
  const [undoRedoStatus, setUndoRedoStatus] = useState<{[transactionId: string]: {canUndo: boolean; canRedo: boolean}}>({});
  
  // History modal state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyFor, setHistoryFor] = useState<Transaction | null>(null);
  const [historyItems, setHistoryItems] = useState<Array<{ id: string; timestamp: string; data: Transaction; note?: string }>>([]);
  
  // Bulk edit state
  const [selectedTransactions, setSelectedTransactions] = useState<Transaction[]>([]);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState({
    operation: 'set-category', // 'set-category', 'set-account', 'find-replace'
    category: '',
    subcategory: '',
    account: '',
    findText: '',
    replaceText: ''
  });

  // Aggregated totals in default currency
  const [stats, setStats] = useState<{ totalIncome: number; totalExpenses: number; netAmount: number; count: number }>({
    totalIncome: 0,
    totalExpenses: 0,
    netAmount: 0,
    count: 0
  });
  const [formattedStats, setFormattedStats] = useState<{ totalIncome: string; totalExpenses: string; netAmount: string }>({
    totalIncome: '$0.00',
    totalExpenses: '$0.00',
    netAmount: '$0.00'
  });

  // Category rules manager state removed - now handled by dedicated Rules page

  // Pagination page size (persisted to localStorage)
  const allowedPageSizes = [50, 100, 200, 500, 1000, 5000];
  const pageSize = (() => {
    const saved = localStorage.getItem('transactionsPageSize');
    const parsed = saved ? parseInt(saved, 10) : NaN;
    return allowedPageSizes.includes(parsed) ? parsed : 50;
  })();

  // Transfer match dialog state
  const [showTransferMatchDialog, setShowTransferMatchDialog] = useState(false);
  const [selectedTransactionForMatching, setSelectedTransactionForMatching] = useState<Transaction | null>(null);

  // Compute a simple diff summary between two transactions
  const summarizeDiff = (a: Transaction, b: Transaction) => {
    const fields: Array<keyof Transaction> = ['description','amount','category','subcategory','account','type','date','notes'];
    const changes: string[] = [];
    fields.forEach(f => {
      const av = f === 'date' ? (a.date ? new Date(a.date).toISOString().slice(0,10) : '') : (a as any)[f];
      const bv = f === 'date' ? (b.date ? new Date(b.date).toISOString().slice(0,10) : '') : (b as any)[f];
      if ((av ?? '') !== (bv ?? '')) {
        changes.push(`${String(f)}: "${av ?? ''}" → "${bv ?? ''}"`);
      }
    });
    return changes.join('; ');
  };

  const openHistory = async (tx: Transaction) => {
    const items = await dataService.getTransactionHistory(tx.id);
    setHistoryFor(tx);
    setHistoryItems(items);
    setShowHistoryModal(true);
  };

  const restoreHistory = async (versionId: string) => {
    if (!historyFor) return;
    const version = historyItems.find(h => h.id === versionId);
    let note: string | undefined = undefined;
    if (version) {
      const current = await dataService.getTransactionById(historyFor.id);
      if (current) {
        const diff = summarizeDiff(current, version.data);
        const confirmMsg = `Restore this version?\n\nChanges: ${diff || 'No visible field changes.'}`;
        const ok = window.confirm(confirmMsg);
        if (!ok) return;
        note = diff ? `Restored: ${diff}` : 'Restored previous version';
      }
    }
    await dataService.restoreTransactionVersion(historyFor.id, versionId, note);
    const allTransactions = await dataService.getAllTransactions();
    setTransactions(allTransactions);
    setFilteredTransactions(allTransactions);
    const items = await dataService.getTransactionHistory(historyFor.id);
    setHistoryItems(items);
  };
  const [transactionForm, setTransactionForm] = useState({
    description: '',
    amount: '',
    category: '',
    subcategory: '',
    account: '',
    type: '',
    date: '',
    notes: '',
    splits: undefined as TransactionSplit[] | undefined
  });

  // Get available subcategories based on selected category
  const getAvailableSubcategories = (categoryName: string) => {
    const category = defaultCategories.find(cat => cat.name === categoryName);
    return category ? category.subcategories : [];
  };

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

  const { 
    isLoading: isTransferMatchingLoading, 
    error: transferMatchingError, 
    matches: transferMatches, 
    findTransferMatches, 
    applyTransferMatches,
    unmatchTransfers,
    getMatchedTransfers
  } = useTransferMatching();

  // Category dropdown cell editor
  const CategoryCellEditor = React.forwardRef<any, any>((props, ref) => {
    const [value, setValue] = useState(props.value || '');
    
    const allCategories = defaultCategories.flatMap(cat => 
      [cat.name, ...cat.subcategories.map(sub => `${cat.name} > ${sub.name}`)]
    );

    // AG Grid cell editor interface methods
    React.useImperativeHandle(ref, () => ({
      getValue: () => value,
      isCancelBeforeStart: () => false,
      isCancelAfterEnd: () => false
    }));

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newValue = e.target.value;
      setValue(newValue);
      props.stopEditing();
      
      // Update the transaction
      const updatedTransaction = { ...props.data, category: newValue };
      handleUpdateTransaction(updatedTransaction);
    };

    return (
      <select 
        value={value} 
        onChange={handleChange}
        style={{ width: '100%', height: '100%', border: 'none', outline: 'none' }}
        autoFocus
      >
        <option value="">Select Category</option>
        {allCategories.map(cat => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>
    );
  });

  // Account dropdown cell editor
  const AccountCellEditor = React.forwardRef<any, any>((props, ref) => {
    const [value, setValue] = useState(props.value || '');

    // AG Grid cell editor interface methods
    React.useImperativeHandle(ref, () => ({
      getValue: () => value,
      isCancelBeforeStart: () => false,
      isCancelAfterEnd: () => false
    }));

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newValue = e.target.value;
      setValue(newValue);
      props.stopEditing();
      
      // Update the transaction
      const updatedTransaction = { ...props.data, account: newValue };
      handleUpdateTransaction(updatedTransaction);
    };

    return (
      <select 
        value={value} 
        onChange={handleChange}
        style={{ width: '100%', height: '100%', border: 'none', outline: 'none' }}
        autoFocus
      >
        <option value="">Select Account</option>
        {accounts.map(account => (
          <option key={account.id} value={account.name}>{account.name}</option>
        ))}
      </select>
    );
  });

  // Text cell editor for description and amount
  const TextCellEditor = React.forwardRef<any, any>((props, ref) => {
    const [value, setValue] = useState(props.value || '');

    // AG Grid cell editor interface methods
    React.useImperativeHandle(ref, () => ({
      getValue: () => props.colDef.field === 'amount' ? parseFloat(value) || 0 : value,
      isCancelBeforeStart: () => false,
      isCancelAfterEnd: () => false
    }));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        props.stopEditing();
        const updatedTransaction = { 
          ...props.data, 
          [props.colDef.field]: props.colDef.field === 'amount' ? parseFloat(value) || 0 : value 
        };
        handleUpdateTransaction(updatedTransaction);
      } else if (e.key === 'Escape') {
        props.stopEditing();
      }
    };

    const handleBlur = () => {
      props.stopEditing();
      const updatedTransaction = { 
        ...props.data, 
        [props.colDef.field]: props.colDef.field === 'amount' ? parseFloat(value) || 0 : value 
      };
      handleUpdateTransaction(updatedTransaction);
    };

    return (
      <input
        type={props.colDef.field === 'amount' ? 'number' : 'text'}
        step={props.colDef.field === 'amount' ? '0.01' : undefined}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{ width: '100%', height: '100%', border: 'none', outline: 'none', padding: '4px' }}
        autoFocus
      />
    );
  });

  // Grid API reference
  const [gridApi, setGridApi] = useState<any>(null);

  // Handle row selection changes
  const onSelectionChanged = useCallback(() => {
    if (gridApi) {
      const selectedRows = gridApi.getSelectedRows();
      setSelectedTransactions(selectedRows);
    }
  }, [gridApi]);

  // Function to update transaction
  const handleUpdateTransaction = async (updatedTransaction: Transaction) => {
    try {
      await dataService.updateTransaction(updatedTransaction.id, updatedTransaction);
      // Refresh transactions list
      const allTransactions = await dataService.getAllTransactions();
      setTransactions(allTransactions);
      setFilteredTransactions(allTransactions);
      // Update undo/redo status for this transaction
      await updateUndoRedoStatus(updatedTransaction.id);
    } catch (error) {
      console.error('Failed to update transaction:', error);
    }
  };

  // Update undo/redo status for a specific transaction
  const updateUndoRedoStatus = async (transactionId: string) => {
    try {
      const status = await dataService.getUndoRedoStatus(transactionId);
      setUndoRedoStatus(prev => ({
        ...prev,
        [transactionId]: {
          canUndo: status.canUndo,
          canRedo: status.canRedo
        }
      }));
    } catch (error) {
      console.error('Failed to get undo/redo status:', error);
    }
  };

  // Refresh undo/redo status for all visible transactions
  const refreshAllUndoRedoStatus = useCallback(async () => {
    const statusPromises = filteredTransactions.map(async (transaction) => {
      const status = await dataService.getUndoRedoStatus(transaction.id);
      return {
        transactionId: transaction.id,
        canUndo: status.canUndo,
        canRedo: status.canRedo
      };
    });
    
    const statuses = await Promise.all(statusPromises);
    const statusMap: {[transactionId: string]: {canUndo: boolean; canRedo: boolean}} = {};
    statuses.forEach(status => {
      statusMap[status.transactionId] = {
        canUndo: status.canUndo,
        canRedo: status.canRedo
      };
    });
    
    setUndoRedoStatus(statusMap);
  }, [filteredTransactions]);

  // Handle undo transaction edit
  const handleUndoTransaction = useCallback(async (transactionId: string) => {
    try {
      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) return;
      
      const undoedTransaction = await dataService.undoTransactionEdit(transactionId, 
        `Undo edit of ${transaction.description}`);
      
      if (undoedTransaction) {
        // Refresh transactions list
        const allTransactions = await dataService.getAllTransactions();
        setTransactions(allTransactions);
        setFilteredTransactions(allTransactions);
        await updateUndoRedoStatus(transactionId);
        console.log('✅ Transaction edit undone successfully');
      }
    } catch (error) {
      console.error('❌ Failed to undo transaction edit:', error);
      alert('Failed to undo. Please try again.');
    }
  }, [transactions]);

  // Handle redo transaction edit
  const handleRedoTransaction = useCallback(async (transactionId: string) => {
    try {
      const transaction = transactions.find(t => t.id === transactionId);
      if (!transaction) return;
      
      const redoneTransaction = await dataService.redoTransactionEdit(transactionId, 
        `Redo edit of ${transaction.description}`);
      
      if (redoneTransaction) {
        // Refresh transactions list
        const allTransactions = await dataService.getAllTransactions();
        setTransactions(allTransactions);
        setFilteredTransactions(allTransactions);
        await updateUndoRedoStatus(transactionId);
        console.log('✅ Transaction edit redone successfully');
      }
    } catch (error) {
      console.error('❌ Failed to redo transaction edit:', error);
      alert('Failed to redo. Please try again.');
    }
  }, [transactions]);

  // Function to clear all column filters
  const handleClearAllFilters = () => {
    if (gridApi) {
      gridApi.setFilterModel(null);
      gridApi.onFilterChanged();
    }
  };

  // Confidence cell renderer with info icon
  const ConfidenceCellRenderer = (params: any) => {
    const confidence = params.value;
    if (!confidence) return '';
    
    const percentage = Math.round(confidence * 100);
    const isLowConfidence = percentage < 60;
    const className = percentage > 90 ? 'high' : percentage >= 60 ? 'medium' : 'low';
    const displayText = `${percentage}%`;
    
    const handleInfoClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      const transaction = params.data as Transaction;
      setSelectedTransaction(transaction);
      setShowConfidencePopup(true);
    };
    
    const infoIcon = (
      <span 
        style={{
          marginLeft: '4px',
          cursor: 'pointer',
          fontSize: '0.8rem',
          color: '#666',
          padding: '2px'
        }}
        onClick={handleInfoClick}
        title="View AI reasoning"
      >
        ℹ️
      </span>
    );
    
    if (isLowConfidence) {
      return (
        <span style={{ display: 'flex', alignItems: 'center' }}>
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
          {infoIcon}
        </span>
      );
    }
    
    return (
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <span className={`confidence ${className}`}>{displayText}</span>
        {infoIcon}
      </span>
    );
  };

  useEffect(() => {
    // Load real transactions from dataService
    const loadTransactions = async () => {
      try {
        console.log('🔄 Loading transactions from dataService...');
        const allTransactions = await dataService.getAllTransactions();
        console.log(`📊 Loaded ${allTransactions.length} transactions`);
        
        // Run anomaly detection if we have sufficient data
        if (allTransactions.length > 0) {
          console.log('🔍 Running anomaly detection...');
          await dataService.detectAnomalies();
          // Reload transactions to get the updated anomaly flags
          const updatedTransactions = await dataService.getAllTransactions();
          const anomalies = updatedTransactions.filter(t => t.isAnomaly);
          if (anomalies.length > 0) {
            console.log(`⚠️ Found ${anomalies.length} anomalous transactions`);
          }
          setTransactions(updatedTransactions);
          
          // Load collapsed transfers
          const collapsed = await dataService.getCollapsedTransfers();
          setCollapsedTransfers(collapsed);
          
          // Filter transactions based on transfer display options
          const displayTransactions = transferDisplayOptions.showTransfers 
            ? updatedTransactions 
            : await dataService.getTransactionsWithoutTransfers();
          
          setFilteredTransactions(displayTransactions);
        } else {
          setTransactions(allTransactions);
          setFilteredTransactions(allTransactions);
          setCollapsedTransfers([]);
        }
      } catch (error) {
        console.error('❌ Error loading transactions:', error);
        // Fall back to empty array if loading fails
        setTransactions([]);
        setFilteredTransactions([]);
        setCollapsedTransfers([]);
      }
    };

    loadTransactions();
  }, [transferDisplayOptions.showTransfers]);

  // Handle transfer display options changes
  useEffect(() => {
    const updateTransactionDisplay = async () => {
      if (transactions.length === 0) return;
      
      try {
        const showTransfers = transferDisplayOptions.showTransfers;
        const displayTransactions = showTransfers 
          ? transactions 
          : await dataService.getTransactionsWithoutTransfers();
        
        setFilteredTransactions(displayTransactions);
      } catch (error) {
        console.error('❌ Error updating transaction display:', error);
      }
    };

    updateTransactionDisplay();
  }, [transactions, transferDisplayOptions.showTransfers]);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    // Store grid API reference
    setGridApi(params.api);
    
    // Use setTimeout to avoid ResizeObserver conflicts
    setTimeout(() => {
      params.api.sizeColumnsToFit();
    }, 0);
  }, []);



  const handleDeleteTransaction = useCallback(async (id: string) => {
    try {
      const transaction = transactions.find(t => t.id === id);
      if (!transaction) return;

      const confirmMessage = `Are you sure you want to delete this transaction?\n\n"${transaction.description}" - ${formatCurrencySync(transaction.amount)}\n\nThis action cannot be undone.`;
      if (!window.confirm(confirmMessage)) {
        return;
      }

      console.log('Deleting transaction:', id);
      const deleted = await dataService.deleteTransaction(id);
      
      if (deleted) {
        // Refresh transactions list
        const allTransactions = await dataService.getAllTransactions();
        setTransactions(allTransactions);
        setFilteredTransactions(allTransactions);
        console.log('✅ Transaction deleted successfully');
      } else {
        console.log('❌ Transaction not found or could not be deleted');
        alert('Failed to delete transaction. It may have already been deleted.');
      }
    } catch (error) {
      console.error('❌ Failed to delete transaction:', error);
      alert('Failed to delete transaction. Please try again.');
    }
  }, [transactions]);

  // Handle receipt upload success
  const handleReceiptTransactionAdded = useCallback(async (newTransactions: Transaction[]) => {
    console.log(`📄 Receipt uploaded with ${newTransactions.length} transaction(s), refreshing list`);
    
    // Refresh the transactions list
    const allTransactions = await dataService.getAllTransactions();
    setTransactions(allTransactions);
    setFilteredTransactions(allTransactions);
  }, []);

  const startEditTransaction = useCallback((transaction: Transaction) => {
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
      notes: transaction.notes || '',
      splits: transaction.splits
    });
    
    // Show the edit modal
    setShowEditModal(true);
  }, []);

  const handleEditFormChange = (field: string, value: string) => {
    setTransactionForm(prev => {
      const newForm = {
        ...prev,
        [field]: value
      };
      
      // If category changes, reset subcategory to empty
      if (field === 'category') {
        newForm.subcategory = '';
      }
      
      return newForm;
    });
  };

  const handleSplitsChange = (splits: TransactionSplit[] | undefined) => {
    setTransactionForm(prev => ({
      ...prev,
      splits
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
        type: transactionForm.type as 'income' | 'expense' | 'transfer',
        date: new Date(transactionForm.date),
        notes: transactionForm.notes,
        lastModifiedDate: new Date(),
        splits: transactionForm.splits,
        isSplit: !!(transactionForm.splits && transactionForm.splits.length > 0)
      };

      // Check if category or subcategory has changed (user made a manual categorization change)
      const categoryChanged = editingTransaction.category !== updatedTransaction.category;
      const subcategoryChanged = editingTransaction.subcategory !== updatedTransaction.subcategory;
      
      if ((categoryChanged || subcategoryChanged) && !transactionForm.splits) {
        // Only show category change dialog for non-split transactions
        // Store the data and show the confirmation dialog
        setCategoryEditData({
          transaction: editingTransaction,
          newCategory: updatedTransaction.category,
          newSubcategory: updatedTransaction.subcategory,
          updatedTransaction
        });
        setShowCategoryEditDialog(true);
        return; // Don't update yet, wait for user confirmation
      }

      // No category change or split transaction, proceed with normal update
      await dataService.updateTransaction(editingTransaction.id, {
        description: updatedTransaction.description,
        amount: updatedTransaction.amount,
        category: updatedTransaction.category,
        subcategory: updatedTransaction.subcategory,
        account: updatedTransaction.account,
        type: updatedTransaction.type,
        date: updatedTransaction.date,
        notes: updatedTransaction.notes,
        lastModifiedDate: updatedTransaction.lastModifiedDate,
        splits: updatedTransaction.splits,
        isSplit: updatedTransaction.isSplit
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
      notes: '',
      splits: undefined
    });
  };

  const handleCategoryEditConfirm = async (option: 'current' | 'future' | 'all') => {
    if (!categoryEditData) return;
    
    const { transaction, updatedTransaction, newCategory, newSubcategory } = categoryEditData;
    
    try {
      if (option === 'current') {
        // Just update this transaction
        await dataService.updateTransaction(transaction.id, {
          description: updatedTransaction.description,
          amount: updatedTransaction.amount,
          category: updatedTransaction.category,
          subcategory: updatedTransaction.subcategory,
          account: updatedTransaction.account,
          type: updatedTransaction.type,
          date: updatedTransaction.date,
          notes: updatedTransaction.notes,
          lastModifiedDate: updatedTransaction.lastModifiedDate
        }, 'User manual categorization - current transaction only');
        
      } else {
        // Update this transaction and create/update rule
        await dataService.updateTransaction(transaction.id, {
          description: updatedTransaction.description,
          amount: updatedTransaction.amount,
          category: updatedTransaction.category,
          subcategory: updatedTransaction.subcategory,
          account: updatedTransaction.account,
          type: updatedTransaction.type,
          date: updatedTransaction.date,
          notes: updatedTransaction.notes,
          lastModifiedDate: updatedTransaction.lastModifiedDate
        }, `User manual categorization - ${option === 'future' ? 'future only' : 'existing + future'}`);
        
        // Create or update rule
        const applyToExisting = option === 'all';
        const result = await rulesService.createOrUpdateRuleFromUserEdit(
          transaction.account,
          transaction.description,
          newCategory,
          newSubcategory,
          applyToExisting
        );
        
        if (result.reclassifiedCount && result.reclassifiedCount > 0) {
          alert(`Rule ${result.isNew ? 'created' : 'updated'} successfully!\n\nReclassified ${result.reclassifiedCount} existing transaction(s) with the same description and account.`);
        } else if (result.isNew) {
          alert('Rule created successfully!\n\nFuture transactions with the same description and account will be automatically categorized.');
        } else {
          alert('Rule updated successfully!\n\nFuture transactions with the same description and account will use the new categorization.');
        }
      }
      
      // Refresh the transactions list
      const refreshedTransactions = await dataService.getAllTransactions();
      setTransactions(refreshedTransactions);
      setFilteredTransactions(refreshedTransactions);
      
      // Close dialogs
      setShowCategoryEditDialog(false);
      setCategoryEditData(null);
      setShowEditModal(false);
      setEditingTransaction(null);
      
      console.log(`✅ Category edit applied with option: ${option}`);
    } catch (error) {
      console.error('❌ Error applying category edit:', error);
      alert('Failed to apply category change. Please try again.');
    }
  };

  const handleCategoryEditCancel = () => {
    setShowCategoryEditDialog(false);
    setCategoryEditData(null);
  };

  // Bulk operations
  const handleBulkEdit = () => {
    if (selectedTransactions.length === 0) return;
    setBulkEditForm({
      operation: 'set-category',
      category: '',
      subcategory: '',
      account: '',
      findText: '',
      replaceText: ''
    });
    setShowBulkEditModal(true);
  };

  const handleBulkDelete = async () => {
    if (selectedTransactions.length === 0) return;

    const confirmMessage = `Are you sure you want to delete ${selectedTransactions.length} transaction(s)?\n\nThis action cannot be undone.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const transactionIds = selectedTransactions.map(t => t.id);
      const deletedCount = await dataService.deleteTransactions(transactionIds);
      
      if (deletedCount > 0) {
        // Refresh transactions list
        const allTransactions = await dataService.getAllTransactions();
        setTransactions(allTransactions);
        setFilteredTransactions(allTransactions);
        
        // Clear selection
        if (gridApi) {
          gridApi.deselectAll();
        }
        setSelectedTransactions([]);
        
        console.log(`✅ Successfully deleted ${deletedCount} transactions`);
      }
    } catch (error) {
      console.error('❌ Error during bulk delete:', error);
      alert('Failed to delete transactions. Please try again.');
    }
  };

  const handleBulkMarkAsVerified = async () => {
    if (selectedTransactions.length === 0) return;

    const unverifiedTransactions = selectedTransactions.filter(t => !t.isVerified);
    if (unverifiedTransactions.length === 0) {
      alert('All selected transactions are already verified.');
      return;
    }

    const confirmMessage = `Mark ${unverifiedTransactions.length} transaction(s) as verified?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      let updateCount = 0;

      for (const transaction of unverifiedTransactions) {
        const updates: Partial<Transaction> = {
          isVerified: true,
          lastModifiedDate: new Date()
        };

        await dataService.updateTransaction(transaction.id, updates, 'Bulk operation: Mark as verified');
        updateCount++;
      }

      // Refresh transactions
      const allTransactions = await dataService.getAllTransactions();
      setTransactions(allTransactions);
      setFilteredTransactions(allTransactions);

      console.log(`✅ Bulk verify completed for ${updateCount} transactions`);
    } catch (error) {
      console.error('❌ Error during bulk verify:', error);
      alert('Failed to verify transactions. Please try again.');
    }
  };

  const handleBulkEditCancel = () => {
    setShowBulkEditModal(false);
    setBulkEditForm({
      operation: 'set-category',
      category: '',
      subcategory: '',
      account: '',
      findText: '',
      replaceText: ''
    });
  };

  const handleBulkEditSubmit = async () => {
    if (selectedTransactions.length === 0) return;

    try {
      let updateCount = 0;

      for (const transaction of selectedTransactions) {
        let updatedTransaction: Partial<Transaction> = {};
        let note = '';

        switch (bulkEditForm.operation) {
          case 'set-category':
            if (bulkEditForm.category) {
              updatedTransaction.category = bulkEditForm.category;
              updatedTransaction.subcategory = bulkEditForm.subcategory || '';
              note = `Bulk edit: Set category to ${bulkEditForm.category}${bulkEditForm.subcategory ? ' → ' + bulkEditForm.subcategory : ''}`;
            }
            break;
          
          case 'set-account':
            if (bulkEditForm.account) {
              updatedTransaction.account = bulkEditForm.account;
              note = `Bulk edit: Set account to ${bulkEditForm.account}`;
            }
            break;
          
          case 'find-replace':
            if (bulkEditForm.findText && transaction.description.includes(bulkEditForm.findText)) {
              updatedTransaction.description = transaction.description.replace(
                new RegExp(bulkEditForm.findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
                bulkEditForm.replaceText
              );
              note = `Bulk edit: Find/Replace "${bulkEditForm.findText}" → "${bulkEditForm.replaceText}"`;
            }
            break;
        }

        if (Object.keys(updatedTransaction).length > 0) {
          updatedTransaction.lastModifiedDate = new Date();
          await dataService.updateTransaction(transaction.id, updatedTransaction, note);
          updateCount++;
        }
      }

      // Refresh transactions
      const allTransactions = await dataService.getAllTransactions();
      setTransactions(allTransactions);
      setFilteredTransactions(allTransactions);

      // Clear selection and close modal
      if (gridApi) {
        gridApi.deselectAll();
      }
      setSelectedTransactions([]);
      setShowBulkEditModal(false);

      console.log(`✅ Bulk edit completed for ${updateCount} transactions`);
    } catch (error) {
      console.error('❌ Error during bulk edit:', error);
      alert('Failed to update transactions. Please try again.');
    }
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

    // Filter for matched transfers only if enabled
    if (showMatchedTransfersOnly) {
      filtered = filtered.filter((t: Transaction) => 
        t.type === 'transfer' && t.reimbursementId
      );
    }

    setFilteredTransactions(filtered);
  }, [transactions, filters, showReimbursedTransactions, showMatchedTransfersOnly, filterNonReimbursed]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  // Refresh undo/redo status when filtered transactions change
  useEffect(() => {
    refreshAllUndoRedoStatus();
  }, [refreshAllUndoRedoStatus]);

  // Add keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Get the currently focused/selected transaction (if any)
        // For now, we'll need a way to track which transaction is "active"
        // This is a simplified implementation - in a real app you might track this differently
        if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
          e.preventDefault();
          // For demo purposes, let's undo the most recent transaction that can be undone
          const undoableTransaction = filteredTransactions.find(t => 
            undoRedoStatus[t.id]?.canUndo
          );
          if (undoableTransaction) {
            handleUndoTransaction(undoableTransaction.id);
          }
        } else if ((e.key === 'y' || e.key === 'Y') || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          // For demo purposes, let's redo the most recent transaction that can be redone
          const redoableTransaction = filteredTransactions.find(t => 
            undoRedoStatus[t.id]?.canRedo
          );
          if (redoableTransaction) {
            handleRedoTransaction(redoableTransaction.id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredTransactions, undoRedoStatus, handleUndoTransaction, handleRedoTransaction]);

  const countMatchedTransfers = (transactions: Transaction[]): number => {
    return transactions.filter(tx => 
      tx.type === 'transfer' && tx.reimbursementId
    ).length;
  };

  const countReimbursedTransactions = (transactions: Transaction[]): number => {
    return transactions.filter(tx => tx.reimbursed).length;
  };

  // Calculate stats in default currency using conversion batch
  useEffect(() => {
    const run = async () => {
      try {
        const transactionsToCalculate = showReimbursedTransactions ? filteredTransactions : filterNonReimbursed(filteredTransactions);
        const nonTransferTransactions = transactionsToCalculate.filter((t: Transaction) => t.type !== 'transfer');

        await currencyDisplayService.initialize();
        const converted = await currencyDisplayService.convertTransactionsBatch(nonTransferTransactions);

        const totalIncome = converted
          .filter((t: Transaction) => t.type === 'income')
          .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

        const totalExpenses = converted
          .filter((t: Transaction) => t.type === 'expense')
          .reduce((sum: number, t: Transaction) => sum + Math.abs(t.amount), 0);

        setStats({
          totalIncome,
          totalExpenses,
          netAmount: totalIncome - totalExpenses,
          count: converted.length
        });
      } catch (e) {
        console.error('Failed to compute totals with currency conversion:', e);
        // Fallback: compute without conversion
        const transactionsToCalculate = showReimbursedTransactions ? filteredTransactions : filterNonReimbursed(filteredTransactions);
        const nonTransferTransactions = transactionsToCalculate.filter((t: Transaction) => t.type !== 'transfer');
        const totalIncome = nonTransferTransactions
          .filter((t: Transaction) => t.type === 'income')
          .reduce((sum: number, t: Transaction) => sum + t.amount, 0);
        const totalExpenses = nonTransferTransactions
          .filter((t: Transaction) => t.type === 'expense')
          .reduce((sum: number, t: Transaction) => sum + Math.abs(t.amount), 0);
        setStats({
          totalIncome,
          totalExpenses,
          netAmount: totalIncome - totalExpenses,
          count: nonTransferTransactions.length
        });
      }
    };
    run();
  }, [filteredTransactions, showReimbursedTransactions, filterNonReimbursed]);

  // Format stats for display using default currency
  useEffect(() => {
    const run = async () => {
      try {
        await currencyDisplayService.initialize();
        const income = await currencyDisplayService.formatAmount(stats.totalIncome);
        const expenses = await currencyDisplayService.formatAmount(stats.totalExpenses);
        const net = await currencyDisplayService.formatAmount(stats.netAmount);
        setFormattedStats({ totalIncome: income, totalExpenses: expenses, netAmount: net });
      } catch {
        try {
          const code = await currencyDisplayService.getDefaultCurrency();
          const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: code || 'USD' }).format(n);
          setFormattedStats({ totalIncome: fmt(stats.totalIncome), totalExpenses: fmt(stats.totalExpenses), netAmount: fmt(stats.netAmount) });
        } catch {
          const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
          setFormattedStats({ totalIncome: fmt(stats.totalIncome), totalExpenses: fmt(stats.totalExpenses), netAmount: fmt(stats.netAmount) });
        }
      }
    };
    run();
  }, [stats]);

  // Actions cell renderer component
  const ActionsCellRenderer = React.useCallback((params: any) => {
    const transactionId = params.data.id;
    const transactionStatus = undoRedoStatus[transactionId];
    
    const handleEditClick = () => {
      startEditTransaction(params.data);
    };

    const handleDeleteClick = () => {
      handleDeleteTransaction(params.data.id);
    };

    const handleUndoClick = () => {
      handleUndoTransaction(transactionId);
    };

    const handleRedoClick = () => {
      handleRedoTransaction(transactionId);
    };

    const handleSuggestCategory = async () => {
      const tx: Transaction = params.data;
      try {
        const [result] = await azureOpenAIService.classifyTransactionsBatch([
          {
            transactionText: tx.description,
            amount: tx.amount,
            date: tx.date.toISOString(),
            availableCategories: categoriesCatalog,
          },
        ]);

        // Map returned ids to display names using categoriesCatalog
        const idToNameCategory = new Map(categoriesCatalog.map(c => [c.id, c.name]));
        const subMap = new Map<string, { name: string; parentId: string }>();
        categoriesCatalog.forEach(c => (c.subcategories || []).forEach(s => subMap.set(s.id, { name: s.name, parentId: c.id })));

        let categoryName = idToNameCategory.get(result.categoryId) || (result.categoryId || 'Uncategorized');
        let subName: string | undefined = result.subcategoryId ? subMap.get(result.subcategoryId)?.name : undefined;

        // Update the transaction with suggested category
  const updates: Partial<Transaction> = {
          category: categoryName,
          subcategory: subName,
          confidence: result.confidence,
          reasoning: result.reasoning,
          aiProxyMetadata: result.proxyMetadata,
          isVerified: false,
  };

  const note = `AI Suggest Category: ${tx.category}${tx.subcategory ? ' → ' + tx.subcategory : ''} → ${updates.category}${updates.subcategory ? ' → ' + updates.subcategory : ''}`;
  await dataService.updateTransaction(tx.id, updates, note);

        const all = await dataService.getAllTransactions();
        setTransactions(all);
        setFilteredTransactions(all);
      } catch (e) {
        console.error('Suggest Category failed:', e);
        alert('Failed to suggest category');
      }
    };

    const handleHistory = async () => {
      await openHistory(params.data);
    };

    const handleFindMatchingTransfers = async () => {
      if (params.data.type !== 'transfer') {
        alert('This action is only available for transfer transactions.');
        return;
      }
      
      // Open the transfer match dialog for this specific transaction
      setSelectedTransactionForMatching(params.data);
      setShowTransferMatchDialog(true);
    };

    const actions: MenuAction[] = [
      {
        icon: '✏️',
        label: 'Edit Transaction',
        onClick: handleEditClick
      }
    ];

    // Add undo/redo actions if available
    if (transactionStatus?.canUndo) {
      actions.push({
        icon: '↶',
        label: 'Undo Edit',
        onClick: handleUndoClick
      });
    }
    
    if (transactionStatus?.canRedo) {
      actions.push({
        icon: '↷',
        label: 'Redo Edit',
        onClick: handleRedoClick
      });
    }

    actions.push(
      {
        icon: '🤖',
        label: 'Suggest Category',
        onClick: handleSuggestCategory
      },
      {
        icon: '🕘',
        label: 'History',
        onClick: handleHistory
      }
    );

    // Add transfer-specific action if this is a transfer transaction
    if (params.data.type === 'transfer') {
      actions.push({
        icon: '🔄',
        label: 'Find Matching Transfer(s)',
        onClick: handleFindMatchingTransfers
      });
    }

    actions.push({
      icon: '🔍',
      label: 'View All Matching Transactions',
      onClick: () => {
        navigate('/transfer-matches');
      }
    });

    actions.push({
      icon: '🗑️',
      label: 'Delete Transaction',
      onClick: handleDeleteClick,
      variant: 'danger'
    });

    return <ActionsMenu key={`actions-${params.data.id}`} menuId={`menu-${params.data.id}`} actions={actions} />;
  }, [startEditTransaction, handleDeleteTransaction, undoRedoStatus, handleUndoTransaction, handleRedoTransaction, navigate]);

  const columnDefs: ColDef[] = [
    {
      headerName: '',
      width: 50,
      checkboxSelection: true,
      headerCheckboxSelection: true,
      pinned: 'left',
      suppressSizeToFit: true,
      suppressMovable: true,
      sortable: false,
      filter: false
    },
    {
      headerName: 'Date',
      field: 'date',
      sortable: true,
      filter: 'agDateColumnFilter',
      sort: 'desc',
      sortIndex: 0,
      width: 120,
      comparator: (a: any, b: any) => {
        // Normalize values that could be Date, string, or number
        const toTime = (v: any): number => {
          if (!v) return 0;
          if (v instanceof Date) return v.getTime();
          if (typeof v === 'number') return v;
          const t = new Date(v as any).getTime();
          return Number.isFinite(t) ? t : 0;
        };
        const ta = toTime(a);
        const tb = toTime(b);
        return ta - tb;
      },
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
      minWidth: 200,
      editable: true,
      cellEditor: TextCellEditor
    },
    {
      headerName: 'Category',
      field: 'category',
      sortable: true,
      filter: 'agTextColumnFilter',
      filterParams: {
        textMatcher: ({ value, filterText }: any) => {
          return value.toLowerCase().includes(filterText.toLowerCase());
        },
        buttons: ['clear', 'apply']
      },
      width: 180,
      cellRenderer: CategoryCellRenderer,
      editable: true,
      cellEditor: CategoryCellEditor
    },
    {
      headerName: 'Account',
      field: 'account',
      sortable: true,
      filter: 'agTextColumnFilter',
      filterParams: {
        textMatcher: ({ value, filterText }: any) => {
          return value.toLowerCase().includes(filterText.toLowerCase());
        },
        buttons: ['clear', 'apply']
      },
      width: 140,
      editable: true,
      cellEditor: AccountCellEditor
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
      cellEditor: TextCellEditor
    },
    {
      headerName: 'AI Confidence',
      field: 'confidence',
      sortable: true,
      width: 130,
      cellRenderer: ConfidenceCellRenderer,
      filter: false // Disable filter for this column as it's not useful
    },
    {
      headerName: 'Reimbursed',
      field: 'reimbursed',
      width: 110,
      filter: 'agTextColumnFilter',
      filterParams: {
        textMatcher: ({ value, filterText }: any) => {
          const displayValue = value ? 'yes' : 'no';
          return displayValue.includes(filterText.toLowerCase());
        },
        buttons: ['clear', 'apply']
      },
      cellRenderer: (params: any) => {
        return params.value ? '💰' : '';
      }
    },
    {
      headerName: 'File',
      width: 50,
      pinned: 'right',
      cellRenderer: (params: any) => {
        if (params.data.attachedFile) {
          return `<span style="cursor: pointer; font-size: 16px;" title="View attached file">📎</span>`;
        }
        return '';
      },
      editable: false,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      suppressSizeToFit: true,
      suppressMovable: true,
      onCellClicked: (params: any) => {
        if (params.data.attachedFile) {
          setPreviewFile(params.data.attachedFile);
        }
      }
    },
    {
      headerName: 'Actions',
      width: 80,
      pinned: 'right',
      cellRenderer: ActionsCellRenderer,
  cellClass: 'actions-cell',
      editable: false,
      suppressHeaderMenuButton: true,
      sortable: false,
      filter: false,
      suppressSizeToFit: true,
      suppressMovable: true
    }
  ];

  // Synchronous fallback for cases where we need immediate formatting
  const formatCurrencySync = (amount: number) => {
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

  const handleAutoCategorizeUncategorized = async () => {
    try {
      // Find all uncategorized transactions
      const uncategorizedTransactions = transactions.filter(t => t.category === 'Uncategorized');
      
      if (uncategorizedTransactions.length === 0) {
        alert('No uncategorized transactions found!');
        return;
      }

      const confirmMessage = `Found ${uncategorizedTransactions.length} uncategorized transaction(s). Do you want to auto-categorize them using AI?`;
      if (!window.confirm(confirmMessage)) {
        return;
      }

      console.log(`🤖 Starting AI categorization for ${uncategorizedTransactions.length} transactions...`);

      // Process transactions in batches to avoid overwhelming the AI service
      for (const transaction of uncategorizedTransactions) {
        try {
          const [result] = await azureOpenAIService.classifyTransactionsBatch([
            {
              transactionText: transaction.description,
              amount: transaction.amount,
              date: transaction.date.toISOString(),
              availableCategories: categoriesCatalog,
            },
          ]);

          // Map returned ids to display names using categoriesCatalog
          const idToNameCategory = new Map(categoriesCatalog.map(c => [c.id, c.name]));
          const subMap = new Map<string, { name: string; parentId: string }>();
          categoriesCatalog.forEach(c => (c.subcategories || []).forEach(s => subMap.set(s.id, { name: s.name, parentId: c.id })));

          let categoryName = idToNameCategory.get(result.categoryId) || (result.categoryId || 'Uncategorized');
          let subName: string | undefined = result.subcategoryId ? subMap.get(result.subcategoryId)?.name : undefined;

          // Update the transaction with AI suggested category
          const updates: Partial<Transaction> = {
            category: categoryName,
            subcategory: subName,
            confidence: result.confidence,
            reasoning: result.reasoning,
            aiProxyMetadata: result.proxyMetadata,
            isVerified: false,
          };

          const note = `AI Auto-Categorize: Uncategorized → ${updates.category}${updates.subcategory ? ' → ' + updates.subcategory : ''}`;
          await dataService.updateTransaction(transaction.id, updates, note);

          console.log(`✅ Categorized: ${transaction.description} → ${categoryName}${subName ? ' → ' + subName : ''}`);
        } catch (error) {
          console.error(`❌ Failed to categorize transaction: ${transaction.description}`, error);
        }
      }

      // Refresh the transactions list
      const updatedTransactions = await dataService.getAllTransactions();
      setTransactions(updatedTransactions);
      setFilteredTransactions(updatedTransactions);

      alert(`Successfully auto-categorized ${uncategorizedTransactions.length} transaction(s)!`);
    } catch (error) {
      console.error('Auto-categorization failed:', error);
      alert('Failed to auto-categorize transactions. Please try again.');
    }
  };

  const handleSearchAnomalies = async () => {
    try {
      if (transactions.length === 0) {
        alert('No transactions to analyze!');
        return;
      }

      const confirmMessage = `Analyze ${transactions.length} transaction(s) for anomalies using AI? This may take a few moments.`;
      if (!window.confirm(confirmMessage)) {
        return;
      }

      console.log(`🔍 Starting anomaly detection for ${transactions.length} transactions...`);
      setIsAnomalyDetectionLoading(true);

      const result = await azureOpenAIService.detectAnomalies({
        transactions: transactions
      });

      console.log(`✅ Anomaly detection completed. Found ${result.anomalies.length} anomalies.`);
      
      setAnomalies(result.anomalies);
      setShowAnomalyResults(true);

      if (result.anomalies.length === 0) {
        alert('No anomalies detected! All transactions appear normal.');
      } else {
        alert(`Found ${result.anomalies.length} potentially anomalous transaction(s). Check the results below.`);
      }

    } catch (error) {
      console.error('Anomaly detection failed:', error);
      alert('Failed to detect anomalies. Please try again later.');
    } finally {
      setIsAnomalyDetectionLoading(false);
    }
  };

  const handleApplyMatch = async (match: ReimbursementMatch) => {
    const updatedTransactions = await applyMatches(transactions, [match]);
    setTransactions(updatedTransactions);
  };
  const handleApplyTransferMatch = async (match: any) => {
    const updatedTransactions = await applyTransferMatches(transactions, [match]);
    setTransactions(updatedTransactions);
    setFilteredTransactions(updatedTransactions);
  };

  const handleUnmatchTransfer = async (matchId: string) => {
    const updatedTransactions = await unmatchTransfers(transactions, matchId);
    setTransactions(updatedTransactions);
    setFilteredTransactions(updatedTransactions);
  };

  const handleFindTransfers = async () => {
    const result = await findTransferMatches({
      transactions,
      maxDaysDifference: 7,
      tolerancePercentage: 0.01
    });
    
    if (result) {
      setShowTransferMatchingPanel(true);
    }
  };

  const getConfidenceClass = (confidence: number) => {
    if (confidence > 0.9) return 'high';
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
                      Expense: {expense.description} ({formatCurrencySync(expense.amount)})
                    </div>
                    <div className="reimbursement">
                      Reimbursement: {reimbursement.description} ({formatCurrencySync(reimbursement.amount)})
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

  const renderTransferMatchingPanel = () => {
    if (!showTransferMatchingPanel) return null;

    const existingMatches = getMatchedTransfers(transactions);
    const allMatches = [...existingMatches, ...transferMatches];

    return (
      <TransferMatchingPanel>
        <div className="panel-header">
          <h3>Transfer Matches ({allMatches.length})</h3>
          <Button variant="outline" onClick={() => setShowTransferMatchingPanel(false)}>
            Close
          </Button>
        </div>
        
        {transferMatchingError && (
          <div style={{ color: '#f44336', marginBottom: '16px' }}>
            Error: {transferMatchingError}
          </div>
        )}
        
        <div className="matches-list">
          {allMatches.length === 0 ? (
            <div className="no-matches">
              No transfer matches found. Try adjusting the date range or tolerance settings.
            </div>
          ) : (
            allMatches.map((match) => {
              const sourceTx = transactions.find(t => t.id === match.sourceTransactionId);
              const targetTx = transactions.find(t => t.id === match.targetTransactionId);
              
              if (!sourceTx || !targetTx) return null;
              
              const isExisting = existingMatches.some(m => m.id === match.id);
              
              return (
                <div key={match.id} className="match-item">
                  <div className="match-info">
                    <div className="source-transfer">
                      Source: {sourceTx.description} ({formatCurrencySync(sourceTx.amount)}) - {sourceTx.account}
                    </div>
                    <div className="target-transfer">
                      Target: {targetTx.description} ({formatCurrencySync(targetTx.amount)}) - {targetTx.account}
                    </div>
                    <div className="match-details">
                      {match.reasoning} • {match.dateDifference} days apart
                      {match.amountDifference > 0 && ` • $${match.amountDifference.toFixed(2)} difference`}
                      {isExisting && ' • Currently matched'}
                    </div>
                  </div>
                  <div className="match-actions">
                    <span className={`confidence-badge ${getConfidenceClass(match.confidence)}`}>
                      {Math.round(match.confidence * 100)}%
                    </span>
                    {isExisting ? (
                      <Button 
                        variant="outline"
                        onClick={() => handleUnmatchTransfer(match.id)}
                        disabled={isTransferMatchingLoading}
                        style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                      >
                        Unmatch
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => handleApplyTransferMatch(match)}
                        disabled={isTransferMatchingLoading}
                        style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                      >
                        Apply
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </TransferMatchingPanel>
    );
  };

  const renderAnomalyResultsPanel = () => {
    if (!showAnomalyResults) return null;

    return (
      <AnomalyResultsPanel>
        <div className="anomaly-header">
          <h3>
            🔍 Anomaly Detection Results
            {anomalies.length > 0 && <span>({anomalies.length} found)</span>}
          </h3>
          <button 
            className="close-btn"
            onClick={() => setShowAnomalyResults(false)}
          >
            Close
          </button>
        </div>
        
        <div className="anomaly-list">
          {anomalies.length === 0 ? (
            <div className="no-anomalies">
              No anomalies detected. All transactions appear normal.
            </div>
          ) : (
            anomalies.map((anomaly, index) => (
              <div key={`${anomaly.transaction.id}-${index}`} className="anomaly-item">
                <div className="anomaly-info">
                  <div className="transaction-details">
                    {anomaly.transaction.description} - <AnomalyAmount tx={anomaly.transaction} />
                    <span style={{ color: '#666', fontWeight: 'normal', marginLeft: '8px' }}>
                      ({anomaly.transaction.date.toLocaleDateString()})
                    </span>
                  </div>
                  
                  <div style={{ marginBottom: '8px' }}>
                    <span className={`anomaly-type ${anomaly.anomalyType}`}>
                      {anomaly.anomalyType.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className={`severity-badge ${anomaly.severity}`}>
                      {anomaly.severity.toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="reasoning">
                    {anomaly.reasoning}
                    {anomaly.historicalContext && (
                      <div style={{ marginTop: '4px', fontSize: '0.9rem' }}>
                        📊 {anomaly.historicalContext}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="confidence-score">
                  {(anomaly.confidence * 100).toFixed(0)}%
                </div>
              </div>
            ))
          )}
        </div>
      </AnomalyResultsPanel>
    );
  };

  // Define the overflow menu actions
  const overflowMenuActions: MenuAction[] = [
    {
      icon: '💰',
      label: isMatchingLoading ? 'Finding...' : 'Find Reimbursements',
      onClick: handleFindReimbursements
    },
    {
      icon: '🔄',
      label: isTransferMatchingLoading ? 'Finding...' : 'Find Transfer Matches',
      onClick: handleFindTransfers
    },
    {
      icon: '🤖',
      label: 'Auto Categorize',
      onClick: handleAutoCategorizeUncategorized
    },
    {
      icon: '🔍',
      label: isAnomalyDetectionLoading ? 'Searching...' : 'Search for Anomalies',
      onClick: handleSearchAnomalies
    }
  ];

  return (
    <div>
      <PageHeader>
        <h1>Transactions</h1>
        <FlexBox gap="12px">
          <Button 
            variant="outline" 
            onClick={() => navigate('/rules')}
          >
            📋 Rules
          </Button>
          <Button variant="outline">Export</Button>
          <Button>Add Transaction</Button>
          <ActionsMenu 
            menuId="transactions-overflow-menu" 
            actions={overflowMenuActions} 
          />
        </FlexBox>
      </PageHeader>

      {renderReimbursementPanel()}

      {renderTransferMatchingPanel()}

      {renderAnomalyResultsPanel()}

      {/* Receipt Upload */}
      <ReceiptUpload 
        onTransactionAdded={handleReceiptTransactionAdded}
        onError={(error) => console.error('Receipt upload error:', error)}
      />

      {/* Bulk Operations Bar */}
      {selectedTransactions.length > 0 && (
        <BulkOperationsBar>
          <div className="bulk-header">
            <div className="selection-info">
              <span className="count">{selectedTransactions.length}</span>
              <span>transactions selected</span>
            </div>
            <button 
              className="clear-selection-btn"
              onClick={() => {
                if (gridApi) {
                  gridApi.deselectAll();
                }
                setSelectedTransactions([]);
              }}
            >
              Clear Selection
            </button>
          </div>
          <div className="bulk-actions">
            <Button variant="outline" onClick={handleBulkEdit}>
              📝 Edit
            </Button>
            <Button variant="outline" onClick={handleBulkMarkAsVerified}>
              ✅ Mark Verified
            </Button>
            <Button variant="outline" onClick={handleBulkDelete} style={{ color: '#f44336', borderColor: '#f44336' }}>
              🗑️ Delete
            </Button>
          </div>
        </BulkOperationsBar>
      )}

      <FileImport onImportComplete={handleImportComplete} />

      <FilterBar>
        <div className="filter-header">
          <h3>Column Filters</h3>
          <button 
            className="clear-filters-btn"
            onClick={handleClearAllFilters}
            disabled={!gridApi}
            title="Clear all active column filters"
          >
            🗑️ Clear All Filters
          </button>
        </div>
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
              <option value="transfer">Transfer</option>
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
        
        <div className="quick-filters-section">
          <div className="quick-filters-label">Quick Filters</div>
          <div className="quick-filters-container">
            <QuickFilterButton
              isActive={filters.category === 'Uncategorized'}
              activeColor="#ff9800"
              activeBackground="#fff3e0"
              onClick={() => setFilters({...filters, category: filters.category === 'Uncategorized' ? '' : 'Uncategorized'})}
            >
              ⚠️ Uncategorized ({filteredTransactions.filter(t => t.category === 'Uncategorized').length})
            </QuickFilterButton>
            
            <QuickFilterButton
              isActive={transferDisplayOptions.showTransfers}
              activeColor="#FF9800"
              activeBackground="#fff3e0"
              onClick={() => setTransferDisplayOptions({
                ...transferDisplayOptions,
                showTransfers: !transferDisplayOptions.showTransfers
              })}
              title="Toggle showing transfer transactions in main list"
            >
              💱 Show Transfers
            </QuickFilterButton>

            {transferMatchingService.countUnmatchedTransfers(transactions) > 0 && (
              <QuickFilterButton
                isActive={filters.type === 'transfer'}
                activeColor="#9C27B0"
                activeBackground="#f3e5f5"
                onClick={() => setFilters({...filters, type: filters.type === 'transfer' ? '' : 'transfer'})}
                title="Unmatched transfer transactions"
              >
                🔄 Unmatched Transfers ({transferMatchingService.countUnmatchedTransfers(transactions)})
              </QuickFilterButton>
            )}
            
            {countMatchedTransfers(transactions) > 0 && (
              <QuickFilterButton
                isActive={showMatchedTransfersOnly}
                activeColor="#673AB7"
                activeBackground="#ede7f6"
                onClick={() => setShowMatchedTransfersOnly(!showMatchedTransfersOnly)}
                title="Show only matched transfer transactions"
              >
                ✅ Matched Transfers ({countMatchedTransfers(transactions)})
              </QuickFilterButton>
            )}
            
            {countReimbursedTransactions(transactions) > 0 && (
              <QuickFilterButton
                isActive={showReimbursedTransactions}
                activeColor="#4CAF50"
                activeBackground="#e8f5e8"
                onClick={() => setShowReimbursedTransactions(!showReimbursedTransactions)}
                title="Toggle showing reimbursed transactions"
              >
                💰 Show Reimbursed ({countReimbursedTransactions(transactions)})
              </QuickFilterButton>
            )}
          </div>
        </div>
      </FilterBar>

      <StatsBar>
        <div className="stat">
          <div className="label">Total Income</div>
          <div className="value positive">{formattedStats.totalIncome}</div>
        </div>
        <div className="stat">
          <div className="label">Total Expenses</div>
          <div className="value negative">{formattedStats.totalExpenses}</div>
        </div>
        <div className="stat">
          <div className="label">Net Amount</div>
          <div className={`value ${stats.netAmount >= 0 ? 'positive' : 'negative'}`}>
            {formattedStats.netAmount}
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
              onSelectionChanged={onSelectionChanged}
              rowSelection="multiple"
              suppressRowClickSelection={true}
              pagination={true}
              paginationPageSize={pageSize}
              paginationPageSizeSelector={allowedPageSizes}
              defaultColDef={{
                resizable: true,
                sortable: true,
                filter: true,
                floatingFilter: false, // Disable floating filters to reduce clutter
                menuTabs: ['filterMenuTab', 'generalMenuTab'] // Only show filter and general tabs
              }}
              singleClickEdit={true}
              stopEditingWhenCellsLoseFocus={true}
              undoRedoCellEditing={true}
              reactiveCustomComponents={true}
              suppressMenuHide={true} // Keep menu open after applying filter
              animateRows={true}
            />
          </div>
        </TransactionsContainer>
      </Card>

      {/* Transfer List Section */}
      {transferDisplayOptions.showTransfers && (
        <TransferList
          collapsedTransfers={collapsedTransfers}
          allTransfers={transactions.filter(t => t.type === 'transfer')}
          displayOptions={transferDisplayOptions}
          onDisplayOptionsChange={setTransferDisplayOptions}
          onUnmatchTransfer={async (matchId: string) => {
            try {
              const updatedTransactions = await unmatchTransfers(transactions, matchId);
              setTransactions(updatedTransactions);
              
              // Reload collapsed transfers
              const collapsed = await dataService.getCollapsedTransfers();
              setCollapsedTransfers(collapsed);
            } catch (error) {
              console.error('Error unmatching transfer:', error);
            }
          }}
          onViewTransaction={(transactionId: string) => {
            const transaction = transactions.find(t => t.id === transactionId);
            if (transaction) {
              setSelectedTransaction(transaction);
              setShowConfidencePopup(true);
            }
          }}
        />
      )}

      {/* History Modal */}
      {showHistoryModal && historyFor && (
        <EditModalOverlay onClick={() => setShowHistoryModal(false)}>
          <EditModalContent onClick={(e) => e.stopPropagation()}>
            <h2>History for “{historyFor.description}”</h2>
            {historyItems.length === 0 ? (
              <div style={{ color: '#666' }}>No history recorded.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {historyItems.map(h => (
                  <div key={h.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <strong>{new Date(h.timestamp).toLocaleString()}</strong>
                        {h.note ? <span style={{ color: '#666' }}> • {h.note}</span> : null}
                      </div>
                      <Button variant="outline" onClick={() => restoreHistory(h.id)}>Restore</Button>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#444' }}>
                      <div><strong>Description:</strong> {h.data.description}</div>
                      <div><strong>Amount:</strong> {formatCurrencySync(h.data.amount)}</div>
                      <div><strong>Category:</strong> {h.data.category}{h.data.subcategory ? ` → ${h.data.subcategory}` : ''}</div>
                      <div><strong>Account:</strong> {h.data.account}</div>
                      <div><strong>Date:</strong> {new Date(h.data.date).toLocaleDateString()}</div>
                      {h.data.notes ? <div><strong>Notes:</strong> {h.data.notes}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={() => setShowHistoryModal(false)}>Close</Button>
            </div>
          </EditModalContent>
        </EditModalOverlay>
      )}

      {/* Bulk Edit Modal */}
      {showBulkEditModal && (
        <EditModalOverlay onClick={handleBulkEditCancel}>
          <EditModalContent onClick={(e) => e.stopPropagation()}>
            <h2>Bulk Edit {selectedTransactions.length} Transactions</h2>
            
            <div className="form-group">
              <label>Operation</label>
              <select
                value={bulkEditForm.operation}
                onChange={(e) => setBulkEditForm({...bulkEditForm, operation: e.target.value as any})}
              >
                <option value="set-category">Set Category</option>
                <option value="set-account">Set Account</option>
                <option value="find-replace">Find & Replace Text</option>
              </select>
            </div>

            {bulkEditForm.operation === 'set-category' && (
              <>
                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={bulkEditForm.category}
                    onChange={(e) => setBulkEditForm({...bulkEditForm, category: e.target.value, subcategory: ''})}
                  >
                    <option value="">Select Category</option>
                    {defaultCategories.map(cat => (
                      <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                {bulkEditForm.category && (
                  <div className="form-group">
                    <label>Subcategory (Optional)</label>
                    <select
                      value={bulkEditForm.subcategory}
                      onChange={(e) => setBulkEditForm({...bulkEditForm, subcategory: e.target.value})}
                    >
                      <option value="">No Subcategory</option>
                      {getAvailableSubcategories(bulkEditForm.category).map(sub => (
                        <option key={sub.id} value={sub.name}>{sub.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            {bulkEditForm.operation === 'set-account' && (
              <div className="form-group">
                <label>Account</label>
                <select
                  value={bulkEditForm.account}
                  onChange={(e) => setBulkEditForm({...bulkEditForm, account: e.target.value})}
                >
                  <option value="">Select Account</option>
                  {uniqueAccounts.map(account => (
                    <option key={account} value={account}>{account}</option>
                  ))}
                </select>
              </div>
            )}

            {bulkEditForm.operation === 'find-replace' && (
              <>
                <div className="form-group">
                  <label>Find Text</label>
                  <input
                    type="text"
                    value={bulkEditForm.findText}
                    onChange={(e) => setBulkEditForm({...bulkEditForm, findText: e.target.value})}
                    placeholder="Text to find in descriptions"
                  />
                </div>

                <div className="form-group">
                  <label>Replace With</label>
                  <input
                    type="text"
                    value={bulkEditForm.replaceText}
                    onChange={(e) => setBulkEditForm({...bulkEditForm, replaceText: e.target.value})}
                    placeholder="Replacement text"
                  />
                </div>

                {bulkEditForm.findText && (
                  <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '4px', marginTop: '8px' }}>
                    <strong>Preview:</strong> {selectedTransactions.filter(t => 
                      t.description.toLowerCase().includes(bulkEditForm.findText.toLowerCase())
                    ).length} transactions will be affected
                  </div>
                )}
              </>
            )}

            <div className="form-actions">
              <Button variant="outline" onClick={handleBulkEditCancel}>
                Cancel
              </Button>
              <Button 
                onClick={handleBulkEditSubmit}
                disabled={
                  (bulkEditForm.operation === 'set-category' && !bulkEditForm.category) ||
                  (bulkEditForm.operation === 'set-account' && !bulkEditForm.account) ||
                  (bulkEditForm.operation === 'find-replace' && (!bulkEditForm.findText || !bulkEditForm.replaceText))
                }
              >
                Apply to {selectedTransactions.length} Transaction{selectedTransactions.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </EditModalContent>
        </EditModalOverlay>
      )}

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
                  <option value="transfer">Transfer</option>
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
                  {defaultCategories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
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
                <select
                  value={transactionForm.subcategory}
                  onChange={(e) => handleEditFormChange('subcategory', e.target.value)}
                  disabled={!transactionForm.category}
                >
                  <option value="">Select Subcategory</option>
                  {transactionForm.category && getAvailableSubcategories(transactionForm.category).map(sub => (
                    <option key={sub.id} value={sub.name}>{sub.name}</option>
                  ))}
                </select>
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

            {/* Transaction Split Manager */}
            {editingTransaction && (
              <TransactionSplitManager
                transaction={{
                  ...editingTransaction,
                  amount: parseFloat(transactionForm.amount) || editingTransaction.amount,
                  splits: transactionForm.splits
                }}
                categories={defaultCategories}
                onSplitsChange={handleSplitsChange}
              />
            )}

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

      {/* AI Confidence Popup */}
      <AiConfidencePopup
        isOpen={showConfidencePopup}
        onClose={() => setShowConfidencePopup(false)}
        confidence={selectedTransaction?.confidence || 0}
        reasoning={selectedTransaction?.reasoning}
        category={selectedTransaction?.category || ''}
        subcategory={selectedTransaction?.subcategory}
        description={selectedTransaction?.description || ''}
        amount={selectedTransaction?.amount || 0}
        proxyMetadata={selectedTransaction?.aiProxyMetadata}
      />

      {/* Category Edit Confirmation Dialog */}
      <CategoryEditConfirmDialog
        isOpen={showCategoryEditDialog}
        onClose={handleCategoryEditCancel}
        onConfirm={handleCategoryEditConfirm}
        transactionDescription={categoryEditData?.transaction.description || ''}
        oldCategory={categoryEditData?.transaction.category || ''}
        oldSubcategory={categoryEditData?.transaction.subcategory}
        newCategory={categoryEditData?.newCategory || ''}
        newSubcategory={categoryEditData?.newSubcategory}
      />

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreview
          file={previewFile}
          isOpen={!!previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Transfer Match Dialog */}
      <TransferMatchDialog
        isOpen={showTransferMatchDialog}
        transaction={selectedTransactionForMatching}
        allTransactions={transactions}
        onClose={() => {
          setShowTransferMatchDialog(false);
          setSelectedTransactionForMatching(null);
        }}
        onTransactionsUpdate={(updatedTransactions) => {
          setTransactions(updatedTransactions);
          setFilteredTransactions(updatedTransactions);
        }}
      />
    </div>
  );
};

export default Transactions;
