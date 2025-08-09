import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { PageHeader, Card, Button } from '../../styles/globalStyles';
import { defaultConfig } from '../../config/appConfig';
import { dataService } from '../../services/dataService';
import { userPreferencesService } from '../../services/userPreferencesService';
import { AccountsManagement } from './AccountsManagement';
import { UserPreferences } from '../../types';

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
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const prefs = await userPreferencesService.getPreferences();
      setPreferences(prefs);
    } catch (error) {
      console.error('Failed to load preferences:', error);
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
      alert('✅ Preferences saved successfully!');
    } catch (error) {
      console.error('Failed to save preferences:', error);
      alert('❌ Failed to save preferences. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetData = async () => {
    setIsResetting(true);
    try {
      await dataService.clearAllData();
      alert('✅ All data has been successfully reset. The page will reload to reflect the changes.');
      window.location.reload(); // Reload to reset the app state
    } catch (error) {
      console.error('Failed to reset data:', error);
      alert('❌ Failed to reset data. Please try again.');
    } finally {
      setIsResetting(false);
      setShowConfirmDialog(false);
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
            <strong>Current Endpoint:</strong> {defaultConfig.azure.openai.endpoint}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <strong>Deployment:</strong> {defaultConfig.azure.openai.deploymentName}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <strong>API Version:</strong> {defaultConfig.azure.openai.apiVersion}
          </div>
          <Button variant="outline">Test Connection</Button>
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
              <div className="description">
                All amounts will be displayed in this currency. Foreign transactions will be automatically converted using daily exchange rates.
              </div>
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
        <AccountsManagement />
      </Card>

      <Card>
        <h3>Data Management</h3>
        <p>Manage your transaction data and application state.</p>
        
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
    </div>
  );
};

export default Settings;
