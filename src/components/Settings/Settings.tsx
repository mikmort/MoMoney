import React, { useState } from 'react';
import styled from 'styled-components';
import { PageHeader, Card, Button } from '../../styles/globalStyles';
import { defaultConfig } from '../../config/appConfig';
import { dataService } from '../../services/dataService';
import { azureOpenAIService } from '../../services/azureOpenAIService';

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

const Settings: React.FC = () => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    
    try {
      const isConnected = await azureOpenAIService.testConnection();
      setConnectionStatus(isConnected ? 'success' : 'error');
      
      if (isConnected) {
        alert('✅ Azure OpenAI connection successful! Ready for AI-powered classification.');
      } else {
        alert('❌ Azure OpenAI connection failed. Please check your configuration.');
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      setConnectionStatus('error');
      alert('❌ Connection test failed. Please check your Azure OpenAI configuration.');
    } finally {
      setTestingConnection(false);
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
          <Button 
            variant="outline" 
            onClick={handleTestConnection}
            disabled={testingConnection}
            style={{
              backgroundColor: connectionStatus === 'success' ? '#e8f5e8' : 
                             connectionStatus === 'error' ? '#ffebee' : undefined,
              borderColor: connectionStatus === 'success' ? '#4caf50' : 
                          connectionStatus === 'error' ? '#f44336' : undefined,
              color: connectionStatus === 'success' ? '#2e7d32' : 
                    connectionStatus === 'error' ? '#c62828' : undefined
            }}
          >
            {testingConnection ? '🔄 Testing...' : 
             connectionStatus === 'success' ? '✅ Connected' :
             connectionStatus === 'error' ? '❌ Failed' : 'Test Connection'}
          </Button>
        </div>
      </Card>

      <Card>
        <h3>Application Preferences</h3>
        <p>Customize your experience with Mo Money.</p>
        <ul>
          <li>Currency preferences</li>
          <li>Date format settings</li>
          <li>Notification preferences</li>
          <li>Auto-categorization settings</li>
          <li>Default account selection</li>
        </ul>
      </Card>

      <Card>
        <h3>Account Management</h3>
        <p>Manage your connected accounts and data.</p>
        <ul>
          <li>Connected bank accounts</li>
          <li>Data export/import</li>
          <li>Privacy settings</li>
          <li>Account deletion</li>
        </ul>
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
