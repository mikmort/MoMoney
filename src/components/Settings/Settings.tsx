import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { PageHeader, Card, Button } from '../../styles/globalStyles';
import { dataService } from '../../services/dataService';
import { userPreferencesService } from '../../services/userPreferencesService';
import { simplifiedImportExportService, ExportData, ImportOptions } from '../../services/simplifiedImportExportService';
import { azureOpenAIService } from '../../services/azureOpenAIService';
import { currencyExchangeService } from '../../services/currencyExchangeService';
import { useNotification } from '../../contexts/NotificationContext';
import { UserPreferences, CurrencyExchangeRate } from '../../types';
import ImportSelectionDialog from './ImportSelectionDialog';

const DangerZone = styled.div`
  border: 2px solid #f44336;
  border-radius: 8px;
  padding: 20px;
  margin-top: 20px;
  background: #fff5f5;
`;

const WarningText = styled.p`
  color: #f44336;
  font-weight: 500;
  margin: 12px 0;
`;

const ResetButton = styled(Button)`
  background: #f44336;
  color: white;
  border: 1px solid #f44336;

  &:hover {
    background: #d32f2f;
    border-color: #d32f2f;
  }

  &:disabled {
    background: #cccccc;
    border-color: #cccccc;
    cursor: not-allowed;
  }
`;

const ConfirmDialog = styled.div`
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

const ExchangeRatesModal = styled.div`
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

const ExchangeRatesContent = styled.div`
  background: white;
  padding: 24px;
  border-radius: 12px;
  max-width: 800px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  
  h3 {
    margin-bottom: 16px;
    color: #333;
  }
  
  .header-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
  }
  
  .status-info {
    font-size: 14px;
    color: #666;
    margin-bottom: 16px;
    padding: 12px;
    background: #f5f5f5;
    border-radius: 6px;
    
    &.stale {
      background: #fff3cd;
      border: 1px solid #ffeaa7;
      color: #856404;
    }
    
    .status-item {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      
      &:last-child {
        margin-bottom: 0;
      }
    }
  }
  
  .rates-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 16px;
    
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    
    th {
      background: #f8f9fa;
      font-weight: 600;
      color: #333;
    }
    
    tr:hover {
      background: #f8f9fa;
    }
    
    .currency-pair {
      font-weight: 500;
      color: #333;
    }
    
    .rate-value {
      font-family: monospace;
      font-weight: 500;
    }
    
    .source-info {
      font-size: 12px;
      color: #666;
    }
    
    .age-info {
      font-size: 12px;
      color: #888;
      
      &.fresh {
        color: #4CAF50;
      }
      
      &.stale {
        color: #FF9800;
      }
      
      &.very-stale {
        color: #f44336;
      }
    }
  }
  
  .no-rates {
    text-align: center;
    padding: 40px 20px;
    color: #666;
  }
  
  .buttons {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 24px;
    flex-wrap: wrap;
  }
`;

const SyncButton = styled(Button)`
  background: #2196F3;
  color: white;
  border: 1px solid #2196F3;
  
  &:hover {
    background: #1976D2;
    border-color: #1976D2;
  }
  
  &:disabled {
    background: #cccccc;
    border-color: #cccccc;
    cursor: not-allowed;
  }
`;

const ConfirmContent = styled.div`
  background: white;
  padding: 24px;
  border-radius: 12px;
  max-width: 500px;
  width: 90%;
  
  h3 {
    color: #f44336;
    margin-bottom: 16px;
  }
  
  .buttons {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 20px;
  }
`;

const PreferencesForm = styled.div`
  display: grid;
  gap: 16px;
  
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    
    label {
      font-weight: 500;
      color: #333;
    }
    
    select {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      background: white;
      
      &:focus {
        outline: none;
        border-color: #4CAF50;
        box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.1);
      }
    }
    
    .description {
      font-size: 14px;
      color: #666;
      margin-top: 4px;
    }
  }
`;

const SaveButton = styled(Button)`
  background: #4CAF50;
  color: white;
  border: 1px solid #4CAF50;
  
  &:hover {
    background: #45a049;
    border-color: #45a049;
  }
  
  &:disabled {
    background: #cccccc;
    border-color: #cccccc;
    cursor: not-allowed;
  }
`;

const Settings: React.FC = () => {
  const { showAlert, showConfirmation } = useNotification();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<'success' | 'error' | null>(null);
  const [deploymentInfo, setDeploymentInfo] = useState<string | null>(null);
  const [isExportingSupport, setIsExportingSupport] = useState(false);
  const [isDeduping, setIsDeduping] = useState(false);
  const [isLoadingSampleData, setIsLoadingSampleData] = useState(false);
  const [showExchangeRates, setShowExchangeRates] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<CurrencyExchangeRate[]>([]);
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [isSyncingRates, setIsSyncingRates] = useState(false);
  
  // Import selection dialog state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<ExportData | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>('');

  useEffect(() => {
    loadPreferences();
    loadDeploymentInfo();
  }, []);

  const loadPreferences = async () => {
    try {
      const prefs = await userPreferencesService.getPreferences();
      setPreferences(prefs);
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  };

  const loadDeploymentInfo = async () => {
    try {
      const serviceInfo = await azureOpenAIService.getServiceInfo();
      setDeploymentInfo(serviceInfo.model);
    } catch (error) {
      console.error('Failed to load deployment info:', error);
      setDeploymentInfo('Unknown');
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    
    try {
      const isConnected = await azureOpenAIService.testConnection();
      setConnectionTestResult(isConnected ? 'success' : 'error');
      
      // Clear the result after 5 seconds
      setTimeout(() => {
        setConnectionTestResult(null);
      }, 5000);
    } catch (error) {
      console.error('Connection test failed:', error);
      setConnectionTestResult('error');
      
      // Clear the result after 5 seconds
      setTimeout(() => {
        setConnectionTestResult(null);
      }, 5000);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handlePreferenceChange = (field: keyof UserPreferences, value: any) => {
    if (preferences) {
      setPreferences({
        ...preferences,
        [field]: value
      });
    }
  };

  const handleSavePreferences = async () => {
    if (!preferences) return;
    
    setIsSaving(true);
    try {
      await userPreferencesService.updatePreferences(preferences);
      showAlert('success', 'Preferences saved successfully!');
    } catch (error) {
      console.error('Failed to save preferences:', error);
      showAlert('error', 'Failed to save preferences. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetData = async () => {
    setIsResetting(true);
    try {
      console.log('[RESET] Starting true database reset...');
      
      // First close the database connection
      const { db } = await import('../../services/db');
      await db.close();
      console.log('[RESET] Database connection closed');
      
      // Delete the entire IndexedDB database (true reset)
      await indexedDB.deleteDatabase('MoMoneyDB');
      console.log('[RESET] IndexedDB database deleted completely');
      
      // Clear all localStorage keys used by the app
      const localStorageKeys = [
        'mo-money-accounts',
        'mo-money-categories', 
        'mo-money-templates',
        'transactionsPageSize',
        'APP_DATA_VERSION',
        // Legacy migration keys (safe to remove)
        'mo-money-transactions',
        'mo-money-transaction-history',
        // Rules service key
        'mo-money-category-rules'
      ];
      
      for (const key of localStorageKeys) {
        try {
          localStorage.removeItem(key);
          console.log(`[RESET] Cleared localStorage key: ${key}`);
        } catch (error) {
          console.warn(`[RESET] Failed to clear localStorage key ${key}:`, error);
        }
      }
      
      // Also clear rules via the service API for consistency
      try {
        const { rulesService } = await import('../../services/rulesService');
        await rulesService.clearAllRules();
        console.log('[RESET] Rules cleared via service API');
      } catch (error) {
        console.warn('[RESET] Failed to clear rules via service:', error);
      }
      
      // Clear all accounts via the service API
      try {
        const { accountManagementService } = await import('../../services/accountManagementService');
        accountManagementService.clearAllAccounts();
        console.log('[RESET] Accounts cleared via service API');
      } catch (error) {
        console.warn('[RESET] Failed to clear accounts via service:', error);
      }
      
      console.log('[RESET] Reset complete, reloading application...');
      showAlert('success', 'All data has been successfully reset. The page will reload to reflect the changes.', 'Reset Complete', { autoClose: false });
      setTimeout(() => window.location.reload(), 3000); // Reload after showing the message
    } catch (error) {
      console.error('[RESET] Failed to reset data:', error);
      showAlert('error', 'Failed to reset data. Please try again or use the fallback reset at /reset-db.html');
    } finally {
      setIsResetting(false);
      setShowConfirmDialog(false);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const exportData = await simplifiedImportExportService.exportData();
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `momoney-backup-${timestamp}.json`;
      simplifiedImportExportService.downloadFile(exportData, filename);
      showAlert('success', 'Data exported successfully! Your backup file has been downloaded.');
    } catch (error) {
      console.error('Failed to export data:', error);
      showAlert('error', 'Failed to export data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportToExcel = async () => {
    setIsExportingExcel(true);
    try {
      await simplifiedImportExportService.exportToExcel();
      showAlert('success', 'Data exported to Excel successfully! Your XLSX file has been downloaded with separate sheets for transactions, accounts, budgets, categories, rules, and more.');
    } catch (error) {
      console.error('Failed to export to Excel:', error);
      showAlert('error', 'Failed to export to Excel. Please try again.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      showAlert('error', 'Please select a valid JSON backup file (.json)');
      return;
    }

    try {
      const fileText = await simplifiedImportExportService.readFileAsText(file);
      const importData = JSON.parse(fileText);
      
      // Validate the import data structure
      if (!importData.version) {
        showAlert('error', 'Invalid backup file format - missing version information');
        return;
      }

      // Store the data and show selection dialog
      setPendingImportData(importData);
      setPendingFileName(file.name);
      setShowImportDialog(true);
    } catch (error) {
      console.error('Failed to read import file:', error);
      showAlert('error', 'Failed to read backup file. Please ensure you selected a valid Mo Money backup file and try again.');
    } finally {
      // Clear the file input
      event.target.value = '';
    }
  };

  const handleImportWithOptions = async (data: ExportData, options: ImportOptions) => {
    setIsImporting(true);
    setShowImportDialog(false);
    
    try {
      const result = await simplifiedImportExportService.importData(data, options);
      
      // Build success message based on what was imported
      const importedItems: string[] = [];
      if (options.transactions && result.transactions > 0) {
        importedItems.push(`• ${result.transactions} transactions imported`);
      }
      if (options.accounts && result.accounts && result.accounts > 0) {
        importedItems.push(`• ${result.accounts} accounts imported`);
      }
      if (options.categories && result.categories && result.categories > 0) {
        importedItems.push(`• ${result.categories} categories imported`);
      }
      if (options.budgets && result.budgets && result.budgets > 0) {
        importedItems.push(`• ${result.budgets} budgets imported`);
      }
      if (options.rules && result.rules && result.rules > 0) {
        importedItems.push(`• ${result.rules} categorization rules imported`);
      }
      if (options.preferences && result.preferences) {
        importedItems.push(`• Preferences imported`);
      }
      if (options.transactionHistory && result.historyEntries > 0) {
        importedItems.push(`• ${result.historyEntries} history entries imported`);
      }

      const message = importedItems.length > 0 
        ? `Selected data imported successfully!\n\n${importedItems.join('\n')}\n\nThe page will reload to reflect the changes.`
        : 'No data was imported. Please check your selections and file contents.';

      showAlert('success', message, 'Import Complete', { autoClose: false });
      
      if (importedItems.length > 0) {
        setTimeout(() => window.location.reload(), 4000);
      }
    } catch (error) {
      console.error('Failed to import data:', error);
      showAlert('error', 'Failed to import data. Please ensure you selected a valid Mo Money backup file and try again.');
    } finally {
      setIsImporting(false);
      setPendingImportData(null);
      setPendingFileName('');
    }
  };

  const handleCloseImportDialog = () => {
    setShowImportDialog(false);
    setPendingImportData(null);
    setPendingFileName('');
  };

  const handleExportSupportBundle = async () => {
    setIsExportingSupport(true);
    try {
      const supportBundle = await dataService.createSupportBundle();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `momoney-support-${timestamp}.json`;
      
      // Create and trigger download
      const blob = new Blob([supportBundle], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showAlert('success', 'Support bundle exported successfully! This file contains diagnostic information (no sensitive financial data).', 'Export Complete');
    } catch (error) {
      console.error('Failed to export support bundle:', error);
      showAlert('error', 'Failed to export support bundle. Please try again.');
    } finally {
      setIsExportingSupport(false);
    }
  };

  const handleScanAndRemoveDuplicates = async () => {
    setIsDeduping(true);
    try {
      const result = await dataService.cleanupExactDuplicates();
      if (result.removed > 0) {
        showAlert('success', `Removed ${result.removed} exact duplicate transaction(s).\nBefore: ${result.totalBefore}\nAfter: ${result.totalAfter}`, 'Duplicates Removed');
      } else {
        showAlert('info', 'No exact duplicates found.', 'Scan Complete');
      }
    } catch (error) {
      console.error('Failed to cleanup duplicates:', error);
      showAlert('error', 'Failed to scan/remove duplicates.');
    } finally {
      setIsDeduping(false);
    }
  };

  const handleLoadSampleData = async () => {
    const shouldLoad = await showConfirmation(
      'Load Sample Data?\n\n' +
      'This will add sample transactions for testing purposes.\n' +
      'Sample data includes transactions across different categories, accounts, and currencies.\n\n' +
      'Continue?',
      { 
        title: 'Load Sample Data',
        confirmText: 'Load Sample Data',
        cancelText: 'Cancel'
      }
    );
    
    if (!shouldLoad) return;
    
    setIsLoadingSampleData(true);
    try {
      await dataService.loadSampleData();
      showAlert('success', 'Sample data loaded successfully! The page will refresh to show the sample transactions.', 'Sample Data Loaded', { autoClose: false });
      setTimeout(() => window.location.reload(), 3000);
    } catch (error) {
      console.error('Failed to load sample data:', error);
      showAlert('error', 'Failed to load sample data. Please try again.');
    } finally {
      setIsLoadingSampleData(false);
    }
  };

  const handleViewExchangeRates = async () => {
    setShowExchangeRates(true);
    await loadExchangeRates();
  };

  const loadExchangeRates = async () => {
    setIsLoadingRates(true);
    try {
      const commonCurrencies = currencyExchangeService.getCommonCurrencies();
      const baseCurrency = preferences?.currency || 'USD';
      
      // Get rates for all common currencies from the base currency
      const rates: CurrencyExchangeRate[] = [];
      
      for (const targetCurrency of commonCurrencies) {
        if (targetCurrency !== baseCurrency) {
          const rate = await currencyExchangeService.getExchangeRate(baseCurrency, targetCurrency);
          if (rate) {
            rates.push(rate);
          }
        }
      }
      
      // Also get some reverse rates (other currencies to base)
      const otherBaseCurrencies = ['EUR', 'GBP', 'JPY'];
      for (const otherBase of otherBaseCurrencies) {
        if (otherBase !== baseCurrency) {
          const rate = await currencyExchangeService.getExchangeRate(otherBase, baseCurrency);
          if (rate) {
            rates.push(rate);
          }
        }
      }
      
      setExchangeRates(rates);
    } catch (error) {
      console.error('Failed to load exchange rates:', error);
      showAlert('error', 'Failed to load exchange rates. Please try again.');
    } finally {
      setIsLoadingRates(false);
    }
  };

  const handleSyncExchangeRates = async () => {
    setIsSyncingRates(true);
    try {
      // Clear stored rates to force fresh API calls
      currencyExchangeService.clearStoredRates();
      
      // Reload rates
      await loadExchangeRates();
      
      showAlert('success', 'Exchange rates synced successfully!');
    } catch (error) {
      console.error('Failed to sync exchange rates:', error);
      showAlert('error', 'Failed to sync exchange rates. Please check your internet connection and try again.');
    } finally {
      setIsSyncingRates(false);
    }
  };

  const formatRateAge = (date: Date): { text: string; className: string } => {
    const ageHours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
    
    if (ageHours < 2) {
      return { text: `${Math.floor(ageHours * 60)}m ago`, className: 'fresh' };
    } else if (ageHours < 24) {
      return { text: `${Math.floor(ageHours)}h ago`, className: 'fresh' };
    } else if (ageHours < 72) {
      return { text: `${Math.floor(ageHours / 24)}d ago`, className: 'stale' };
    } else {
      return { text: `${Math.floor(ageHours / 24)}d ago`, className: 'very-stale' };
    }
  };
  return (
    <div>
      <PageHeader>
        <h1>Settings</h1>
      </PageHeader>
      
      <Card>
        <h3>Azure OpenAI Configuration</h3>
        <p>Configure your Azure OpenAI settings for AI-powered transaction classification.</p>
        <div style={{ marginTop: '16px' }}>
          <div style={{ marginBottom: '12px' }}>
            <strong>Deployment:</strong> {deploymentInfo || 'Loading...'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Button 
              variant="outline" 
              onClick={handleTestConnection}
              disabled={isTestingConnection}
            >
              {isTestingConnection ? 'Testing...' : 'Test Connection'}
            </Button>
            {connectionTestResult === 'success' && (
              <span style={{ color: '#4CAF50', fontWeight: 500 }}>
                ✅ Connection successful!
              </span>
            )}
            {connectionTestResult === 'error' && (
              <span style={{ color: '#f44336', fontWeight: 500 }}>
                ❌ Connection failed. Please check your configuration.
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <h3>Application Preferences</h3>
        <p>Customize your experience with Mo Money.</p>
        
        {preferences && (
          <PreferencesForm>
            <div className="form-group">
              <label htmlFor="currency">Default Currency</label>
              <select 
                id="currency"
                value={preferences.currency} 
                onChange={(e) => handlePreferenceChange('currency', e.target.value)}
              >
                {userPreferencesService.getCurrencyOptions().map(option => (
                  <option key={option.value} value={option.value}>
                    {option.symbol} - {option.label} ({option.value})
                  </option>
                ))}
              </select>

            </div>
            
            <div className="form-group">
              <label htmlFor="dateFormat">Date Format</label>
              <select 
                id="dateFormat"
                value={preferences.dateFormat} 
                onChange={(e) => handlePreferenceChange('dateFormat', e.target.value)}
              >
                <option value="MM/dd/yyyy">MM/dd/yyyy (US format)</option>
                <option value="dd/MM/yyyy">dd/MM/yyyy (European format)</option>
                <option value="yyyy-MM-dd">yyyy-MM-dd (ISO format)</option>
              </select>
            </div>
            
            <div className="form-group">
              <label htmlFor="theme">Theme</label>
              <select 
                id="theme"
                value={preferences.theme} 
                onChange={(e) => handlePreferenceChange('theme', e.target.value as 'light' | 'dark' | 'auto')}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="auto">Auto (system preference)</option>
              </select>
            </div>
            
            <SaveButton 
              onClick={handleSavePreferences}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : '💾 Save Preferences'}
            </SaveButton>
          </PreferencesForm>
        )}
      </Card>

      <Card>
        <h3>Exchange Rates</h3>
        <p>View current exchange rates and sync with the latest data from external APIs.</p>
        
        <div style={{ marginTop: '16px' }}>
          <Button 
            onClick={handleViewExchangeRates}
            style={{ background: '#2196F3', borderColor: '#2196F3', color: 'white' }}
          >
            💱 View Exchange Rates
          </Button>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
            Shows current exchange rates for common currencies with age and source information.
          </div>
        </div>
      </Card>

      <Card>
        <h3>Data Management</h3>
        <p>Manage your transaction data and application state.</p>
        
        <div style={{ marginBottom: '20px' }}>
          <h4>📦 Backup & Restore</h4>
          <p>Export all your data to a structured backup file, or restore from a previous backup.</p>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px', alignItems: 'center' }}>
            <Button 
              onClick={handleExportData}
              disabled={isExporting}
              style={{ background: '#2196F3', borderColor: '#2196F3', color: 'white', minWidth: '140px' }}
            >
              {isExporting ? 'Exporting...' : '💾 Export Data'}
            </Button>

            <Button 
              onClick={handleExportToExcel}
              disabled={isExportingExcel}
              style={{ background: '#4CAF50', borderColor: '#4CAF50', color: 'white', minWidth: '140px' }}
            >
              {isExportingExcel ? 'Exporting...' : '📊 Export to Excel'}
            </Button>
            
            <label style={{ position: 'relative', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
              <Button 
                as="span"
                disabled={isImporting}
                style={{ background: '#2196F3', borderColor: '#2196F3', color: 'white', minWidth: '140px' }}
              >
                {isImporting ? 'Importing...' : '📁 Import Data'}
              </Button>
              <input
                type="file"
                accept=".json"
                onChange={handleImportData}
                style={{ 
                  position: 'absolute', 
                  left: 0, 
                  top: 0, 
                  width: '100%', 
                  height: '100%', 
                  opacity: 0, 
                  cursor: 'pointer' 
                }}
                disabled={isImporting}
              />
            </label>
          </div>
          
          <div style={{ marginTop: '12px', padding: '12px', background: '#e3f2fd', borderRadius: '6px', fontSize: '14px', color: '#1976d2' }}>
            <strong>💡 Tip:</strong> Regular backups help protect your financial data. Export files contain ALL your data including transactions, accounts, budgets, categories, rules, balance history, currency rates, and transfer matches. JSON format is structured for compatibility, while Excel format provides multiple sheets for easy analysis.
          </div>
          
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #eee' }}>
            <h4>🔧 Support & Diagnostics</h4>
            <p>Export diagnostic information for troubleshooting (contains no sensitive financial data).</p>
            
            <Button 
              onClick={handleExportSupportBundle}
              disabled={isExportingSupport}
              style={{ background: '#9C27B0', borderColor: '#9C27B0', color: 'white' }}
            >
              {isExportingSupport ? 'Exporting...' : '📋 Export Support Bundle'}
            </Button>
            
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
              Support bundles contain anonymized transaction samples, database health info, and system diagnostics - no sensitive financial data is included.
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4>📊 Sample Data</h4>
          <p>Load sample transactions for testing and demonstration purposes.</p>
          <Button 
            onClick={handleLoadSampleData} 
            disabled={isLoadingSampleData}
            style={{ background: '#4CAF50', borderColor: '#4CAF50', color: 'white' }}
          >
            {isLoadingSampleData ? 'Loading...' : '📊 Load Sample Data'}
          </Button>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
            Adds sample transactions with various categories, accounts, and currencies for testing.
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h4>🧹 Data Cleanup</h4>
          <p>Scan and remove exact duplicate transactions saved in your local database.</p>
          <Button onClick={handleScanAndRemoveDuplicates} disabled={isDeduping}>
            {isDeduping ? 'Scanning…' : '🧹 Scan & Remove Exact Duplicates'}
          </Button>
        </div>
        
        <DangerZone>
          <h4 style={{ color: '#f44336', margin: '0 0 12px 0' }}>⚠️ Danger Zone</h4>
          <WarningText>
            The following action will permanently delete ALL your transaction data, including:
          </WarningText>
          <ul style={{ color: '#f44336', marginLeft: '20px' }}>
            <li>All imported transactions</li>
            <li>All manually added transactions</li>
            <li>All categorization and notes</li>
            <li>All AI classifications and confidence scores</li>
          </ul>
          <WarningText>
            <strong>This action cannot be undone!</strong> Make sure to export your data first if you want to keep it.
          </WarningText>
          
          <ResetButton 
            onClick={() => setShowConfirmDialog(true)}
            disabled={isResetting}
          >
            {isResetting ? 'Resetting...' : '🗑️ Reset All Data'}
          </ResetButton>
        </DangerZone>
      </Card>

      {showExchangeRates && (
        <ExchangeRatesModal onClick={() => setShowExchangeRates(false)}>
          <ExchangeRatesContent onClick={(e) => e.stopPropagation()}>
            <div className="header-actions">
              <h3>💱 Exchange Rates</h3>
              <SyncButton 
                onClick={handleSyncExchangeRates}
                disabled={isSyncingRates || isLoadingRates}
              >
                {isSyncingRates ? 'Syncing...' : '🔄 Sync Now'}
              </SyncButton>
            </div>
            
            <div className={`status-info ${currencyExchangeService.getExchangeRateStatus().isStale ? 'stale' : ''}`}>
              {(() => {
                const status = currencyExchangeService.getExchangeRateStatus();
                return (
                  <>
                    <div className="status-item">
                      <span>Status:</span>
                      <span>
                        {status.isStale ? '⚠️ Rates may be stale' : '✅ Rates are fresh'}
                      </span>
                    </div>
                    <div className="status-item">
                      <span>Total stored rates:</span>
                      <span>{status.totalStoredRates}</span>
                    </div>
                    {status.lastSuccessfulFetch && (
                      <div className="status-item">
                        <span>Last successful fetch:</span>
                        <span>{status.lastSuccessfulFetch.toLocaleString()}</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {isLoadingRates ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ marginBottom: '12px' }}>🔄 Loading exchange rates...</div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  This may take a few moments to fetch rates from external APIs.
                </div>
              </div>
            ) : exchangeRates.length > 0 ? (
              <table className="rates-table">
                <thead>
                  <tr>
                    <th>Currency Pair</th>
                    <th>Exchange Rate</th>
                    <th>Last Updated</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {exchangeRates.map((rate) => {
                    const age = formatRateAge(rate.date);
                    return (
                      <tr key={`${rate.fromCurrency}-${rate.toCurrency}`}>
                        <td className="currency-pair">
                          {rate.fromCurrency} → {rate.toCurrency}
                        </td>
                        <td className="rate-value">
                          {rate.rate.toFixed(6)}
                        </td>
                        <td>
                          <div className={`age-info ${age.className}`}>
                            {age.text}
                          </div>
                          <div style={{ fontSize: '11px', color: '#999' }}>
                            {rate.date.toLocaleDateString()} {rate.date.toLocaleTimeString()}
                          </div>
                        </td>
                        <td>
                          <div className="source-info">
                            {rate.source}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="no-rates">
                <div style={{ marginBottom: '12px', fontSize: '18px' }}>📊</div>
                <div>No exchange rates available</div>
                <div style={{ fontSize: '14px', marginTop: '8px' }}>
                  Try syncing to fetch the latest rates from external APIs.
                </div>
              </div>
            )}

            <div className="buttons">
              <Button 
                variant="outline" 
                onClick={() => setShowExchangeRates(false)}
              >
                Close
              </Button>
            </div>
          </ExchangeRatesContent>
        </ExchangeRatesModal>
      )}

      {showConfirmDialog && (
        <ConfirmDialog onClick={() => setShowConfirmDialog(false)}>
          <ConfirmContent onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Confirm Data Reset</h3>
            <p>
              Are you absolutely sure you want to delete ALL transaction data? 
              This will remove everything and reset the application to its initial state.
            </p>
            <p style={{ color: '#f44336', fontWeight: 'bold' }}>
              This action is PERMANENT and cannot be undone!
            </p>
            <div className="buttons">
              <Button 
                variant="outline" 
                onClick={() => setShowConfirmDialog(false)}
                disabled={isResetting}
              >
                Cancel
              </Button>
              <ResetButton 
                onClick={handleResetData}
                disabled={isResetting}
              >
                {isResetting ? 'Resetting...' : 'Yes, Delete Everything'}
              </ResetButton>
            </div>
          </ConfirmContent>
        </ConfirmDialog>
      )}

      <ImportSelectionDialog
        isOpen={showImportDialog}
        onClose={handleCloseImportDialog}
        onImport={handleImportWithOptions}
        importData={pendingImportData}
        fileName={pendingFileName}
      />
    </div>
  );
};

export default Settings;
