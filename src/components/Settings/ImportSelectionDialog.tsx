import React, { useState } from 'react';
import styled from 'styled-components';
import Modal from '../shared/Modal';
import { Button } from '../../styles/globalStyles';
import { ImportOptions, ExportData } from '../../services/simplifiedImportExportService';

interface ImportSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: ExportData, options: ImportOptions) => void;
  importData: ExportData | null;
  fileName: string;
}

const DialogContent = styled.div`
  .description {
    color: #666;
    margin-bottom: 24px;
    line-height: 1.5;
  }

  .data-preview {
    background: #f8f9fa;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 24px;
    border-left: 4px solid #2196f3;

    .preview-title {
      font-weight: 600;
      color: #333;
      margin-bottom: 8px;
    }

    .preview-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 14px;

      &:last-child {
        margin-bottom: 0;
      }

      .item-label {
        color: #666;
      }

      .item-count {
        color: #333;
        font-weight: 500;
      }
    }
  }
`;

const OptionsGrid = styled.div`
  display: grid;
  gap: 16px;
  margin-bottom: 24px;

  .option-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 8px;
    transition: all 0.2s ease;

    &:hover {
      border-color: #2196f3;
      background: #f8f9fa;
    }

    &.selected {
      border-color: #2196f3;
      background: #e3f2fd;
    }

    input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .option-content {
      flex: 1;

      .option-title {
        font-weight: 600;
        color: #333;
        margin-bottom: 4px;
      }

      .option-description {
        font-size: 14px;
        color: #666;
        line-height: 1.4;
      }

      .option-count {
        font-size: 12px;
        color: #2196f3;
        font-weight: 500;
        margin-top: 4px;
      }
    }
  }
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 24px;

  .select-buttons {
    display: flex;
    gap: 8px;
    margin-right: auto;
  }
`;

const SelectButton = styled.button`
  background: none;
  border: 1px solid #ddd;
  color: #666;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;

  &:hover {
    border-color: #2196f3;
    color: #2196f3;
  }
`;

export const ImportSelectionDialog: React.FC<ImportSelectionDialogProps> = ({
  isOpen,
  onClose,
  onImport,
  importData,
  fileName
}) => {
  const [options, setOptions] = useState<ImportOptions>({
    accounts: true,
    transactions: true,
    rules: true,
    budgets: true,
    categories: true,
    preferences: true,
    transactionHistory: true
  });

  const handleOptionChange = (key: keyof ImportOptions, value: boolean) => {
    setOptions(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSelectAll = () => {
    setOptions({
      accounts: true,
      transactions: true,
      rules: true,
      budgets: true,
      categories: true,
      preferences: true,
      transactionHistory: true
    });
  };

  const handleSelectNone = () => {
    setOptions({
      accounts: false,
      transactions: false,
      rules: false,
      budgets: false,
      categories: false,
      preferences: false,
      transactionHistory: false
    });
  };

  const handleImport = () => {
    if (importData) {
      onImport(importData, options);
    }
  };

  const hasAnySelection = Object.values(options).some(Boolean);

  // Calculate data counts for preview
  const dataCounts = importData ? {
    transactions: importData.transactions?.length || 0,
    accounts: importData.accounts?.length || 0,
    rules: importData.rules?.length || 0,
    budgets: importData.budgets?.length || 0,
    categories: importData.categories?.length || 0,
    preferences: importData.preferences ? 1 : 0,
    transactionHistory: importData.transactionHistory?.length || 0
  } : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Data to Import"
      maxWidth="600px"
    >
      <DialogContent>
        <div className="description">
          Choose which types of data you want to import from <strong>{fileName}</strong>. 
          All options are selected by default, but you can customize what gets imported.
        </div>

        {dataCounts && (
          <div className="data-preview">
            <div className="preview-title">📊 Available Data in Backup File</div>
            <div className="preview-item">
              <span className="item-label">Transactions:</span>
              <span className="item-count">{dataCounts.transactions}</span>
            </div>
            <div className="preview-item">
              <span className="item-label">Accounts:</span>
              <span className="item-count">{dataCounts.accounts}</span>
            </div>
            <div className="preview-item">
              <span className="item-label">Categories:</span>
              <span className="item-count">{dataCounts.categories}</span>
            </div>
            <div className="preview-item">
              <span className="item-label">Budgets:</span>
              <span className="item-count">{dataCounts.budgets}</span>
            </div>
            <div className="preview-item">
              <span className="item-label">Rules:</span>
              <span className="item-count">{dataCounts.rules}</span>
            </div>
            <div className="preview-item">
              <span className="item-label">Preferences:</span>
              <span className="item-count">{dataCounts.preferences}</span>
            </div>
            <div className="preview-item">
              <span className="item-label">History Entries:</span>
              <span className="item-count">{dataCounts.transactionHistory}</span>
            </div>
          </div>
        )}

        <OptionsGrid>
          <div className={`option-item ${options.accounts ? 'selected' : ''}`}>
            <input
              type="checkbox"
              checked={options.accounts}
              onChange={(e) => handleOptionChange('accounts', e.target.checked)}
            />
            <div className="option-content">
              <div className="option-title">💳 Accounts (with balances)</div>
              <div className="option-description">
                Import account information including names, types, institutions, and current balances
              </div>
              {dataCounts && dataCounts.accounts > 0 && (
                <div className="option-count">{dataCounts.accounts} account(s) available</div>
              )}
            </div>
          </div>

          <div className={`option-item ${options.transactions ? 'selected' : ''}`}>
            <input
              type="checkbox"
              checked={options.transactions}
              onChange={(e) => handleOptionChange('transactions', e.target.checked)}
            />
            <div className="option-content">
              <div className="option-title">📊 Transactions</div>
              <div className="option-description">
                Import all transaction data including amounts, dates, descriptions, and categorizations
              </div>
              {dataCounts && dataCounts.transactions > 0 && (
                <div className="option-count">{dataCounts.transactions} transaction(s) available</div>
              )}
            </div>
          </div>

          <div className={`option-item ${options.categories ? 'selected' : ''}`}>
            <input
              type="checkbox"
              checked={options.categories}
              onChange={(e) => handleOptionChange('categories', e.target.checked)}
            />
            <div className="option-content">
              <div className="option-title">🏷️ Categories</div>
              <div className="option-description">
                Import category and subcategory definitions for organizing your transactions
              </div>
              {dataCounts && dataCounts.categories > 0 && (
                <div className="option-count">{dataCounts.categories} categor(y/ies) available</div>
              )}
            </div>
          </div>

          <div className={`option-item ${options.budgets ? 'selected' : ''}`}>
            <input
              type="checkbox"
              checked={options.budgets}
              onChange={(e) => handleOptionChange('budgets', e.target.checked)}
            />
            <div className="option-content">
              <div className="option-title">💰 Budgets</div>
              <div className="option-description">
                Import budget definitions with amounts, periods, and alert thresholds
              </div>
              {dataCounts && dataCounts.budgets > 0 && (
                <div className="option-count">{dataCounts.budgets} budget(s) available</div>
              )}
            </div>
          </div>

          <div className={`option-item ${options.rules ? 'selected' : ''}`}>
            <input
              type="checkbox"
              checked={options.rules}
              onChange={(e) => handleOptionChange('rules', e.target.checked)}
            />
            <div className="option-content">
              <div className="option-title">📋 Rules</div>
              <div className="option-description">
                Import automatic categorization rules that help classify future transactions
              </div>
              {dataCounts && dataCounts.rules > 0 && (
                <div className="option-count">{dataCounts.rules} rule(s) available</div>
              )}
            </div>
          </div>
        </OptionsGrid>

        <ButtonRow>
          <div className="select-buttons">
            <SelectButton onClick={handleSelectAll}>Select All</SelectButton>
            <SelectButton onClick={handleSelectNone}>Select None</SelectButton>
          </div>
          
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          
          <Button
            onClick={handleImport}
            disabled={!hasAnySelection}
            style={{
              background: hasAnySelection ? '#4CAF50' : '#cccccc',
              borderColor: hasAnySelection ? '#4CAF50' : '#cccccc',
              color: 'white'
            }}
          >
            Import Selected Data
          </Button>
        </ButtonRow>
      </DialogContent>
    </Modal>
  );
};

export default ImportSelectionDialog;