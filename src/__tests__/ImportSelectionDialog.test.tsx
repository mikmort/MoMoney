import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImportSelectionDialog from '../components/Settings/ImportSelectionDialog';
import { ExportData } from '../services/simplifiedImportExportService';

// Mock data for testing
const mockImportData: ExportData = {
  version: '1.0',
  exportDate: '2024-01-01T00:00:00.000Z',
  appVersion: '0.1.0',
  transactions: [
    { 
      id: 'tx1', 
      date: new Date('2024-01-01'), 
      amount: 100, 
      description: 'Test Transaction', 
      category: 'food', 
      account: 'test-account',
      type: 'expense' as const
    }
  ],
  preferences: { 
    currency: 'USD', 
    dateFormat: 'MM/dd/yyyy', 
    theme: 'light' as const,
    defaultAccount: 'test',
    enableNotifications: true,
    budgetAlerts: true,
    autoCategorizationEnabled: true,
    showInvestments: false,
    includeInvestmentsInReports: false
  },
  transactionHistory: [{ id: 'hist1', data: { date: new Date('2024-01-01') } }],
  accounts: [{ 
    id: 'acc1', 
    name: 'Test Account', 
    type: 'checking' as const, 
    institution: 'Test Bank',
    currency: 'USD',
    isActive: true
  }],
  rules: [{ 
    id: 'rule1', 
    name: 'Test Rule',
    isActive: true,
    priority: 1,
    conditions: [],
    action: { categoryId: 'food', categoryName: 'Food' },
    createdDate: new Date('2024-01-01'),
    lastModifiedDate: new Date('2024-01-01')
  }],
  categories: [{ 
    id: 'food', 
    name: 'Food', 
    type: 'expense' as const,
    subcategories: []
  }],
  budgets: [{ 
    id: 'budget1', 
    name: 'Test Budget',
    categoryId: 'food',
    amount: 500,
    period: 'monthly' as const,
    startDate: new Date('2024-01-01'),
    isActive: true
  }]
};

describe('ImportSelectionDialog', () => {
  const mockOnClose = jest.fn();
  const mockOnImport = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders dialog with all options when open', () => {
    render(
      <ImportSelectionDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
        importData={mockImportData}
        fileName="test-backup.json"
      />
    );

    expect(screen.getByText('Select Data to Import')).toBeInTheDocument();
    expect(screen.getByText('test-backup.json')).toBeInTheDocument();
    
    // Check that all import options are present
    expect(screen.getByText('💳 Accounts (with balances)')).toBeInTheDocument();
    expect(screen.getByText('📊 Transactions')).toBeInTheDocument();
    expect(screen.getByText('🏷️ Categories')).toBeInTheDocument();
    expect(screen.getByText('💰 Budgets')).toBeInTheDocument();
    expect(screen.getByText('📋 Rules')).toBeInTheDocument();
  });

  test('shows data preview with correct counts', () => {
    render(
      <ImportSelectionDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
        importData={mockImportData}
        fileName="test-backup.json"
      />
    );

    // Check data counts in preview - use more specific text
    expect(screen.getByText('1 transaction(s) available')).toBeInTheDocument();
    expect(screen.getByText('1 account(s) available')).toBeInTheDocument();
    expect(screen.getByText('1 categor(y/ies) available')).toBeInTheDocument();
    expect(screen.getByText('1 budget(s) available')).toBeInTheDocument();
    expect(screen.getByText('1 rule(s) available')).toBeInTheDocument();
  });

  test('all checkboxes are selected by default', () => {
    render(
      <ImportSelectionDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
        importData={mockImportData}
        fileName="test-backup.json"
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(10); // accounts, transactions, categories, budgets, rules, balanceHistory, currencyRates, transferMatches, preferences, transactionHistory
    
    checkboxes.forEach(checkbox => {
      expect(checkbox).toBeChecked();
    });
  });

  test('can toggle individual checkboxes', () => {
    render(
      <ImportSelectionDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
        importData={mockImportData}
        fileName="test-backup.json"
      />
    );

    // Get checkboxes by finding the checkbox within each option item
    const checkboxes = screen.getAllByRole('checkbox');
    const transactionsCheckbox = checkboxes[1]; // transactions is the second checkbox
    
    // Should be checked initially
    expect(transactionsCheckbox).toBeChecked();
    
    // Click to uncheck
    fireEvent.click(transactionsCheckbox);
    expect(transactionsCheckbox).not.toBeChecked();
    
    // Click to check again
    fireEvent.click(transactionsCheckbox);
    expect(transactionsCheckbox).toBeChecked();
  });

  test('Select None button deselects all checkboxes', () => {
    render(
      <ImportSelectionDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
        importData={mockImportData}
        fileName="test-backup.json"
      />
    );

    // First uncheck a box to test Select All
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // uncheck first checkbox
    expect(checkboxes[0]).not.toBeChecked();

    // Click Select All
    fireEvent.click(screen.getByText('Select All'));

    // All checkboxes should be checked
    checkboxes.forEach(checkbox => {
      expect(checkbox).toBeChecked();
    });
  });

  test('Select All button selects all checkboxes', () => {
    render(
      <ImportSelectionDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
        importData={mockImportData}
        fileName="test-backup.json"
      />
    );

    // Click Select None
    fireEvent.click(screen.getByText('Select None'));

    // All checkboxes should be unchecked
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach(checkbox => {
      expect(checkbox).not.toBeChecked();
    });
  });

  test('Import button is disabled when no selections are made', () => {
    render(
      <ImportSelectionDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
        importData={mockImportData}
        fileName="test-backup.json"
      />
    );

    // Click Select None to deselect all
    fireEvent.click(screen.getByText('Select None'));

    const importButton = screen.getByText('Import Selected Data');
    expect(importButton).toBeDisabled();
  });

  test('Import button is enabled when at least one selection is made', () => {
    render(
      <ImportSelectionDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
        importData={mockImportData}
        fileName="test-backup.json"
      />
    );

    const importButton = screen.getByText('Import Selected Data');
    expect(importButton).toBeEnabled();
  });

  test('calls onImport with correct options when Import button is clicked', () => {
    render(
      <ImportSelectionDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
        importData={mockImportData}
        fileName="test-backup.json"
      />
    );

    // Uncheck some options by using checkbox indices
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // accounts
    fireEvent.click(checkboxes[4]); // rules (last checkbox)

    // Click import
    fireEvent.click(screen.getByText('Import Selected Data'));

    expect(mockOnImport).toHaveBeenCalledWith(mockImportData, {
      accounts: false,
      transactions: true,
      rules: false,
      budgets: true,
      categories: true,
      balanceHistory: true,
      currencyRates: true,
      transferMatches: true,
      preferences: true,
      transactionHistory: true
    });
  });

  test('calls onClose when Cancel button is clicked', () => {
    render(
      <ImportSelectionDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
        importData={mockImportData}
        fileName="test-backup.json"
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('does not render when isOpen is false', () => {
    render(
      <ImportSelectionDialog
        isOpen={false}
        onClose={mockOnClose}
        onImport={mockOnImport}
        importData={mockImportData}
        fileName="test-backup.json"
      />
    );

    expect(screen.queryByText('Select Data to Import')).not.toBeInTheDocument();
  });

  test('handles null import data gracefully', () => {
    render(
      <ImportSelectionDialog
        isOpen={true}
        onClose={mockOnClose}
        onImport={mockOnImport}
        importData={null}
        fileName="test-backup.json"
      />
    );

    expect(screen.getByText('Select Data to Import')).toBeInTheDocument();
    // Should still render options but without data counts
  });
});